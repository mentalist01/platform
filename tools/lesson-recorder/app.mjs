import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ObsClient } from './obs.mjs';
import { atomicJson, readJson } from './storage.mjs';
import { RecorderEngine } from './engine.mjs';
import { RutubeUploader, privateVideo, videoReady } from './rutube.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = process.env.IVAN100_RECORDER_HOME || path.join(os.homedir(), 'Ivan100Recorder');
const recordDirectory = path.join(os.homedir(), 'Videos', 'Ivan100 Lessons');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'state.json');
const state = readJson(file, { config: { platformUrl: 'https://ivan100.ru', autoUpload: false, configured: false }, jobs: {} });
const save = () => atomicJson(file, state);
for (const job of Object.values(state.jobs)) {
  if (job.status === 'uploading') {
    job.status = 'error'; job.error = 'Загрузка прервалась при закрытии пульта. Нажмите «Продолжить загрузку»: помощник проверит уже загруженный ролик.'; save();
  }
}
const obs = new ObsClient();
const uploader = new RutubeUploader(directory);
const localKey = crypto.randomBytes(32).toString('base64url');
let error = ''; let obsStatus = null; let chain = Promise.resolve(); let queueBusy = false; let uploadingId = '';
let sourceWarnings = []; let lastSourceCheck = 0;
const serialize = (fn) => { const next = chain.then(fn); chain = next.catch(() => {}); return next; };
const ready = () => Boolean(state.config.configured && state.config.platform && state.config.telemost && state.config.mic);
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
  const output = path.join(recordDirectory, `${job.title.replace(/[<>:"/\\|?*]/g, '-')}-${job.id}.mp4`);
  const temporary = `${output}.part.mp4`;
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', job.file, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', temporary]);
  fs.renameSync(temporary, output); job.mp4 = output; save();
}
async function publish(job) {
  const video = privateVideo(job.url);
  if (!video) throw new Error('Нужна полная закрытая ссылка Rutube с ключом ?p=');
  if (!await videoReady(video.url)) { job.status = 'processing'; save(); return; }
  await engine.report(job, 'ready', { url: video.url });
  job.status = 'ready'; job.error = ''; save();
}
async function upload(job) {
  if (uploadingId) throw new Error('Предыдущая загрузка ещё идёт');
  uploadingId = job.id;
  try {
    await prepare(job);
    job.status = 'uploading'; job.error = ''; save();
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
    for (const job of Object.values(state.jobs)) {
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
const publicState = () => ({
  config: { ...state.config, token: undefined }, paired: Boolean(state.config.token), ready: ready() && !!obsStatus && !sourceWarnings.length,
  obs: obsStatus, error, sourceWarnings, recordDirectory, uploadingId,
  jobs: Object.values(state.jobs).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50),
});
async function body(req) {
  let content = ''; for await (const chunk of req) { content += chunk; if (content.length > 16000) throw new Error('Запрос слишком большой'); }
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
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
      return res.end(fs.readFileSync(path.join(here, 'panel.html'), 'utf8').replace('__LOCAL_KEY__', localKey));
    }
    if (req.headers['x-recorder-key'] !== localKey) return json(res, 403, { error: 'Откройте пульт заново' });
    if (req.method === 'GET' && req.url === '/state') return json(res, 200, publicState());
    if (req.method === 'GET' && req.url === '/preview') return json(res, 200, { image: await obs.preview() });
    if (req.method === 'GET' && req.url === '/choices') return json(res, 200, await obs.choices());
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });
    const payload = await body(req);
    if (req.url === '/shutdown') {
      if (engine.active() || uploadingId || queueBusy) throw new Error('Сначала дождитесь окончания записи и загрузки');
      await uploader.context?.close(); save();
      json(res, 200, { ok: true });
      server.close(() => process.exit(0)); return;
    }
    if (req.url === '/rutube-login') { await uploader.login(); return json(res, 200, { ok: true }); }
    if (req.url === '/upload') {
      const job = state.jobs[payload.id];
      if (!job || !['saved', 'error'].includes(job.status) || !job.file) throw new Error('Нет готовой записи');
      if (uploadingId) throw new Error('Предыдущая загрузка ещё идёт');
      void upload(job); return json(res, 200, { ok: true });
    }
    await serialize(async () => {
      if (req.url === '/pair') {
        const result = await api('/pair', { code: payload.code, name: os.hostname() }, true);
        state.config.token = result.token; state.config.deviceId = result.deviceId; save();
      } else if (req.url === '/setup') {
        enableWebsocket(); await obs.setup(recordDirectory);
      } else if (req.url === '/configure') {
        const choices = await obs.choices();
        for (const key of ['platform', 'telemost', 'mic', 'screen']) {
          if (!choices[key].some((item) => item.itemValue === payload[key] && item.itemEnabled)) throw new Error(`Выберите доступный источник: ${key}`);
        }
        await obs.configure(payload);
        Object.assign(state.config, { platform: payload.platform, telemost: payload.telemost, mic: payload.mic, screen: payload.screen, configured: true }); save(); lastSourceCheck = 0;
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
      } else if (req.url === '/auto-upload') {
        state.config.autoUpload = payload.enabled === true; save();
      } else if (req.url === '/test-start') {
        if (!ready()) throw new Error('Сначала выберите окно платформы, Телемост и микрофон');
        await engine.start({ id: crypto.randomUUID(), title: 'Проверка записи', local: true, cutoffAt: Date.now() + 60000 });
      } else if (req.url === '/stop') {
        const job = engine.active(); if (!job) throw new Error('Сейчас запись не идёт');
        await engine.stop(job);
      } else if (req.url === '/retry-start') {
        const job = state.jobs[payload.id];
        if (!job || job.file || job.status !== 'error' || job.cutoffAt <= Date.now()) throw new Error('Эту запись нельзя перезапустить');
        await engine.start(job);
      } else if (req.url === '/attach') {
        const job = state.jobs[payload.id];
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
        for (const [key, label] of [['platform', 'Окно платформы'], ['telemost', 'Телемост'], ['mic', 'Микрофон']]) {
          if (!choices[key].some((item) => item.itemEnabled && item.itemValue === state.config[key])) sourceWarnings.push(`${label}: источник недоступен. Откройте его и проверьте выбор в настройках.`);
        }
        lastSourceCheck = Date.now();
      }
      error = '';
    } catch (failure) { error = failure.message; obsStatus = null; }
  }).finally(() => { ticking = false; void queue(); });
}, 2500);
