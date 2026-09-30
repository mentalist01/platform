import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { atomicJson, readJson } from './storage.mjs';
import { searchArchive, topicTags } from './archive-search.mjs';
import { publishArchiveClip } from './archive-publish.mjs';
import { queueEstimate, rememberSpeed } from './archive-eta.mjs';
import { privateVideo } from './rutube.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensions = new Set(['.mp4', '.mkv', '.mov', '.webm', '.m4v']);
const activeStates = new Set(['starting', 'recording', 'stopping']);
const identity = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const fileKey = file => path.resolve(file).toLocaleLowerCase('en');
const CHUNK = 300;
const emptyArchive = () => ({ version: 1, folders: [], items: [], clips: [], queue: [], paused: true, model: 'base' });
function loadArchive(file) {
  try {
    const data = readJson(file, emptyArchive());
    if (!data || !['folders', 'items', 'clips', 'queue'].every(key => Array.isArray(data[key]))) throw new Error('Некорректный каталог');
    return data;
  } catch {
    const backup = `${file}.unreadable-${Date.now()}.bak`;
    if (fs.existsSync(file)) fs.copyFileSync(file, backup);
    return { ...emptyArchive(), warnings: ['Не удалось прочитать каталог архива. Его копия сохранена. Обновите список записей.'] };
  }
}
export function clipRange(start, end, duration) {
  if (start == null || end == null || String(start).trim() === '' || String(end).trim() === '') throw new Error('Укажите начало и конец фрагмента');
  start = Number(start); end = Number(end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.1 || end - start > 1800) throw new Error('Выберите отрезок внутри записи длительностью до 30 минут');
  return { start, end: Math.min(end, duration) };
}
export function materialRange(start, end, duration, whole = false) {
  if (!whole) return clipRange(start, end, duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 43200) throw new Error('Не удалось определить длительность полного урока');
  return { start: 0, end: duration };
}
export function byteRange(header, size) {
  if (!header) return { start: 0, end: size - 1, status: 200 };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size ? { start, end, status: 206 } : null;
}
export class LessonArchive {
  constructor({ directory, recordDirectory, jobs = () => [], isBusy = () => false, ffmpeg = 'ffmpeg', publishClip, prepareMaterial, materialPublisher, platformUrl }) {
    Object.assign(this, { directory, recordDirectory, jobs, isBusy, ffmpeg, publishClip, prepareMaterial, materialPublisher, platformUrl });
    this.root = path.join(directory, 'archive');
    this.file = path.join(this.root, 'index.json');
    this.data = loadArchive(this.file);
    this.data.queue ||= []; this.data.clips ||= [];
    for (const item of this.data.items) if (item.status === 'processing') item.status = 'queued';
    for (const clip of this.data.clips) if (['exporting', 'uploading'].includes(clip.status)) { clip.status = 'error'; clip.error = 'Операция прервалась. Повторите её.'; }
    for (const clip of this.data.clips) if (clip.autoPublish && !clip.materialId) {
      if (['uploading', 'exporting'].includes(clip.materialStatus)) clip.materialStatus = 'error';
      else if (clip.materialStatus === 'attaching') clip.materialStatus = 'queued';
    }
    fs.mkdirSync(path.join(this.root, 'transcripts'), { recursive: true });
    fs.mkdirSync(path.join(this.root, 'work'), { recursive: true });
    this.work = null; this.child = null; this.transcriber = null; this.setup = ''; this.scanning = false; this.blocked = false;
    this.timer = setInterval(() => this.runTick(), 2000); this.timer.unref();
  }
  runTick() { return this.tick().catch(e => { this.error = String(e.message).slice(-600); this.data.paused = true; this.work = null; }); }
  save() { atomicJson(this.file, this.data); }
  transcriptPath(id) { if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Запись не найдена'); return path.join(this.root, 'transcripts', `${id}.json`); }
  transcript(id) { return readJson(this.transcriptPath(id), { segments: [] }); }
  item(id) { const item = this.data.items.find(i => i.id === id); if (!item) throw new Error('Запись не найдена'); return item; }
  async command(exe, args, { onLine, timeout = 30 * 60_000, tracked = true } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_TELEMETRY: '1' } });
      if (tracked) this.child = child;
      let output = ''; let error = ''; let pending = '';
      child.once('spawn', () => { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {} });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', data => { output = (output + data).slice(-200000); if (onLine) { pending += data; const lines = pending.split('\n'); pending = lines.pop(); for (const line of lines) { try { onLine(JSON.parse(line)); } catch {} } } });
      child.stderr.on('data', data => { error = (error + data).slice(-4000); });
      const timer = setTimeout(() => child.kill(), timeout);
      const finish = failure => { clearTimeout(timer); if (this.child === child) this.child = null; failure ? reject(failure) : resolve(output); };
      child.once('error', finish);
      child.once('exit', code => finish(code === 0 ? null : new Error(error || output || 'Обработка прервана')));
    });
  }
  async detectPython() {
    if (this.transcriber) return this.transcriber;
    const venv = path.join(this.root, 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    for (const candidate of [ ...(fs.existsSync(venv) ? [{ exe: venv, args: [] }] : []), { exe: process.platform === 'win32' ? 'py' : 'python3', args: process.platform === 'win32' ? ['-3'] : [] } ]) {
      try { await this.command(candidate.exe, [...candidate.args, '-X', 'utf8', path.join(here, 'archive-worker.py'), '--check'], { timeout: 30000, tracked: false }); this.transcriber = candidate; return candidate; } catch {}
    }
    throw new Error('Нужно подготовить распознавание: нажмите «Установить распознавание». Требуется Python 3.10 или новее.');
  }
  async install() {
    if (this.setup || this.work || this.isBusy()) throw new Error('Дождитесь окончания текущей операции или урока');
    this.setup = 'Устанавливаем распознавание в отдельную папку…';
    try {
      const exe = process.platform === 'win32' ? 'py' : 'python3'; const args = process.platform === 'win32' ? ['-3'] : [];
      await this.command(exe, [...args, '-m', 'venv', path.join(this.root, 'python')], { tracked: false });
      const python = path.join(this.root, 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      await this.command(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(here, 'archive-requirements.txt')], { tracked: false });
      this.transcriber = null; await this.detectPython(); this.setup = '';
    } catch (e) { this.setup = ''; this.setupError = String(e.message).slice(-600); throw new Error(this.setupError); }
  }
  async scan(folder) {
    if (this.scanning) throw new Error('Поиск файлов уже идёт');
    this.scanning = true;
    try {
      if (folder) {
        if (!path.isAbsolute(folder)) throw new Error('Укажите полный путь к папке');
        const real = await fs.promises.realpath(folder);
        if (!(await fs.promises.stat(real)).isDirectory()) throw new Error('Нужна папка с видео');
        if (!this.data.folders.includes(real)) this.data.folders.push(real);
      }
      const seen = new Set(); const found = [];
      for (const job of this.jobs()) {
        for (const file of [job.mp4, job.file].filter(Boolean)) seen.add(fileKey(file));
        if (job.local && !job.manual || job.excludeFromUpload || activeStates.has(job.status)) continue;
        const file = [job.mp4, job.file].find(file => file && fs.existsSync(file));
        if (file) found.push({ file, title: job.lessonName ? `${job.lessonName} · ${job.title}` : job.title, url: job.url || '', jobId: job.id });
      }
      const knownIds = new Set(this.jobs().map(j => j.id));
      const walk = async (dir, depth = 0) => {
        if (depth > 4 || found.length >= 2000) return;
        for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isSymbolicLink() || entry.name.startsWith('.') || ['Теория', 'archive', 'node_modules', '$RECYCLE.BIN'].includes(entry.name)) continue;
          if (entry.isDirectory()) await walk(file, depth + 1);
          else if (entry.isFile() && extensions.has(path.extname(file).toLowerCase()) && !seen.has(fileKey(file))) {
            const uuid = entry.name.match(/[a-f0-9]{8}-[a-f0-9-]{27}/i)?.[0];
            if (uuid && knownIds.has(uuid)) continue;
            seen.add(fileKey(file)); found.push({ file, title: path.basename(file, path.extname(file)), url: '' });
          }
          if (found.length >= 2000) break;
        }
      };
      const folders = [...new Set([this.recordDirectory(), ...this.data.folders].filter(Boolean))];
      const warnings = [];
      for (const dir of folders) { try { await walk(dir); } catch { warnings.push(`Папка недоступна: ${dir}`); } }
      for (const source of found) {
        const stat = await fs.promises.stat(source.file); if (!stat.size) continue;
        const id = identity(source.jobId || fileKey(source.file));
        let item = this.data.items.find(i => i.id === id);
        const signature = `${fileKey(source.file)}:${stat.size}:${stat.mtimeMs}`;
        if (!item) { item = { id, status: 'new', duration: 0, processed: 0, tags: [] }; this.data.items.push(item); }
        if (this.work?.id === id) continue;
        if (item.signature && item.signature !== signature) { item.status = 'new'; item.processed = 0; item.duration = 0; item.tags = []; atomicJson(this.transcriptPath(id), { segments: [] }); }
        Object.assign(item, source, { signature, bytes: stat.size, modified: stat.mtimeMs, missing: false });
      }
      const foundIds = new Set(found.map(s => identity(s.jobId || fileKey(s.file))));
      for (const item of this.data.items) if (!foundIds.has(item.id)) item.missing = !fs.existsSync(item.file);
      this.data.items.sort((a, b) => b.modified - a.modified); this.data.warnings = warnings; this.save();
      return this.state();
    } finally { this.scanning = false; }
  }
  state() { return { ...this.data, platformUrl: new URL(this.platformUrl?.() || 'https://ivan100.ru').origin, eta: queueEstimate({ ...this.data, work: this.work, blocked: this.blocked }), work: this.work, blocked: this.blocked, scanning: this.scanning, submitting: Boolean(this.submitting), setup: this.setup, setupError: this.setupError || '', error: this.error || '', ready: !!this.transcriber, folder: this.recordDirectory() }; }
  enqueue(ids, model = 'base') {
    if (!['base', 'small'].includes(model)) throw new Error('Неизвестная модель');
    for (const id of ids) {
      const item = this.item(id); if (item.missing) continue;
      if (item.model && item.model !== model) {
        if (this.work?.id === id) throw new Error('Сначала поставьте обработку этой записи на паузу');
        item.processed = 0; item.status = 'new'; item.model = model; item.tags = [];
      }
      if (item.status === 'done') continue;
      if (!this.data.queue.includes(id)) this.data.queue.push(id);
      item.model ||= model; item.status = this.work?.id === id ? item.status : 'queued'; item.error = ''; delete item.durationError;
    }
    this.data.model = model; this.data.paused = false; this.save(); this.runTick();
  }
  pause() { this.data.paused = true; if (this.work?.kind === 'transcribe') this.child?.kill(); this.save(); }
  source(item) {
    const stat = fs.statSync(item.file);
    if (`${fileKey(item.file)}:${stat.size}:${stat.mtimeMs}` !== item.signature) throw new Error('Файл изменился. Обновите список записей.');
    return item.file;
  }
  async probe(item) {
    if (item.duration > 0) return item.duration;
    const ffprobe = /ffmpeg(?:\.exe)?$/i.test(this.ffmpeg) ? this.ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1') : 'ffprobe';
    const raw = await this.command(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', this.source(item)], { timeout: 30000 });
    item.duration = Number(JSON.parse(raw).format?.duration);
    if (!Number.isFinite(item.duration) || item.duration <= 0) throw new Error('Не удалось определить длительность видео');
    this.save(); return item.duration;
  }
  async measureQueue() {
    for (const id of [...this.data.queue]) {
      if (this.data.paused || this.isBusy()) throw new Error('paused');
      const item = this.item(id);
      if (item.duration > 0 || item.durationError) continue;
      try { await this.probe(item); }
      catch (e) {
        if (this.data.paused || this.isBusy()) throw e;
        item.durationError = String(e.message).slice(-300);
      }
    }
  }
  async tick() {
    this.blocked = Boolean(this.isBusy());
    if (this.blocked && this.work?.kind === 'transcribe') this.child?.kill();
    if (this.work || this.setup || this.submitting || this.blocked) return;
    const pending = this.data.clips.find(c => c.autoPublish && !c.materialId && ['queued', 'processing'].includes(c.materialStatus) && (c.nextPublishAt || 0) <= Date.now());
    if (pending && this.materialPublisher) {
      this.work = { kind: 'publish', id: pending.id, title: pending.title };
      try {
        const target = await this.prepareMaterial();
        if (target.teacherId !== pending.teacherId) throw new Error('Пульт подключён к другому учителю. Подключите исходный аккаунт.');
        await publishArchiveClip(pending, { ...this.materialPublisher, persist: () => this.save() });
      } catch (e) { pending.materialStatus = 'error'; pending.error = String(e.message).slice(-600); }
      finally { this.work = null; this.save(); }
      return;
    }
    if (this.data.paused || !this.data.queue.length) return;
    const id = this.data.queue[0]; const item = this.item(id);
    this.work = { kind: 'transcribe', id, title: item.title, model: item.model || 'base', phase: 'inspect', seconds: item.processed || 0, chunkStart: item.processed || 0 };
    item.status = 'processing'; this.save();
    const wav = path.join(this.root, 'work', `${id}.wav`);
    try {
      await this.measureQueue();
      this.work.phase = 'prepare';
      const python = await this.detectPython();
      await this.probe(item);
      const start = item.processed || 0; const length = Math.min(CHUNK, item.duration - start);
      const startedAt = Date.now(); let modelStartedAt = 0; let modelSeconds = 0;
      await this.command(this.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', this.source(item), '-t', String(length), '-vn', '-ac', '1', '-ar', '16000', '-threads', '2', wav]);
      if (this.data.paused || this.isBusy()) throw new Error('paused');
      const segments = []; let done = false; let workerError = '';
      await this.command(python.exe, [...python.args, '-X', 'utf8', path.join(here, 'archive-worker.py'), '--input', wav, '--model', item.model || 'base'], { onLine: line => {
        if (line.phase) this.work.phase = line.phase;
        if (line.phase === 'model') modelStartedAt = Date.now();
        if (line.phase === 'transcribing') {
          this.work.inferenceStartedAt = Date.now();
          if (modelStartedAt) modelSeconds = (Date.now() - modelStartedAt) / 1000;
        }
        if (line.error) workerError = line.error;
        if (line.done) done = true;
        if (Number.isFinite(line.start) && Number.isFinite(line.end) && line.text) { segments.push({ start: start + line.start, end: Math.min(item.duration, start + line.end), text: String(line.text) }); this.work.seconds = start + line.end; }
      } });
      if (!done || workerError) throw new Error(workerError || 'Распознавание не завершило фрагмент');
      const old = this.transcript(id);
      const combined = [...old.segments.filter(s => s.start < start), ...segments];
      atomicJson(this.transcriptPath(id), { model: item.model, signature: item.signature, segments: combined });
      // Exclude a one-time long model download from the steady processing rate.
      this.data.speedSamples = rememberSpeed(this.data.speedSamples, { model: item.model || 'base', audioSeconds: length,
        wallSeconds: Math.max(0.001, (Date.now() - startedAt) / 1000 - (modelSeconds > 60 ? modelSeconds : 0)) });
      item.processed = Math.min(item.duration, start + length); item.tags = topicTags(combined);
      if (item.processed >= item.duration - 0.1) { item.status = 'done'; this.data.queue.shift(); }
      else item.status = 'queued';
    } catch (e) {
      if (this.data.paused || this.isBusy()) item.status = 'queued';
      else { item.status = 'error'; item.error = String(e.message).slice(-600); this.data.queue.shift(); }
    } finally {
      // Only the owned temporary WAV is removed. Source videos are never changed.
      try { fs.unlinkSync(wav); } catch {}
      this.work = null; this.save();
    }
  }
  async createMaterial(payload) {
    if (this.submitting || this.setup || (this.work && this.work.kind !== 'transcribe') || this.isBusy()) throw new Error('Дождитесь окончания текущей операции или урока');
    const title = String(payload.title || '').trim();
    if (!title || title.length > 100) throw new Error('Укажите название длиной до 100 символов');
    if (!this.prepareMaterial || !this.materialPublisher) throw new Error('Обновите пульт для добавления материалов');
    const item = this.item(payload.id);
    if (payload.whole !== true) clipRange(payload.start, payload.end, item.duration || Infinity);
    this.submitting = true; this.error = '';
    try {
      const target = await this.prepareMaterial();
      this.pause();
      for (let i = 0; this.work?.kind === 'transcribe' && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 100));
      if (this.work) throw new Error('Распознавание ещё останавливается. Повторите через несколько секунд.');
      if (payload.whole === true && privateVideo(item.url)) {
        await this.probe(item);
        const range = materialRange(0, item.duration, item.duration, true);
        const existing = this.data.clips.find(clip => clip.whole && clip.parentId === item.id
          && clip.teacherId === target.teacherId && clip.title === title && clip.url === privateVideo(item.url).url);
        if (existing) return existing;
        const clip = { id: crypto.randomUUID(), parentId: item.id, title, ...range, whole: true,
          durationMs: Math.round(item.duration * 1000), mp4: this.source(item), url: privateVideo(item.url).url,
          status: 'ready', autoPublish: true, teacherId: target.teacherId, materialStatus: 'queued', createdAt: Date.now() };
        this.data.clips.unshift(clip); this.save(); return clip;
      }
      const clip = await this.exportClip({ ...payload, whole: payload.whole === true, title, autoPublish: true, teacherId: target.teacherId });
      return clip;
    } finally { this.submitting = false; }
  }
  retryMaterial(id) {
    const clip = this.data.clips.find(c => c.id === id);
    if (!clip?.autoPublish || !fs.existsSync(clip.mp4)) throw new Error('Фрагмент не сохранён. Вырежьте его заново.');
    if (clip.materialId) return;
    if (this.work?.id === id) throw new Error('Этот материал уже обрабатывается');
    clip.materialStatus = 'queued'; clip.nextPublishAt = 0; clip.error = ''; this.save(); this.runTick();
  }
  async exportClip({ id, start, end, title, whole = false, autoPublish = false, teacherId = '' }) {
    if (this.work || this.setup || this.isBusy()) throw new Error('Поставьте распознавание на паузу и дождитесь окончания урока');
    const item = this.item(id);
    this.work = { kind: 'export', id, title: 'Сохраняем фрагмент…' };
    let clip; let temporary;
    try {
      await this.probe(item);
      const range = materialRange(start, end, item.duration, whole);
      const folder = path.join(this.recordDirectory() || path.dirname(item.file), 'Теория'); fs.mkdirSync(folder, { recursive: true });
      const clipId = crypto.randomUUID(); const name = String(title || 'Теория').trim().slice(0, 100) || 'Теория';
      const fileName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
      const output = path.join(folder, `${fileName}-${clipId}.mp4`); temporary = path.join(folder, `${clipId}.part.mp4`);
      clip = { id: clipId, parentId: id, title: name, ...range, whole, durationMs: Math.round((range.end - range.start) * 1000), status: 'exporting', mp4: output, createdAt: Date.now(), ...(autoPublish ? { autoPublish: true, teacherId, materialStatus: 'exporting' } : {}) };
      this.data.clips.unshift(clip); this.save();
      await this.command(this.ffmpeg, whole
        ? ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-i', this.source(item), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', temporary]
        : ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-ss', String(range.start), '-i', this.source(item), '-t', String(range.end - range.start), '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-threads', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', temporary]);
      fs.renameSync(temporary, output); clip.status = 'saved'; clip.error = '';
      if (autoPublish) clip.materialStatus = 'queued';
      return clip;
    } catch (e) { if (clip) { clip.status = 'error'; if (autoPublish) clip.materialStatus = 'error'; clip.error = String(e.message).slice(-500); } throw e; }
    finally { if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary); this.work = null; this.save(); }
  }
  stream(req, res, id, isClip) {
    const item = isClip ? this.data.clips.find(c => c.id === id) : this.item(id);
    const file = isClip ? item?.mp4 : this.source(item);
    if (!file || !fs.existsSync(file)) throw new Error('Файл не найден');
    const size = fs.statSync(file).size; const range = byteRange(req.headers.range, size);
    if (!range) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(range.status, { 'Content-Type': ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : 'video/x-matroska', 'Accept-Ranges': 'bytes', 'Content-Length': range.end - range.start + 1, ...(range.status === 206 ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}) });
    const stream = fs.createReadStream(file, { start: range.start, end: range.end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  }
  async handle(req, res, { key, json, body }) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/archive' && !url.pathname.startsWith('/archive/')) return false;
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'GET' && url.pathname === '/archive') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'");
      res.end(fs.readFileSync(path.join(here, 'archive.html'), 'utf8').replace('__LOCAL_KEY__', key)); return true;
    }
    const media = req.method === 'GET' && url.pathname === '/archive/media';
    if (req.headers['x-recorder-key'] !== key && !(media && url.searchParams.get('key') === key)) { json(res, 403, { error: 'Откройте архив заново' }); return true; }
    if (media) { this.stream(req, res, url.searchParams.get('id'), url.searchParams.get('clip') === '1'); return true; }
    let value;
    if (req.method === 'GET') {
      if (url.pathname === '/archive/state') value = this.state();
      else if (url.pathname === '/archive/search') value = searchArchive(this.data.items, id => this.transcript(id).segments, url.searchParams.get('q') || '', url.searchParams.get('topic') || '');
      else if (url.pathname === '/archive/item') { const item = this.item(url.searchParams.get('id')); value = { ...item, segments: this.transcript(item.id).segments }; }
      else { json(res, 404, {}); return true; }
    } else if (req.method === 'POST') {
      const payload = await body(req);
      if (url.pathname === '/archive/scan') value = await this.scan(payload.folder);
      else if (url.pathname === '/archive/enqueue') { if (!Array.isArray(payload.ids) || payload.ids.length > 2000) throw new Error('Выберите записи'); this.enqueue(payload.ids, payload.model); value = this.state(); }
      else if (url.pathname === '/archive/pause') { this.pause(); value = this.state(); }
      else if (url.pathname === '/archive/resume') { this.data.paused = false; this.save(); value = this.state(); }
      else if (url.pathname === '/archive/create-material') {
        const item = this.item(payload.id); if (payload.whole !== true) clipRange(payload.start, payload.end, item.duration || Infinity);
        if (!String(payload.title || '').trim() || String(payload.title).trim().length > 100) throw new Error('Укажите название длиной до 100 символов');
        if (this.submitting || (this.work && this.work.kind !== 'transcribe') || this.isBusy()) throw new Error('Дождитесь окончания текущей операции');
        void this.createMaterial(payload).catch(e => { this.error = e.message; }); value = { ok: true };
      }
      else if (url.pathname === '/archive/retry-material') { this.retryMaterial(payload.id); value = { ok: true }; }
      else if (url.pathname === '/archive/export') {
        if (this.work || this.setup || this.submitting || this.isBusy()) throw new Error('Поставьте распознавание на паузу и дождитесь окончания текущей операции');
        const item = this.item(payload.id); clipRange(payload.start, payload.end, item.duration || Infinity);
        this.error = ''; void this.exportClip(payload).catch(e => { this.error = e.message; }); value = { ok: true };
      }
      else if (url.pathname === '/archive/install') {
        if (this.work || this.setup || this.isBusy()) throw new Error('Дождитесь окончания текущей операции');
        this.setupError = ''; void this.install().catch(() => {}); value = { ok: true };
      }
      else if (url.pathname === '/archive/open-file') {
        const clip = this.data.clips.find(c => c.id === payload.id); if (!clip?.mp4 || !fs.existsSync(clip.mp4)) throw new Error('Файл не найден');
        const child = spawn('explorer.exe', ['/select,', clip.mp4], { detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); value = { ok: true };
      } else if (url.pathname === '/archive/publish' && this.publishClip) {
        const clip = this.data.clips.find(c => c.id === payload.id); if (!clip || !fs.existsSync(clip.mp4)) throw new Error('Сначала сохраните фрагмент');
        if (this.work || this.isBusy()) throw new Error('Дождитесь окончания текущей операции');
        void this.publishClip(clip, () => this.save()).catch(e => { clip.status = 'error'; clip.error = e.message; this.save(); }); value = { ok: true };
      } else { json(res, 404, {}); return true; }
    } else { json(res, 405, {}); return true; }
    json(res, 200, value); return true;
  }
  close() { clearInterval(this.timer); this.child?.kill(); }
}
