import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizePythonTaskCatalog } from '../src/utils/pythonTaskCatalog.js';
import { normalizeTheoryRecording } from '../src/utils/theoryRecording.js';
import { videoChapterMetadata } from '../src/utils/videoChapters.js';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MEDIA = /\.(?:mp3|m4a|ogg|wav|webm|mp4|png|jpe?g|webp|pdf|txt|csv|xlsx|ods|fods|zip|py|json)$/i;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max = 100000) => typeof value === 'string' ? value.slice(0, max) : '';

// Build from course content only. Never serialize a teacher/student record or
// spread arbitrary question fields (solutions, owners and credentials included).
export function projectPythonGiftCourse(tests, fallback, token) {
  const assets = new Map();
  const mediaUrl = value => {
    if (typeof value !== 'string') return '';
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
    let url;
    try { url = new URL(value, 'https://ivan100.ru'); } catch { return ''; }
    if (url.username || url.password || [...url.searchParams.keys()].some(key => /auth|token|cookie|session/i.test(key))) return '';
    if (url.origin === 'https://ivan100.ru' && url.pathname.startsWith('/uploads/') && MEDIA.test(url.pathname)) {
      let decoded;
      try { decoded = decodeURIComponent(url.pathname.slice('/uploads/'.length)); } catch { return ''; }
      if (!decoded || decoded.includes('\\') || decoded.split('/').some(part => part === '..' || part === '.' || !part) || decoded.includes('\0')) return '';
      const id = crypto.createHash('sha256').update(decoded).digest('hex');
      assets.set(id, decoded);
      return `/api/python-course-gifts/${token}/asset/${id}`;
    }
    return url.protocol === 'https:' && !url.search && ['rutube.ru','docs.google.com'].includes(url.hostname) ? url.href : '';
  };
  const safeTheory = item => {
    if (!item || typeof item !== 'object') return null;
    if (item.type === 'recording') {
      const recording = normalizeTheoryRecording(item.content);
      if (!recording) return null;
      const segment = value => ({ url: mediaUrl(value?.url), durationMs: value?.durationMs || 0 });
      const cleanImage = image => ({ ...image, src: mediaUrl(image?.src) });
      const cleanEvent = event => {
        if (event.type !== 'board') return event;
        if (event.action === 'image') { const image = cleanImage(event.image); return image.src ? { ...event, image } : null; }
        if (event.action === 'snapshot') return { ...event, images: (event.images || []).map(cleanImage).filter(image => image.src) };
        return event;
      };
      return { type: 'recording', content: { ...recording, audio: recording.audio ? { ...segment(recording.audio), segments: (recording.audio.segments || []).map(segment).filter(value => value.url) } : null,
        events: recording.events.map(cleanEvent).filter(Boolean) } };
    }
    if (item.type === 'text') return { type: 'text', content: text(item.content) };
    if (['rutube','gdoc'].includes(item.type)) {
      let url;
      try { url = new URL(item.content); } catch { return null; }
      const host = item.type === 'rutube' ? 'rutube.ru' : 'docs.google.com';
      if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || [...url.searchParams.keys()].some(key => /auth|token|cookie|session/i.test(key))) return null;
      return { type: item.type, content: url.href, ...videoChapterMetadata(item) };
    }
    return null;
  };
  const theories = source => {
    if (!source || typeof source !== 'object') return {};
    if (source.type) { const item = safeTheory(source); return item ? { [item.type]: item } : {}; }
    return Object.fromEntries(Object.entries(source.variants || source).map(([type, value]) => [type, safeTheory(typeof value === 'object' ? { ...value, type } : { type, content: value })]).filter(([, value]) => value));
  };
  const tasks = normalizePythonTaskCatalog(tests?.__pythonTaskCatalog, fallback).map(task => {
    const entry = tests?.[task.number] || {};
    const questions = (Array.isArray(entry.python) ? entry.python : []).map((question, index) => ({
      id: String(question.id ?? `gift-${task.number}-${index}`), title: text(question.title, 500), question: text(question.question), starterCode: text(question.starterCode),
      subsectionId: text(question.subsectionId, 240), subsectionTitle: text(question.subsectionTitle, 500),
      tests: (Array.isArray(question.tests) && question.tests.length ? question.tests : typeof question.answer === 'string' ? [{ input: '', output: question.answer }] : []).filter(test => test && typeof test === 'object').map(test => ({ input: text(String(test.input ?? '')), ...(test.output !== undefined && test.output !== null ? { output: text(String(test.output)) } : {}) })),
      screenshots: (Array.isArray(question.screenshots) ? question.screenshots : []).map(image => ({ url: mediaUrl(image.url), name: text(image.name, 240) })).filter(image => image.url),
      files: (Array.isArray(question.files) ? question.files : []).map(file => ({ url: mediaUrl(file.url), name: text(file.name, 240) })).filter(file => file.url),
    }));
    return { ...task, questionCount: questions.length, entry: { python: questions,
      pythonSubsections: (Array.isArray(entry.pythonSubsections) ? entry.pythonSubsections : []).map(section => ({ id: text(section.id, 240), title: text(section.title, 500), order: Number(section.order) || 0 })),
      pythonTheory: theories(entry.pythonTheory),
      pythonTheoryBySubsection: Object.fromEntries(Object.entries(entry.pythonTheoryBySubsection || {}).map(([id, value]) => [id, theories(value)])),
    } };
  }).filter(task => task.questionCount || Object.keys(task.entry.pythonTheory).length || Object.keys(task.entry.pythonTheoryBySubsection).length);
  return { tasks, assets };
}

export function createPythonCourseGiftStore({ filePath, now = () => new Date().toISOString() }) {
  const read = () => {
    if (!fs.existsSync(filePath)) return [];
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(value)) throw Error('Некорректное хранилище подарочных ссылок');
    return value;
  };
  const save = entries => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify(entries), { mode: 0o600 }); fs.renameSync(tmp, filePath); }
    finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  };
  return {
    get(teacherId) { return read().find(entry => entry.teacherId === teacherId) || null; },
    find(token) { return TOKEN.test(token) ? read().find(entry => entry.token === token && entry.enabled) || null : null; },
    update(teacherId, enabled) {
      const entries = read(); let entry = entries.find(value => value.teacherId === teacherId);
      if (!entry) { entry = { id: crypto.randomUUID(), teacherId, token: crypto.randomBytes(32).toString('base64url'), createdAt: now() }; entries.push(entry); }
      entry.enabled = enabled; entry.updatedAt = now(); save(entries); return entry;
    },
  };
}

export function registerPythonCourseGiftRoutes(app, { store, readTests, fallbackTasks, uploadsDir, publicRoutes = false }) {
  const headers = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); };
  const handle = handler => (req, res) => { try { return handler(req, res); } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Курс сейчас не удалось открыть. Попробуйте ещё раз.' }); } };
  if (publicRoutes) {
    app.get('/api/python-course-gifts/:token', headers, handle((req, res) => {
      const share = store.find(req.params.token);
      if (!share) return res.status(404).json({ error: 'Подарочная ссылка недоступна. Попросите преподавателя проверить её.' });
      const { tasks } = projectPythonGiftCourse(readTests(share.teacherId), fallbackTasks, share.token);
      return res.json({ id: share.id, title: 'Python в подарок', tasks });
    }));
    app.get('/api/python-course-gifts/:token/asset/:assetId', headers, handle((req, res) => {
      const share = store.find(req.params.token);
      if (!share || !/^[a-f0-9]{64}$/.test(req.params.assetId)) return res.sendStatus(404);
      const { assets } = projectPythonGiftCourse(readTests(share.teacherId), fallbackTasks, share.token);
      const name = assets.get(req.params.assetId);
      if (!name) return res.sendStatus(404);
      let root, file;
      try { root = fs.realpathSync(uploadsDir); file = fs.realpathSync(path.resolve(root, name)); } catch { return res.sendStatus(404); }
      if (!file.startsWith(root + path.sep) || !MEDIA.test(file)) return res.sendStatus(404);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(file, error => { if (error && !res.headersSent) res.sendStatus(404); });
    }));
    app.get('/python-gift/:token', headers, (_req, _res, next) => next());
    return;
  }
  const owner = req => { if (req.auth?.role !== 'teacher' || !req.auth.id) fail('Ссылка доступна только преподавателю.', 403); return req.auth.id; };
  const summary = entry => entry ? { enabled: entry.enabled, path: `/python-gift/${entry.token}` } : { enabled: false, path: '' };
  app.get('/api/python-course-gift', headers, handle((req, res) => res.json(summary(store.get(owner(req))))));
  app.put('/api/python-course-gift', headers, handle((req, res) => {
    if (typeof req.body?.enabled !== 'boolean') fail('Укажите, включён ли доступ.');
    return res.json(summary(store.update(owner(req), req.body.enabled)));
  }));
}
