import http from 'node:http';
import { RecorderUpdater } from './updater.mjs';
import { LessonArchive } from './archive.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startDay } from './start-day.mjs';
import { ShareBridge } from './share-bridge.mjs';
import { ForegroundWindowReader, OfficeFollower } from './office-follow.mjs';
import { ObsClient, SCENES, INPUTS, PYTHON_SCENES } from './obs.mjs';
import { pythonCaptureConfig, pythonCaptureReason, configurePythonCapture, PythonPreviewSession } from './python-capture.mjs';
import { atomicJson, readJson, ownedRecording } from './storage.mjs';
import { recordingSegments, concatList } from './segments.mjs';
import { RecorderEngine } from './engine.mjs';
import { startPythonTheory, publishPythonTheory } from './python-theory.mjs';
import { editTimeline, approveTimeline, finalizeTimeline, timelineDuration } from './python-timeline.mjs';
import { PythonEditMedia, sendPreview } from './python-edit-media.mjs';
import { startMockReview, publishMockReview } from './mock-review.mjs';
import { enterFallback } from './fallback.mjs';
import { importRecoveredRecordings } from './recovery-inbox.mjs';
import { RutubeUploader, privateVideo, videoReady } from './rutube.mjs';
import { recorderRuntime, diagnosticLog } from './watchdog.mjs';
import { writableRecordingDirectory, recordingDrives, setupFingerprint, assertSetupIdle } from './recording-storage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = process.env.IVAN100_RECORDER_HOME || path.join(os.homedir(), 'Ivan100Recorder');
fs.mkdirSync(directory, { recursive: true });
let runtimeWatchdog;
process.on('uncaughtExceptionMonitor', (failure, origin) => diagnosticLog(directory, 'fatal-error', `${origin}: ${failure.message}`));
process.on('exit', code => diagnosticLog(directory, 'service-exit', `code=${code}`));
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
const pythonPreviewSession = new PythonPreviewSession({ obs });
const uploader = new RutubeUploader(directory);
const localKey = crypto.randomBytes(32).toString('base64url');
let error = ''; let obsStatus = null; let chain = Promise.resolve(); let queueBusy = false; let uploadingId = '';
let recordingControlRevision = 0;
let sourceWarnings = []; let lastSourceCheck = 0;
let pythonSourceChoices;
const serialize = (fn) => { const next = chain.then(fn); chain = next.catch(() => {}); return next; };
const ready = () => Boolean(state.config.recordDirectory && state.config.configured && state.config.platform && state.config.telemost && state.config.mic);
const setupIdle = async () => {
  if (editMedia?.work || editMedia?.sourceWork.size) throw new Error('Дождитесь подготовки монтажа Python');
  if (archive?.work || archive?.setup || archive?.submitting) throw new Error('Дождитесь окончания обработки архива или поставьте её на паузу');
  return assertSetupIdle({ active: engine.active(), uploadingId, queueBusy, outputActive: obs.connected && (await obs.status()).outputActive });
};
let updater; let pendingUpdate; let archive;
const api = async (route, body, pairing = false) => {
  const response = await fetch(`${state.config.platformUrl}/api/desktop-recorder${route}`, {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json',
      ...(pairing ? {} : { Authorization: `Bearer ${state.config.token}` }) }, body: JSON.stringify(route === '/poll' ? { ...body, ready: !updater?.busy && ready() && !!obsStatus && !sourceWarnings.length, ...updater?.info(Boolean(engine.active() || uploadingId || queueBusy || obsStatus?.outputActive || archive?.work || archive?.setup)) } : body),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw Object.assign(new Error('Платформа не отвечает корректно'), { status: response.status });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || `Платформа: ${response.status}`), { status: response.status });
  if (route === '/poll') pendingUpdate = result.updateRequest;
  return result;
};
const engine = new RecorderEngine({ obs, state, save, api, recordDirectory, ready });
const editMedia = new PythonEditMedia({ ffmpeg: runtime.ffmpeg || 'ffmpeg', root: path.join(directory, 'python-editor-cache') });
const finalizePython = async job => {
  if (!job?.pythonTimeline || job.pythonTimeline.finalized || !job.file) return;
  finalizeTimeline(job.pythonTimeline, await editMedia.duration(job, path.dirname(job.file))); save();
};
updater = new RecorderUpdater({ directory, here, config: () => state.config, assertIdle: setupIdle,
  report: () => api('/poll', {}),
  shutdown: async () => {
    await pythonPreviewSession.release();
    runtimeWatchdog?.suspend('update');
    await uploader.context?.close().catch(() => {}); foregroundReader.stop(); save();
    server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1000);
  },
});
const run = (executable, args) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  child.on('error', () => reject(new Error('Не найден ffmpeg. Исходная запись сохранена в MKV.')));
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Не удалось подготовить MP4 (${code}). Исходная запись сохранена.`)));
});
async function prepare(job) {
  if (job.pythonTimeline) {
    if (!job.pythonTimeline.approved) throw new Error('Сначала проверьте монтаж и нажмите «Выложить в изучение Python»');
    if (job.mp4 && job.renderedRevision === job.pythonTimeline.revision && fs.existsSync(job.mp4)) return;
    const output = path.join(path.dirname(job.file), `python-edit-${job.id}-r${job.pythonTimeline.revision}.mp4`);
    await editMedia.exclusive(job, () => editMedia.render(job, job.pythonTimeline.clips, path.dirname(job.file), output));
    job.mp4 = output; job.renderedRevision = job.pythonTimeline.revision; job.durationMs = Math.round(timelineDuration(job.pythonTimeline) * 1000); save(); return;
  }
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
const retryPublication = failure => failure.status >= 500 || ['TypeError', 'TimeoutError', 'AbortError'].includes(failure.name);
async function publish(job) {
  if (job.pythonTimeline && !job.pythonTimeline.approved) throw new Error('Сначала подтвердите монтаж Python');
  if (job.excludeFromUpload) throw new Error('Этот исходник исключён из загрузки. Используйте подготовленную запись урока.');
  if (job.mockReview) return publishMockReview(job, { api, ready: videoReady, save });
  if (job.pythonTheory) return publishPythonTheory(job, { api, ready: videoReady, save });
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
  if (job.pythonTimeline && !job.pythonTimeline.approved) throw new Error('Сначала проверьте монтаж и нажмите «Выложить в изучение Python»');
  if (job.excludeFromUpload) throw new Error('Этот исходник исключён из загрузки. Используйте подготовленную запись урока.');
  if (uploadingId) throw new Error('Предыдущая загрузка ещё идёт');
  uploadingId = job.id;
  try {
    await prepare(job);
    job.status = 'uploading'; job.uploadPhase = ''; job.error = ''; save();
    await engine.report(job, 'uploading').catch(() => {});
    if (!job.url) await uploader.upload(job, save);
    await engine.report(job, 'processing').catch(() => {});
    await publish(job);
  } catch (failure) {
    job.status = job.url && retryPublication(failure) ? 'processing' : 'error'; job.error = failure.message; save();
    await engine.report(job, 'error', { error: job.error }).catch(() => {});
  } finally { uploadingId = ''; }
}
async function queue() {
  if (queueBusy || updater.busy || uploadingId || editMedia.work || editMedia.sourceWork.size || archive?.work || archive?.submitting) return; queueBusy = true;
  try {
    importRecoveredRecordings({ directory, recordDirectory, state, save });
    for (const job of Object.values(state.jobs)) {
      if (job.excludeFromUpload) continue;
      if (job.pythonTimeline && !job.pythonTimeline.approved) {
        if (job.status === 'saved' && !job.pythonTimeline.finalized) {
          try { await finalizePython(job); } catch (failure) { job.error = failure.message; save(); }
        }
        continue;
      }
      if (job.status === 'saved') {
        try { await prepare(job); }
        catch (failure) { job.status = 'error'; job.error = failure.message; save(); continue; }
        if (job.pythonTheory || job.mockReview || (state.config.autoUpload && !job.local)) await upload(job);
      }
      if (job.status === 'processing' && job.url && Date.now() >= (job.nextPublishAt || 0)) {
        job.nextPublishAt = Date.now() + 30000; save();
        try { await publish(job); }
        catch (failure) { job.status = retryPublication(failure) ? 'processing' : 'error'; job.error = failure.message; save(); }
      }
    }
  } catch (failure) { error = failure.message; }
  finally { queueBusy = false; }
}
const shareBridge = new ShareBridge({ obs, api, active: () => engine.active(), enabled: () => !engine.active()?.pythonTheory && !engine.active()?.mockReview && !engine.active()?.fallbackMode && state.config.autoFollowShare !== false });
const foregroundReader = new ForegroundWindowReader();
const officeFollower = new OfficeFollower({ obs, reader: foregroundReader, config: () => state.config,
  shareActive: () => Boolean(shareBridge.offer) });
process.on('exit', () => foregroundReader.stop());
archive = new LessonArchive({ directory, recordDirectory: () => state.config.recordDirectory,
  topicSync: payload => api('/archive/lesson-topic',payload),
  platformUrl: () => state.config.platformUrl,
  jobs: () => Object.values(state.jobs), ffmpeg: runtime.ffmpeg || 'ffmpeg',
  isBusy: () => Boolean(engine.active() || obsStatus?.outputActive || uploadingId || queueBusy || updater.busy),
  prepareMaterial: async () => {
    let result;
    try { result = await api('/archive/status', {}); }
    catch (error) {
      if (error.message === 'Not found') throw new Error('На платформе ещё не установлено добавление материалов из архива. Пока можно сохранить MP4 на компьютере.');
      if (error instanceof TypeError || error.name === 'TimeoutError') throw new Error('Платформа сейчас недоступна. Попробуйте после восстановления сайта или сохраните MP4 на компьютере.');
      throw error;
    }
    if (!result.available || result.destination !== 'teacher-library' || !result.teacherId) throw new Error('На платформе ещё не установлено добавление материалов из архива');
    return result;
  },
  materialPublisher: {
    upload: async (clip, persist) => {
      if (uploadingId || queueBusy) throw new Error('Предыдущая загрузка ещё идёт');
      uploadingId = clip.id;
      try { await uploader.upload(clip, persist); } finally { uploadingId = ''; }
    },
    ready: videoReady,
    attach: payload => api('/archive/material', payload),
  },
  publishClip: async (clip, persist) => {
    if (uploadingId || queueBusy) throw new Error('Предыдущая загрузка ещё идёт');
    uploadingId = clip.id; clip.status = 'uploading'; clip.error = ''; persist();
    try {
      if (!clip.url) await uploader.upload(clip, persist);
      clip.status = await videoReady(clip.url) ? 'ready' : 'processingVideo'; persist();
    } catch (failure) { clip.status = 'error'; clip.error = failure.message; persist(); }
    finally { uploadingId = ''; }
  },
});
void archive.detectPython().catch(() => {});
process.on('exit', () => archive.close());
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
const publicTimeline = timeline => timeline ? { ...timeline, history: undefined, future: undefined, canUndo: Boolean(timeline.history.length), canRedo: Boolean(timeline.future?.length) } : undefined;
const publicState = () => ({
  config: { ...state.config, token: undefined }, paired: Boolean(state.config.token), ready: ready() && !!obsStatus && !sourceWarnings.length,
  updater: updater.info(),
  obs: obsStatus, error, sourceWarnings, recordDirectory, uploadingId, materialControlBusy: Boolean(engine.pauseOperation),
  pythonReady: Boolean(state.config.recordDirectory && obsStatus && !pythonCaptureReason(state.config.pythonCapture, pythonSourceChoices)),
  pythonSourceReason: !obsStatus ? 'Подключите OBS в настройках пульта.' : !state.config.recordDirectory ? 'Выберите папку для видео в настройках пульта.' : pythonCaptureReason(state.config.pythonCapture, pythonSourceChoices),
  preparingUpload: queueBusy || Boolean(editMedia.work), editorBusy: editMedia.work || '', archiveBusy: Boolean(archive.work || archive.setup || archive.submitting),
  currentLesson: engine.currentLesson || null,
  shareMessage: shareBridge.message || '',
  officeMessage: officeFollower.message,
  recoveryDrafts: recoveryDrafts(),
  testVerified: state.config.testFingerprint === setupFingerprint(state.config),
  jobs: Object.values(state.jobs).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(job => ({ ...job,
    ...(job.pythonTimeline ? { pythonTimeline: publicTimeline(job.pythonTimeline) } : {}),
  })),
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
  res.setHeader('Referrer-Policy', 'no-referrer');
  const host = req.headers.host;
  if (!['127.0.0.1:18765', 'localhost:18765'].includes(host)) return json(res, 403, { error: 'Forbidden host' });
  if (req.headers.origin && !['http://127.0.0.1:18765', 'http://localhost:18765'].includes(req.headers.origin)) return json(res, 403, { error: 'Forbidden origin' });
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1:18765').pathname;
    if (pathname === '/archive' || pathname.startsWith('/archive/')) {
      if (updater.busy && req.method !== 'GET') return json(res, 409, { error: 'Пульт обновляется. Дождитесь завершения.' });
      if (await archive.handle(req, res, { key: localKey, json, body })) return;
    }
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { releaseId: updater.installed.id });
    if (req.method === 'GET' && pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'");
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
    if (req.method === 'GET' && ['/python-editor.mjs','/python-editor-time.mjs','/python-playback.mjs'].includes(pathname)) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      return res.end(fs.readFileSync(path.join(here, pathname.slice(1)), 'utf8'));
    }
    if (req.method === 'GET' && pathname.startsWith('/python/editor/video/')) {
      const preview = editMedia.previews.get(pathname.slice('/python/editor/video/'.length));
      const access = new URL(req.url, 'http://127.0.0.1:18765').searchParams.get('access');
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers['x-recorder-key'] !== localKey && (!preview?.access || access !== preview.access)) return json(res, 403, { error: 'Предпросмотр недоступен' });
      if (!preview || !fs.existsSync(preview.file)) throw new Error('Предпросмотр устарел. Подготовьте его заново.');
      sendPreview(req, res, preview); return;
    }
    if (req.headers['x-recorder-key'] !== localKey) return json(res, 403, { error: 'Откройте пульт заново' });
    if (req.method === 'GET' && req.url === '/state') return json(res, 200, publicState());
    if (req.method === 'GET' && pathname === '/python/editor/live') {
      const job = engine.active();
      const id = new URL(req.url, 'http://127.0.0.1:18765').searchParams.get('id');
      if (!job?.pythonTheory || job.status !== 'recording' || job.id !== id) throw new Error('Эта запись уже завершена. Выберите фрагмент для просмотра.');
      const [recording, profile] = await Promise.all([
        obs.call('GetRecordStatus'),
        obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' }),
      ]);
      if (!recording.outputActive || profile.parameterValue !== `lesson-${id}`) throw new Error('Нет подтверждённой записи Python в OBS');
      const mode = job.captureConfig?.mode || pythonCaptureConfig(state.config.pythonCapture).mode;
      // Read only: never switch scenes or start a preview output during capture.
      return json(res, 200, { image: await obs.preview(PYTHON_SCENES[mode], 960) });
    }
    if (req.method === 'GET' && req.url === '/preview') return json(res, 200, { image: await obs.preview() });
    if (req.method === 'GET' && req.url === '/python/preview') {
      const selected = pythonCaptureConfig(state.config.pythonCapture);
      if (!selected[selected.mode]) throw new Error('Выберите источник изображения для Python');
      return json(res, 200, { image: await obs.preview(PYTHON_SCENES[selected.mode]) });
    }
    if (req.method === 'GET' && req.url === '/choices') {
      pythonSourceChoices = await obs.choices();
      return json(res, 200, pythonSourceChoices);
    }
    if (req.method === 'GET' && req.url === '/storage') return json(res, 200, { drives: await recordingDrives(), recordDirectory: state.config.recordDirectory || '' });
    if (req.method === 'GET' && req.url === '/mock-review/catalog') return json(res, 200, await api('/mock-review/catalog', {}));
    if (req.method === 'GET' && req.url === '/python/catalog') return json(res, 200, await api('/python/catalog', {}));
    if (req.method === 'GET' && req.url.startsWith('/test-video/')) {
      const job = state.jobs[req.url.slice('/test-video/'.length)];
      if (!job?.local || job.manual || !job.testFingerprint || !job.mp4 || !fs.existsSync(job.mp4)) throw new Error('Пробная запись ещё не готова');
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(job.mp4).size });
      const stream = fs.createReadStream(job.mp4); stream.on('error', () => res.destroy()); stream.pipe(res); return;
    }
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });
    if (updater.busy) return json(res, 409, { error: 'Пульт обновляется. Подождите завершения.' });
    const payload = await body(req);
    if ((req.url === '/python/pause' || req.url === '/material/pause') && editMedia.work === payload.id) throw new Error('Дождитесь подготовки предпросмотра');
    if (req.url === '/python/editor/source') {
      const job = state.jobs[payload.id];
      if (!job?.pythonTimeline || job.pythonTimeline.revision !== payload.revision || queueBusy || uploadingId) throw new Error('Обновите монтаж или дождитесь обработки');
      const assertPlaybackOwner = async () => {
        const active = engine.active();
        if (!active) return;
        if (active.id !== job.id || !active.pythonTheory) throw new Error('Предпросмотр доступен после текущей записи');
        const [recording,profile] = await Promise.all([obs.call('GetRecordStatus'),obs.call('GetProfileParameter',{parameterCategory:'Output',parameterName:'FilenameFormatting'})]);
        if (!recording.outputActive || !recording.outputPaused || profile.parameterValue !== `lesson-${job.id}`) throw new Error('Для просмотра текущей записи сначала завершите дубль и проверьте запись Python в OBS');
      };
      await assertPlaybackOwner();
      const snapshot = { ...job, file: job.file || ownedRecording(recordDirectory, job.id), pythonTimeline: structuredClone(job.pythonTimeline) };
      const source = await editMedia.playbackSource(snapshot, payload.at, path.dirname(snapshot.file));
      if (state.jobs[payload.id]?.pythonTimeline.revision !== payload.revision) throw new Error('Монтаж изменился. Повторите просмотр');
      await assertPlaybackOwner();
      return json(res, 200, { videoUrl: `/python/editor/video/${source.id}?access=${source.access}`,
        sourceStart: source.sourceStart, sourceEnd: source.sourceEnd, requestedEnd: source.requestedEnd,
        complete: source.complete, offset: source.offset });
    }
    if (req.url === '/python/editor/preview') {
      let job, clips;
      await serialize(async () => {
        job = state.jobs[payload.id];
        if (!job?.pythonTimeline || job.pythonTimeline.revision !== payload.revision || editMedia.work || queueBusy || uploadingId) throw new Error('Обновите монтаж или дождитесь обработки');
        const active = engine.active();
        if (active?.id === job.id && !(await obs.status()).outputPaused) throw new Error('Для просмотра текущей записи сначала нажмите «Пауза»');
        if (active && active.id !== job.id) throw new Error('Предпросмотр монтажа доступен после текущей записи');
        clips = payload.clipId ? job.pythonTimeline.clips.filter(clip => clip.id === payload.clipId) : job.pythonTimeline.clips;
        if (!clips.length) throw new Error('Выберите записанный фрагмент');
        job = { ...job, file: job.file || ownedRecording(recordDirectory, job.id), pythonTimeline: structuredClone(job.pythonTimeline) };
      });
      const previewId = await editMedia.preview(job, clips, path.dirname(job.file));
      return json(res, 200, { previewId, videoUrl: `/python/editor/video/${previewId}?access=${editMedia.previews.get(previewId).access}`, revision: job.pythonTimeline.revision, duration: timelineDuration({ clips }) });
    }
    if (req.url === '/python/pause' || req.url === '/material/pause') {
      // Keep this local control out of the platform synchronization queue.
      // The engine coordinates it with StopRecord and checks the exact job.
      recordingControlRevision++;
      try {
        const recording = await engine.setMaterialPaused(payload.id, payload.paused);
        obsStatus = { ...obsStatus, ...recording };
        return json(res, 200, { recording, id: payload.id, pythonTimeline: publicTimeline(state.jobs[payload.id]?.pythonTimeline) });
      } finally { recordingControlRevision++; }
    }
    if (req.url === '/shutdown') {
      if (archive.work || archive.setup || archive.submitting) throw new Error('Поставьте обработку архива на паузу и дождитесь завершения текущей операции');
      if (engine.active() || uploadingId || queueBusy || editMedia.work || editMedia.sourceWork.size || (obs.connected && (await obs.status()).outputActive)) throw new Error('Сначала дождитесь окончания записи и загрузки');
      await pythonPreviewSession.release();
      runtimeWatchdog?.suspend('idle shutdown');
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
      if (job?.pythonTimeline && !job.pythonTimeline.approved) throw new Error('Сначала проверьте монтаж и нажмите «Выложить в изучение Python»');
      if (!job || job.excludeFromUpload || !['saved', 'error'].includes(job.status) || !job.file) throw new Error('Нет готовой записи');
      if (uploadingId) throw new Error('Предыдущая загрузка ещё идёт');
      void upload(job); return json(res, 200, { ok: true });
    }
    await serialize(async () => {
      if (updater.busy) throw new Error('Пульт обновляется. Подождите завершения.');
      if (req.url === '/python/preview') {
        if (payload.active === false) { await pythonPreviewSession.release(); return; }
        const selected = pythonCaptureConfig(state.config.pythonCapture);
        if (!selected[selected.mode]) throw new Error('Выберите источник изображения для Python');
        const active = engine.active();
        const image = await pythonPreviewSession.image(selected.mode, {
          idle: !active && !uploadingId && !queueBusy && !archive.work && !archive.setup && !archive.submitting,
          ownRecording: Boolean(active?.pythonTheory && active.status === 'recording'),
        });
        json(res, 200, { image }); return;
      }
      if (!req.url.startsWith('/python/') && !req.url.startsWith('/material/')) await pythonPreviewSession.release();
      if (req.url === '/python/editor/edit' || req.url === '/python/editor/publish') {
        const job = state.jobs[payload.id];
        if (!job?.pythonTimeline || job.url || job.pythonTimeline.approved || editMedia.work || uploadingId || queueBusy || !['recording', 'saved', 'error'].includes(job.status)) throw new Error('Этот монтаж сейчас недоступен для изменения');
        if (req.url.endsWith('/publish')) {
          if (!job.file || engine.active() || (await obs.status()).outputActive) throw new Error('Сначала завершите запись');
          await finalizePython(job);
          approveTimeline(job.pythonTimeline, payload.revision);
          job.status = 'saved'; job.error = ''; save(); return;
        }
        if (job.status === 'recording' && engine.active()?.id !== job.id) throw new Error('Запись уже изменилась');
        editTimeline(job.pythonTimeline, payload); save(); return;
      }
      if (engine.active()?.pythonTheory && ['/scene', '/program', '/auto-follow', '/auto-office', '/fallback'].includes(req.url)) throw new Error('Для записи Python используйте источники в отдельном пульте Python');
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
      } else if (req.url === '/python/configure') {
        await configurePythonCapture({ obs, state, engine, save, payload,
          busy: Boolean(uploadingId || queueBusy || archive.work || archive.setup || archive.submitting) });
        pythonSourceChoices = await obs.choices();
        obsStatus = await obs.status();
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
      } else if (req.url === '/mock-review/start') {
        if (!ready()) throw new Error('Сначала настройте запись и выберите микрофон в пульте');
        if (archive.work || archive.setup || archive.submitting) throw new Error('Поставьте распознавание архива на паузу перед записью');
        if (uploadingId || queueBusy) throw new Error('Дождитесь текущей загрузки');
        await startMockReview({ api, engine, payload });
        obsStatus = await obs.status();
      } else if (req.url === '/python/start') {
        if (editMedia.work) throw new Error('Дождитесь подготовки монтажа');
        if (!state.config.recordDirectory) throw new Error('Сначала выберите папку для видео в настройках пульта');
        if (archive.work || archive.setup || archive.submitting) throw new Error('Поставьте распознавание архива на паузу перед записью');
        if (uploadingId || queueBusy) throw new Error('Дождитесь текущей загрузки');
        await startPythonTheory({ api, engine, payload, captureConfig: state.config.pythonCapture });
        obsStatus = await obs.status();
      } else if (req.url === '/manual-start') {
        if (!ready()) throw new Error('Сначала выберите окно платформы, источник звука разговора и микрофон');
        await engine.startForCurrentLesson();
      } else if (req.url === '/fallback') {
        if (archive.work || archive.setup || archive.submitting) throw new Error('Поставьте обработку архива на паузу');
        await enterFallback({ engine, obs, payload, save });
        obsStatus = await obs.status();
      } else if (req.url === '/test-stop') {
        const job = engine.active();
        if (!job?.local || job.manual || !job.testFingerprint) throw new Error('Сейчас пробная запись не идёт');
        await engine.stop(job);
      } else if (req.url === '/material/stop') {
        const job = engine.active();
        if (!job || job.id !== payload.id || !(job.pythonTheory || job.mockReview) || job.status !== 'recording') throw new Error('Обновите пульт и проверьте текущую запись материала');
        try { await engine.stop(job); }
        catch (failure) { if (job.status !== 'saved') throw failure; }
        await finalizePython(job);
        obsStatus = await obs.status();
      } else if (req.url === '/stop') {
        const job = engine.active(); if (!job) throw new Error('Сейчас запись не идёт');
        try { await engine.stop(job); }
        catch (failure) { if (job.status !== 'saved') throw failure; }
      } else if (req.url === '/retry-start') {
        const job = state.jobs[payload.id];
        if (!job || job.file || job.status !== 'error' || job.cutoffAt <= Date.now()) throw new Error('Эту запись нельзя перезапустить');
        await engine.start(job);
      } else if (req.url === '/attach') {
        const job = state.jobs[payload.id];
        if (job?.pythonTimeline && !job.pythonTimeline.approved) throw new Error('Сначала подтвердите монтаж Python');
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
    error = ''; if (!res.writableEnded) json(res, 200, { ok: true });
  } catch (failure) { json(res, 400, { error: failure.message }); }
});
server.on('error', (failure) => { console.error(failure.code === 'EADDRINUSE' ? 'Пульт уже запущен' : failure.message); process.exit(1); });
server.listen(18765, '127.0.0.1', () => {
  try { runtimeWatchdog = recorderRuntime(directory); }
  catch (failure) { diagnosticLog(directory, 'watchdog-control-error', failure.message); }
  console.log('Пульт: http://127.0.0.1:18765');
  if (process.platform === 'win32' && path.resolve(here) === path.join(path.resolve(directory), 'app')) {
    const task = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'watchdog-task.ps1'), '-ExistingOnly'],
      { windowsHide: true, stdio: 'ignore' });
    task.once('error', failure => diagnosticLog(directory, 'watchdog-task-error', failure.message));
    task.once('exit', code => diagnosticLog(directory, 'watchdog-task', `code=${code}`));
  }
});
setInterval(() => { try { runtimeWatchdog?.heartbeat(); } catch (failure) { diagnosticLog(directory, 'heartbeat-write-error', failure.message); } }, 5000);
let ticking = false;
setInterval(() => {
  if (ticking || updater.busy) return; ticking = true;
  void serialize(async () => {
    try {
      await pythonPreviewSession.expire();
      let platformError = '';
      try { await engine.tick(); } catch (failure) { platformError = failure.message; }
      if (ready() || obs.connected) {
        const revision = recordingControlRevision;
        const observed = await obs.status();
        if (revision === recordingControlRevision) obsStatus = observed;
      }
      if (obs.connected && Date.now() - lastSourceCheck > 10000) {
        const choices = await obs.choices();
        pythonSourceChoices = choices;
        sourceWarnings = [];
        for (const [key, label] of [['platform', 'Окно платформы'], ['telemost', 'Звук разговора'], ['mic', 'Микрофон']]) {
          const selected = key === 'telemost' ? (obs.audioWindow || state.config[key]) : state.config[key];
          if (!choices[key].some((item) => item.itemEnabled && item.itemValue === selected)) sourceWarnings.push(`${label}: источник недоступен. Откройте его и проверьте выбор в настройках.`);
        }
        lastSourceCheck = Date.now();
      }
      error = platformError ? `Ошибка синхронизации: ${platformError}. Локальное состояние записи показано выше.` : '';
      if (pendingUpdate) await updater.install(pendingUpdate);
    } catch (failure) { error = failure.message; obsStatus = null; }
  }).finally(() => { ticking = false; void queue(); });
}, 2500);

let followingSources = false;
setInterval(() => {
  if (followingSources || updater.busy) return; followingSources = true;
  void (async () => {
    try { await shareBridge.tick(); }
    catch (error) { shareBridge.message = `Автовыбор демонстрации: ${error.message}`; }
    if (obsStatus) {
      try { await officeFollower.tick(); }
      catch (error) { officeFollower.message = `Автовыбор LibreOffice: ${error.message}`; }
    } else foregroundReader.stop();
  })().finally(() => { followingSources = false; });
}, 1000);
