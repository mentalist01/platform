import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startDay } from './start-day.mjs';
import { ShareBridge } from './share-bridge.mjs';
import { ForegroundWindowReader, OfficeFollower } from './office-follow.mjs';
import { ObsClient, SCENES, INPUTS } from './obs.mjs';
import { atomicJson, readJson, ownedRecording } from './storage.mjs';
import { recordingSegments, concatList } from './segments.mjs';
import { RecorderEngine } from './engine.mjs';
import { importRecoveredRecordings } from './recovery-inbox.mjs';
import { RutubeUploader, privateVideo, videoReady } from './rutube.mjs';
import { writableRecordingDirectory, recordingDrives, setupFingerprint, assertSetupIdle } from './recording-storage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = process.env.IVAN100_RECORDER_HOME || path.join(os.homedir(), 'Ivan100Recorder');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'state.json');
const state = readJson(file, { config: { platformUrl: 'https://ivan100.ru', autoUpload: false, configured: false }, jobs: {} });
let recordDirectory = path.resolve(state.config.recordDirectory || path.join(os.homedir(), 'Videos', 'Ivan100 Lessons'));
const save = () => atomicJson(file, state);
for (const job of Object.values(state.jobs)) {
  if (job.status === 'uploading') {
    job.status = 'error'; job.error = 'Загрузка прервалась при закрытии пульта. Нажмите «Продолжить загрузку»: помощник проверит уже загруженный ролик.'; save();
  }
}
const runtime = readJson(path.join(here, 'runtime.json'), {});
const obs = new ObsClient(runtime.obs ? { executable: runtime.obs } : {});
const uploader = new RutubeUploader(directory);
const localKey = crypto.randomBytes(32).toString('base64url');
let error = ''; let obsStatus = null; let chain = Promise.resolve(); let queueBusy = false; let uploadingId = '';
let sourceWarnings = []; let lastSourceCheck = 0;
const serialize = (fn) => { const next = chain.then(fn); chain = next.catch(() => {}); return next; };
const ready = () => Boolean(state.config.recordDirectory && state.config.configured && state.config.platform && state.config.telemost && state.config.mic);
const setupIdle = async () => assertSetupIdle({ active: engine.active(), uploadingId, queueBusy, outputActive: obs.connected && (await obs.status()).outputActive });
const api = async (route, body, pairing = false) => {
  const response = await fetch(`${state.config.platformUrl}/api/desktop-recorder${route}`, {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json',
      ...(pairing ? {} : { Authorization: `Bearer ${state.config.token}` }) }, body: JSON.stringify(route === '/poll' ? { ...body, ready: ready() && !!obsStatus && !sourceWarnings.length } : body),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error('На платформе ещё не установлен модуль записи на компьютере');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Платформа: ${response.status}`);
  return result;
};
const engine = new RecorderEngine({ obs, state, save, api, recordDirectory, ready });
const run = (executable, args) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  child.on('error', () => reject(new Error('Не найден ffmpeg. Исходная запись сохранена в MKV.')));
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Не удалось подготовить MP4 (${code}). Исходная запись сохранена.`)));
});
async function prepare(job) {
  if (job.mp4 && fs.existsSync(job.mp4)) return;
  if (!job.file || !fs.existsSync(job.file)) throw new Error('Файл записи не найден');
  const output = path.join(path.dirname(job.file), `${job.title.replace(/[<>:"/\\|?*]/g, '-')}-${job.id}.mp4`);
  const temporary = `${output}.part.mp4`;
  const segments = recordingSegments(job, state.jobs, recordDirectory);
  const list = path.join(recordDirectory, `lesson-${job.id}.concat.txt`);
  if (segments.length > 1) fs.writeFileSync(list, concatList(segments));
  const input = segments.length > 1 ? ['-f', 'concat', '-safe', '0', '-i', list] : ['-i', job.file];
  await run(runtime.ffmpeg || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', temporary]);
  fs.renameSync(temporary, output); job.mp4 = output; save();
}
async function publish(job) {
  if (job.excludeFromUpload) throw new Error('Этот исходник исключён из загрузки. Используйте подготовленную запись урока.');
  const video = privateVideo(job.url);
  if (!video) throw new Error('Нужна полная закрытая ссылка Rutube с ключом ?p=');
  if (!await videoReady(video.url)) {
    job.status = 'processing'; save();
    if (!job.processingReported) { await engine.report(job, 'processing'); job.processingReported = true; save(); }
    return;
  }
  await engine.report(job, 'ready', { url: video.url, ...(job.durationMs ? { durationMs: job.durationMs } : {}) });
  job.status = 'ready'; job.error = ''; save();
}
async function upload(job) {
  if (job.excludeFromUpload) throw new Error('Этот исходник исключён из загрузки. Используйте подготовленную запись урока.');
  if (uploadingId) throw new Error('Предыдущая загрузка ещё идёт');
  uploadingId = job.id;
  try {
    await prepare(job);
    job.status = 'uploading'; job.uploadPhase = ''; job.error = ''; save();
    await engine.report(job, 'uploading');
    await uploader.upload(job, save);
    await engine.report(job, 'processing');
    await publish(job);
  } catch (failure) {
    job.status = 'error'; job.error = failure.message; save();
    await engine.report(job, 'error', { error: job.error }).catch(() => {});
  } finally { uploadingId = ''; }
}
async function queue() {
  if (queueBusy) return; queueBusy = true;
  try {
    importRecoveredRecordings({ directory, recordDirectory, state, save });
    for (const job of Object.values(state.jobs)) {
      if (job.excludeFromUpload) continue;
      if (job.status === 'saved') {
        try { await prepare(job); }
        catch (failure) { job.status = 'error'; job.error = failure.message; save(); continue; }
        if (state.config.autoUpload && !job.local) await upload(job);
      }
      if (job.status === 'processing' && job.url) await publish(job);
    }
  } catch (failure) { error = failure.message; }
  finally { queueBusy = false; }
}
const shareBridge = new ShareBridge({ obs, api, active: () => engine.active(), enabled: () => state.config.autoFollowShare !== false });
const foregroundReader = new ForegroundWindowReader();
const officeFollower = new OfficeFollower({ obs, reader: foregroundReader, config: () => state.config,
  shareActive: () => Boolean(shareBridge.offer) });
process.on('exit', () => foregroundReader.stop());
// Prepared replacements require a deliberate click; never import or publish
// them while polling the queue. The original files remain untouched.
const recoveryDrafts = () => {
  const drafts = readJson(path.join(directory, 'recovery-drafts.json'), []);
  if (!Array.isArray(drafts)) return [];
  return drafts.filter(draft => /^[a-f0-9-]{36}$/i.test(draft.id || '') && !state.jobs[draft.id]
    && state.jobs[draft.previousId]?.occurrence?.key && privateVideo(draft.url))
    .map(({ id, previousId, url, durationMs, note }) => ({ id, previousId, url, durationMs,
      title: state.jobs[previousId].title, note: String(note || '') }));
};
const publicState = () => ({
  config: { ...state.config, token: undefined }, paired: Boolean(state.config.token), ready: ready() && !!obsStatus && !sourceWarnings.length,
  obs: obsStatus, error, sourceWarnings, recordDirectory, uploadingId,
  shareMessage: shareBridge.message || '',
  officeMessage: officeFollower.message,
  recoveryDrafts: recoveryDrafts(),
  testVerified: state.config.testFingerprint === setupFingerprint(state.config),
  jobs: Object.values(state.jobs).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50),
});
async function body(req) {
  let content = ''; for await (const chunk of req) { content += chunk; if (content.length > 70000) throw new Error('Запрос слишком большой'); }
  return content ? JSON.parse(content) : {};
}
function enableWebsocket() {
  const configFile = path.join(obs.configDir, 'plugin_config', 'obs-websocket', 'config.json');
  const config = readJson(configFile, {});
  if (!config.server_enabled) {
    if (fs.existsSync(configFile)) fs.copyFileSync(configFile, `${configFile}.ivan100-backup-${Date.now()}`);
    config.server_enabled = true; config.auth_required = true;
    config.server_port ||= 4455; config.server_password ||= crypto.randomBytes(24).toString('base64url');
    atomicJson(configFile, config);
  }
}
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const host = req.headers.host;
  if (!['127.0.0.1:18765', 'localhost:18765'].includes(host)) return json(res, 403, { error: 'Forbidden host' });
  if (req.headers.origin && !['http://127.0.0.1:18765', 'http://localhost:18765'].includes(req.headers.origin)) return json(res, 403, { error: 'Forbidden origin' });
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'");
      return res.end(fs.readFileSync(path.join(here, 'panel.html'), 'utf8').replace('__LOCAL_KEY__', localKey));
    }
    if (req.method === 'GET' && req.url === '/share-view') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src blob:; connect-src 'self'; frame-ancestors 'none'");
      return res.end(fs.readFileSync(path.join(here, 'share-view.html'), 'utf8'));
    }
    if (req.url === '/share-source') {
      if (req.headers['x-share-key'] !== shareBridge.key) return json(res, 403, { error: 'Forbidden' });
      if (req.method === 'GET') return json(res, 200, shareBridge.offer);
      if (req.method !== 'POST') return json(res, 405, {});
      await shareBridge.receive(await body(req)); return json(res, 200, {});
    }
    if (req.headers['x-recorder-key'] !== localKey) return json(res, 403, { error: 'Откройте пульт заново' });
    if (req.method === 'GET' && req.url === '/state') return json(res, 200, publicState());
    if (req.method === 'GET' && req.url === '/preview') return json(res, 200, { image: await obs.preview() });
    if (req.method === 'GET' && req.url === '/choices') return json(res, 200, await obs.choices());
    if (req.method === 'GET' && req.url === '/storage') return json(res, 200, { drives: await recordingDrives(), recordDirectory: state.config.recordDirectory || '' });
    if (req.method === 'GET' && req.url.startsWith('/test-video/')) {
      const job = state.jobs[req.url.slice('/test-video/'.length)];
      if (!job?.local || job.manual || !job.testFingerprint || !job.mp4 || !fs.existsSync(job.mp4)) throw new Error('Пробная запись ещё не готова');
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(job.mp4).size });
      const stream = fs.createReadStream(job.mp4); stream.on('error', () => res.destroy()); stream.pipe(res); return;
    }
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });
    const payload = await body(req);
    if (req.url === '/shutdown') {
      if (engine.active() || uploadingId || queueBusy || (obs.connected && (await obs.status()).outputActive)) throw new Error('Сначала дождитесь окончания записи и загрузки');
      await uploader.context?.close(); save();
      json(res, 200, { ok: true });
      server.close(() => process.exit(0)); return;
    }
    if (req.url === '/rutube-login') {
      if (uploadingId) throw new Error('Дождитесь текущей загрузки, затем откройте вход в Rutube');
      await uploader.login(); return json(res, 200, { ok: true });
    }
    if (req.url === '/rutube-check') {
      if (!await uploader.signedIn()) throw new Error('Войдите в Rutube в окне помощника, затем повторите проверку');
      state.config.rutubeVerifiedAt = Date.now(); save(); return json(res, 200, { ok: true });
    }
    if (req.url === '/upload') {
      const job = state.jobs[payload.id];
      if (!job || job.excludeFromUpload || !['saved', 'error'].includes(job.status) || !job.file) throw new Error('Нет готовой записи');
      if (uploadingId) throw new Error('Предыдущая загрузка ещё идёт');
      void upload(job); return json(res, 200, { ok: true });
    }
    await serialize(async () => {
      if (req.url === '/recover-file') {
        // Import a deliberately prepared replacement, never the unfinished
        // current output or an arbitrary path from the request.
        if (!/^[a-f0-9-]{36}$/i.test(payload.id || '')) throw new Error('Некорректный номер записи');
        const previous = state.jobs[payload.previousId];
        if (!previous?.occurrence?.key || previous.local || ['starting', 'recording', 'stopping'].includes(previous.status)) throw new Error('Выберите завершённый урок');
        if (state.jobs[payload.id]) throw new Error('Запись уже восстановлена');
        const recording = ownedRecording(recordDirectory, payload.id);
        if (!fs.existsSync(recording) || !fs.statSync(recording).size) throw new Error('Подготовленный файл не найден');
        const video = privateVideo(payload.url);
        if (!video) throw new Error('Нужна закрытая ссылка подготовленного видео');
        const recovered = await api('/recover', { id: previous.remoteJobId || previous.id, recoveryId: payload.id });
        const job = { ...recovered, file: recording, url: video.url, status: 'processing', createdAt: Date.now(),
          ...(Number.isFinite(payload.durationMs) && payload.durationMs > 0 && payload.durationMs <= 18000000 ? { durationMs: payload.durationMs } : {}) };
        state.jobs[job.id] = job; save(); await prepare(job); await publish(job);
      } else if (req.url === '/start-day') {
        await setupIdle(); enableWebsocket();
        await startDay({ config: state.config, obs, checkDirectory: writableRecordingDirectory,
          platform: () => api('/start-day', { ready: true }), save });
        obsStatus = await obs.status(); sourceWarnings = []; lastSourceCheck = 0;
        await shareBridge.setup();
      } else if (req.url === '/pair') {
        await setupIdle();
        const result = await api('/pair', { code: payload.code, name: os.hostname() }, true);
        state.config.token = result.token; state.config.deviceId = result.deviceId; save();
      } else if (req.url === '/setup') {
        await setupIdle();
        if (!state.config.recordDirectory) throw new Error('Сначала выберите папку для видео в первом шаге');
        enableWebsocket(); await obs.setup(recordDirectory);
      } else if (req.url === '/configure') {
        await setupIdle();
        const choices = await obs.choices();
        for (const key of ['platform', 'telemost', 'mic', 'screen']) {
          if (!choices[key].some((item) => item.itemValue === payload[key] && item.itemEnabled)) throw new Error(`Выберите доступный источник: ${key}`);
        }
        await obs.configure(payload);
        Object.assign(state.config, { platform: payload.platform, telemost: payload.telemost, mic: payload.mic, screen: payload.screen, configured: true }); save(); lastSourceCheck = 0;
      } else if (req.url === '/storage') {
        await setupIdle();
        const selected = writableRecordingDirectory(payload.directory);
        state.config.recordDirectory = selected; recordDirectory = selected; engine.recordDirectory = selected; save();
      } else if (req.url === '/test-confirm') {
        const job = state.jobs[payload.id];
        if (!job?.local || job.manual || !job.mp4 || job.testFingerprint !== setupFingerprint(state.config)) throw new Error('Сделайте пробную запись с текущими настройками и прослушайте её');
        state.config.testFingerprint = job.testFingerprint; state.config.testVerifiedAt = Date.now(); save();
      } else if (req.url === '/complete-setup') {
        if (!ready() || !state.config.token || state.config.testFingerprint !== setupFingerprint(state.config) || !state.config.rutubeVerifiedAt || !state.config.autoUpload) throw new Error('Пройдите все шаги, подтвердите проверку записи и включите автозагрузку');
        state.config.setupCompleted = true; save();
      } else if (req.url === '/scene') {
        await obs.select(payload.mode, payload.window || state.config.program);
        if (payload.mode === 'window' && payload.window) { state.config.program = payload.window; save(); }
      } else if (req.url === '/program') {
        const choices = await obs.choices();
        if (!choices.platform.some((item) => item.itemEnabled && item.itemValue === payload.window)) throw new Error('Выберите открытое окно программы');
        state.config.program = payload.window; save();
        if (obsStatus?.scene === 'IVAN100 — Программа') await obs.select('window', payload.window);
      } else if (req.url === '/widget') {
        const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'hotkeys.ps1')], { detached: true, stdio: 'ignore', windowsHide: true }); child.unref();
      } else if (req.url === '/auto-follow') {
        state.config.autoFollowShare = payload.enabled === true; save();
        if (payload.enabled) await obs.select('platform');
      } else if (req.url === '/auto-office') {
        if (payload.enabled === true && !(await obs.call('GetInputList')).inputs.some(input => input.inputName === INPUTS.office)) throw new Error('Перед уроком нажмите «Начать сегодняшний день», чтобы добавить источник LibreOffice.');
        state.config.autoOffice = payload.enabled === true; save();
        if (payload.enabled || (await obs.status()).scene === SCENES.office) await obs.select('platform');
      } else if (req.url === '/auto-upload') {
        state.config.autoUpload = payload.enabled === true; save();
      } else if (req.url === '/test-start') {
        if (!ready()) throw new Error('Сначала выберите окно платформы, источник звука разговора и микрофон');
        await engine.start({ id: crypto.randomUUID(), title: 'Проверка записи', local: true, testFingerprint: setupFingerprint(state.config), cutoffAt: Date.now() + 60000 });
      } else if (req.url === '/manual-start') {
        if (!ready()) throw new Error('Сначала выберите окно платформы, источник звука разговора и микрофон');
        await engine.startForCurrentLesson();
      } else if (req.url === '/test-stop') {
        const job = engine.active();
        if (!job?.local || job.manual || !job.testFingerprint) throw new Error('Сейчас пробная запись не идёт');
        await engine.stop(job);
      } else if (req.url === '/stop') {
        const job = engine.active(); if (!job) throw new Error('Сейчас запись не идёт');
        await engine.stop(job);
      } else if (req.url === '/retry-start') {
        const job = state.jobs[payload.id];
        if (!job || job.file || job.status !== 'error' || job.cutoffAt <= Date.now()) throw new Error('Эту запись нельзя перезапустить');
        await engine.start(job);
      } else if (req.url === '/attach') {
        const job = state.jobs[payload.id];
        if (job?.excludeFromUpload) throw new Error('Этот исходник исключён из загрузки. Используйте подготовленную запись урока.');
        if (!job || !job.file || ['starting', 'recording', 'stopping'].includes(job.status)) throw new Error('Запись ещё не закончена');
        const video = privateVideo(payload.url); if (!video) throw new Error('Вставьте полную ссылку «только по ссылке», включая ?p=');
        job.url = video.url; job.status = 'processing'; job.error = ''; save(); await publish(job);
      } else if (req.url === '/open-file') {
        const job = state.jobs[payload.id]; const target = job?.mp4 || job?.file;
        if (!target || !fs.existsSync(target)) throw new Error('Файл не найден');
        const child = spawn('explorer.exe', ['/select,', target], { detached: true, stdio: 'ignore', windowsHide: true }); child.unref();
      } else throw new Error('Неизвестная команда');
    });
    error = ''; json(res, 200, { ok: true });
  } catch (failure) { json(res, 400, { error: failure.message }); }
});
server.on('error', (failure) => { console.error(failure.code === 'EADDRINUSE' ? 'Пульт уже запущен' : failure.message); process.exit(1); });
server.listen(18765, '127.0.0.1', () => console.log('Пульт: http://127.0.0.1:18765'));
let ticking = false;
setInterval(() => {
  if (ticking) return; ticking = true;
  void serialize(async () => {
    try {
      await engine.tick();
      if (ready() || obs.connected) obsStatus = await obs.status();
      if (ready() && Date.now() - lastSourceCheck > 10000) {
        const choices = await obs.choices();
        sourceWarnings = [];
        for (const [key, label] of [['platform', 'Окно платформы'], ['telemost', 'Звук разговора'], ['mic', 'Микрофон']]) {
          const selected = key === 'telemost' ? (obs.audioWindow || state.config[key]) : state.config[key];
          if (!choices[key].some((item) => item.itemEnabled && item.itemValue === selected)) sourceWarnings.push(`${label}: источник недоступен. Откройте его и проверьте выбор в настройках.`);
        }
        lastSourceCheck = Date.now();
      }
      error = '';
    } catch (failure) { error = failure.message; obsStatus = null; }
  }).finally(() => { ticking = false; void queue(); });
}, 2500);

let followingSources = false;
setInterval(() => {
  if (followingSources) return; followingSources = true;
  void (async () => {
    try { await shareBridge.tick(); }
    catch (error) { shareBridge.message = `Автовыбор демонстрации: ${error.message}`; }
    if (obsStatus) {
      try { await officeFollower.tick(); }
      catch (error) { officeFollower.message = `Автовыбор LibreOffice: ${error.message}`; }
    } else foregroundReader.stop();
  })().finally(() => { followingSources = false; });
}, 1000);
