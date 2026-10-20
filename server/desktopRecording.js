import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRecordingShareRelay } from './recordingShare.js';
import { recorderPackage } from './recorderPackage.js';

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const token = () => crypto.randomBytes(32).toString('base64url');
// A lost WebSocket/browser is not the end of a lesson. Keep the local OBS
// recording through reconnection; explicit finish/next lesson/cutoff still win.
export const RECORDING_RECONNECT_GRACE_MS = 5 * 60_000;
const recordingDeadline = job => Number.isFinite(job.occurrence?.endMs) && job.occurrence.endMs > 0
  ? Math.min(job.cutoffAt, job.occurrence.endMs) : job.cutoffAt;

export function privateRutubeVideo(value) {
  let url;
  try { url = new URL(String(value)); } catch { return null; }
  const match = url.pathname.match(/^\/(?:video\/private|play\/embed)\/([a-f0-9]{32})\/?$/i);
  const key = url.searchParams.get('p');
  if (url.protocol !== 'https:' || !['rutube.ru', 'www.rutube.ru'].includes(url.hostname)
    || url.username || url.password || url.port || !match || !/^[a-z0-9_-]{1,256}$/i.test(key || '')) return null;
  return {
    url: `https://rutube.ru/video/private/${match[1]}/?p=${encodeURIComponent(key)}`,
    embedUrl: `https://rutube.ru/play/embed/${match[1]}/?p=${encodeURIComponent(key)}`,
  };
}

// The server stores metadata only. Recording files and Rutube credentials stay on the PC.
export function createDesktopRecordingStore(file, { now = Date.now, lessonNameFor = () => '', lessonTopicFor = () => null } = {}) {
  let db = { teachers: {}, devices: {}, jobs: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const job of Object.values(db.jobs)) if (job.desired === 'record') job.cutoffAt = recordingDeadline(job);
  const pairs = new Map();
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(temporary, file);
  };
  const enabled = (teacherId) => db.teachers[teacherId]?.enabled === true;
  const jobs = (teacherId) => Object.values(db.jobs).filter((job) => job.teacherId === teacherId);
  const publicJob = (job) => job && ({
    id: job.id, occurrence: job.occurrence, title: job.title, status: job.status,
    lessonName: String(lessonNameFor(job) || '').trim().slice(0, 150),
    lessonTopic: lessonTopicFor(job),
    desired: job.desired, cutoffAt: recordingDeadline(job), startedAt: job.startedAt,
    stoppedAt: job.stoppedAt || '', updatedAt: job.updatedAt, video: job.video || null,
    previousJobId: job.previousJobId || '', error: job.error || '', deviceId: job.deviceId || '', audioMode: job.audioMode || '',
  });
  const settings = (teacherId) => ({
    enabled: enabled(teacherId),
    devices: Object.values(db.devices).filter((d) => d.teacherId === teacherId).map((d) => ({
      id: d.id, name: d.name, lastSeenAt: d.lastSeenAt || 0, ready: d.ready === true,
      online: now() - (d.lastSeenAt || 0) < 15_000,
    })),
    jobs: jobs(teacherId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12).map(publicJob),
  });
  const stop = (occurrenceKey, reason = 'lesson-ended') => {
    for (const job of Object.values(db.jobs)) {
      if (job.occurrence.key !== occurrenceKey || job.desired === 'stop') continue;
      job.desired = 'stop'; job.stopReason = reason; job.stoppedAt = now(); job.updatedAt = now(); save();
    }
  };
  const share = createRecordingShareRelay({ now, allowed: (teacherId, id) => enabled(teacherId) && db.jobs[id]?.teacherId === teacherId && db.jobs[id]?.desired === 'record' && db.jobs[id]?.cutoffAt > now() });
  return {
    enabled, settings, stop, share,
    // Finance uses replay existence when deduplicating lessons, and availability
    // when reconciling recording subscriptions. Device heartbeats, duration and
    // upload progress do not change either fact. Keep latest-job replay semantics.
    availabilityRevision(teacherId) {
      const latest = new Map();
      for (const job of jobs(teacherId)) latest.set(job.occurrence.key, job.status === 'ready');
      return JSON.stringify([...latest].sort(([left], [right]) => left.localeCompare(right)));
    },
    lessonJob: (teacherId,id) => db.jobs[id]?.teacherId===teacherId ? {...db.jobs[id]} : null,
    libraryJobs: teacherId => jobs(teacherId).map(publicJob),
    activeLessonKeys: teacherId => new Set(jobs(teacherId)
      .filter(job => job.desired === 'record' && job.cutoffAt > now()).map(job => job.occurrence.key)),
    updateSchedule(teacherId, id, occurrence) {
      const job = db.jobs[id];
      if (!job || job.teacherId !== teacherId || job.desired !== 'record' || !['waiting', 'recording'].includes(job.status)
        || !occurrence?.key || occurrence.key !== job.occurrence.key
        || (occurrence.lessonId || '') !== (job.occurrence.lessonId || '')
        || (occurrence.studentId || '') !== (job.occurrence.studentId || '')
        || !Number.isFinite(occurrence.startMs) || !Number.isFinite(occurrence.endMs)
        || occurrence.endMs <= occurrence.startMs || occurrence.endMs - occurrence.startMs > 6 * 3600_000) return null;
      const cutoffAt = Math.min(occurrence.endMs, job.startedAt + 5 * 3600_000);
      if (job.cutoffAt !== cutoffAt || JSON.stringify(job.occurrence) !== JSON.stringify(occurrence)) {
        job.occurrence = { ...occurrence }; job.cutoffAt = cutoffAt; job.updatedAt = now(); save();
      }
      return publicJob(job);
    },
    recentLessonJobs: (teacherId, since) => jobs(teacherId)
      .filter(job => job.startedAt >= since)
      .map(({ occurrence, status, startedAt, stoppedAt }) => ({ occurrence, status, startedAt, stoppedAt })),
    stopPlatformCall(teacherId, studentId) {
      // An explicit hangup must not wait for the reconnect grace. Scope it to
      // this individual platform call, never a group or Telemost recording.
      for (const job of jobs(teacherId)) {
        if (job.audioMode === 'platform' && !job.occurrence.lessonId && job.occurrence.studentId === studentId) {
          stop(job.occurrence.key, 'explicit-hangup');
        }
      }
    },
    stopGroupCall(teacherId, lessonId) {
      for (const job of jobs(teacherId)) {
        if (job.audioMode === 'platform' && job.occurrence.lessonId === lessonId) stop(job.occurrence.key, 'explicit-group-hangup');
      }
    },
    transitionPlatformCall(teacherId, target) {
      for (const job of jobs(teacherId)) {
        if (job.audioMode !== 'platform' || job.desired !== 'record') continue;
        const same = target.lessonId ? job.occurrence.lessonId === target.lessonId
          : !job.occurrence.lessonId && job.occurrence.studentId === target.studentId;
        if (!same) stop(job.occurrence.key, 'next-platform-lesson');
      }
    },
    requestStop(occurrenceKey) {
      for (const job of Object.values(db.jobs)) {
        if (job.occurrence.key !== occurrenceKey || job.desired !== 'record') continue;
        job.stopRequestedAt ||= now(); save();
      }
    },
    pair(teacherId) {
      for (const [key, value] of pairs) if (value.expiresAt < now() || value.teacherId === teacherId) pairs.delete(key);
      const code = token();
      pairs.set(hash(code), { teacherId, expiresAt: now() + 5 * 60_000 });
      return { code, expiresAt: now() + 5 * 60_000 };
    },
    exchange(code, name) {
      const entry = pairs.get(hash(code));
      if (!entry || entry.expiresAt <= now()) fail('Код подключения истёк или неверен', 401);
      pairs.delete(hash(code));
      // One active recorder per teacher prevents duplicate uploads from two PCs.
      for (const [id, d] of Object.entries(db.devices)) if (d.teacherId === entry.teacherId) delete db.devices[id];
      const secret = token(); const id = crypto.randomUUID();
      db.devices[id] = { id, teacherId: entry.teacherId, hash: hash(secret), name: String(name || 'Мой компьютер').slice(0, 80), lastSeenAt: 0 };
      save(); return { token: secret, deviceId: id };
    },
    authenticate(secret) {
      if (!secret) return null;
      const digest = hash(secret);
      return Object.values(db.devices).find((d) => d.hash === digest) || null;
    },
    configure(teacherId, value) {
      if (typeof value !== 'boolean') fail('enabled должен быть boolean');
      if (value && !Object.values(db.devices).some((d) => d.teacherId === teacherId && d.ready && now() - d.lastSeenAt < 15_000)) {
        fail('Сначала подключите пульт, настройте OBS и проверьте звук', 409);
      }
      db.teachers[teacherId] = { enabled: value };
      if (!value) jobs(teacherId).forEach((job) => stop(job.occurrence.key));
      save(); return settings(teacherId);
    },
    revoke(teacherId) {
      for (const [id, d] of Object.entries(db.devices)) if (d.teacherId === teacherId) delete db.devices[id];
      db.teachers[teacherId] = { enabled: false };
      jobs(teacherId).forEach((job) => stop(job.occurrence.key)); save();
    },
    start(teacherId, occurrence, title, cutoffAt, { audioMode = '', transitionFrom = '' } = {}) {
      if (!enabled(teacherId)) fail('Запись на компьютере не включена', 409);
      cutoffAt = recordingDeadline({ occurrence, cutoffAt });
      if (!occurrence?.key || !Number.isFinite(cutoffAt) || cutoffAt <= now()) fail('Занятие уже завершено', 409);
      const departing = db.jobs[transitionFrom];
      if (departing?.teacherId === teacherId && departing.occurrence.key !== occurrence.key) stop(departing.occurrence.key);
      const previous = jobs(teacherId).filter((job) => job.occurrence.key === occurrence.key).at(-1);
      const newGroupPart = previous?.desired === 'stop' && previous.occurrence.lessonId
        && !previous.quarantinedAt && ['explicit-group-hangup', 'lesson-ended', 'reconnect-timeout', 'next-platform-lesson'].includes(previous.stopReason)
        && audioMode === 'platform';
      if (previous && !newGroupPart) {
        if (previous.desired === 'record') {
          previous.occurrence = { ...occurrence };
          previous.cutoffAt = Math.min(cutoffAt, previous.startedAt + 5 * 3600_000);
          previous.lastActiveAt = now(); previous.stopRequestedAt = 0;
          if (['platform', 'telemost'].includes(audioMode)) previous.audioMode = audioMode;
          save();
        }
        // A disconnected browser may have stopped a job before OBS ever
        // received it. The route verifies that the lesson is active again.
        if (previous.desired === 'stop' && previous.status === 'waiting' && !previous.deviceId
          && !jobs(teacherId).some((job) => job.id !== previous.id && job.desired === 'record' && job.cutoffAt > now())) {
          previous.desired = 'record'; previous.stoppedAt = ''; previous.stopRequestedAt = 0;
          previous.audioMode = audioMode;
          previous.cutoffAt = Math.min(cutoffAt, now() + 5 * 3600_000); previous.updatedAt = now(); save();
        }
        return publicJob(previous);
      }
      if (jobs(teacherId).some((job) => job.desired === 'record' && job.cutoffAt > now())) fail('Сначала завершите предыдущий урок', 409);
      const id = crypto.randomUUID();
      db.jobs[id] = { id, teacherId, occurrence, title: String(title || 'Запись урока').slice(0, 150),
        ...(newGroupPart ? { previousJobId: previous.id } : {}),
        status: 'waiting', desired: 'record', audioMode, cutoffAt: Math.min(cutoffAt, now() + 5 * 3600_000), startedAt: now(), lastActiveAt: now(), updatedAt: now() };
      save(); return publicJob(db.jobs[id]);
    },
    recoverFile(device, id, recoveryId) {
      const previous = db.jobs[id];
      if (!previous || previous.teacherId !== device.teacherId) fail('Запись не найдена', 404);
      if (previous.deviceId && previous.deviceId !== device.id) fail('Запись принадлежит другому компьютеру', 409);
      if (!/^[a-f0-9-]{36}$/i.test(recoveryId || '') || previous.desired !== 'stop') fail('Некорректное восстановление');
      if (db.jobs[recoveryId]) {
        if (db.jobs[recoveryId].teacherId !== device.teacherId || db.jobs[recoveryId].recoveredFrom !== id) fail('Конфликт записи', 409);
        return publicJob(db.jobs[recoveryId]);
      }
      const latest = jobs(device.teacherId).filter((job) => job.occurrence.key === previous.occurrence.key).at(-1);
      if (latest.id !== id) fail('У урока уже есть более новая запись', 409);
      db.jobs[recoveryId] = { ...previous, id: recoveryId, recoveredFrom: id, previousJobId: '', status: 'saved', video: null, error: '',
        quarantinedAt: '', quarantineReason: '', updatedAt: now() };
      save(); return publicJob(db.jobs[recoveryId]);
    },
    resume(device, id, isActive) {
      const previous = db.jobs[id];
      if (!previous || previous.teacherId !== device.teacherId) fail('Запись не найдена', 404);
      if (previous.deviceId && previous.deviceId !== device.id) fail('Запись принадлежит другому компьютеру', 409);
      previous.cutoffAt = recordingDeadline(previous);
      if (!enabled(device.teacherId) || previous.cutoffAt <= now() || !isActive?.(previous)) fail('Сначала подключитесь к нужному уроку на платформе', 409);
      const latest = jobs(device.teacherId).filter((job) => job.occurrence.key === previous.occurrence.key).at(-1);
      if (latest.id !== previous.id) return publicJob(latest); // retry is idempotent
      if (previous.desired === 'record' && ['waiting', 'recording'].includes(previous.status)) return publicJob(previous);
      if (jobs(device.teacherId).some((job) => job.desired === 'record' && job.id !== id && job.cutoffAt > now())) fail('Уже начался другой урок', 409);
      const nextId = crypto.randomUUID();
      db.jobs[nextId] = { id: nextId, teacherId: previous.teacherId, occurrence: previous.occurrence,
        title: previous.title, previousJobId: id, deviceId: device.id, audioMode: previous.audioMode,
        status: 'waiting', desired: 'record', cutoffAt: previous.cutoffAt, startedAt: now(), lastActiveAt: now(), updatedAt: now() };
      save(); return publicJob(db.jobs[nextId]);
    },
    poll(device, ready, isEnded = () => false, isActive = null) {
      device.lastSeenAt = now(); device.ready = ready === true;
      for (const job of jobs(device.teacherId)) {
        job.cutoffAt = recordingDeadline(job);
        if (job.desired === 'record' && (job.cutoffAt <= now() || isEnded(job))) stop(job.occurrence.key);
        if (job.desired !== 'record') continue;
        if (isActive?.(job)) { job.lastActiveAt = now(); job.stopRequestedAt = 0; }
        else if ((job.stopRequestedAt && now() - job.stopRequestedAt >= RECORDING_RECONNECT_GRACE_MS)
          || (isActive && now() - (job.lastActiveAt || job.startedAt) >= RECORDING_RECONNECT_GRACE_MS)) stop(job.occurrence.key, 'reconnect-timeout');
      }
      save();
      return { currentLesson: publicJob(jobs(device.teacherId).filter((job) => job.cutoffAt > now() && isActive?.(job)).at(-1)), enabled: enabled(device.teacherId), serverNow: now(), jobs: jobs(device.teacherId).filter((job) => job.status !== 'ready').map(publicJob) };
    },
    report(device, id, payload) {
      const job = db.jobs[id];
      if (!job || job.teacherId !== device.teacherId) fail('Запись не найдена', 404);
      if (job.deviceId && job.deviceId !== device.id) fail('Запись принадлежит другому компьютеру', 409);
      if (job.quarantinedAt) fail('Эта запись скрыта. Подготовьте отдельную исправленную копию.', 409);
      const status = payload?.status;
      if (!['recording', 'saved', 'uploading', 'processing', 'ready', 'error'].includes(status)) fail('Некорректный статус');
      if (job.status === 'ready') return publicJob(job);
      if (status === 'ready') {
        const video = privateRutubeVideo(payload.url);
        if (!video) fail('Нужна закрытая ссылка Rutube с ключом p');
        if (job.desired !== 'stop') fail('Сначала завершите запись', 409);
        job.video = video;
        if (Number.isFinite(payload.durationMs) && payload.durationMs > 0 && payload.durationMs <= 5 * 3600000) job.durationMs = payload.durationMs;
      }
      if (status === 'recording' && job.desired !== 'record') fail('Урок уже завершён', 409);
      job.deviceId = device.id; job.status = status;
      if (['saved', 'uploading', 'processing'].includes(status)) { job.desired = 'stop'; job.stoppedAt ||= now(); }
      job.error = status === 'error' ? String(payload.error || 'Проверьте пульт на компьютере').slice(0, 240) : '';
      job.updatedAt = now(); save(); return publicJob(job);
    },
    replay(key) {
      const job = Object.values(db.jobs).filter((item) => item.occurrence.key === key).at(-1);
      return job ? { provider: 'rutube', available: job.status === 'ready', status: job.status,
        occurrence: job.occurrence, video: job.video || null, events: [], eventCount: 0,
        eventTypes: [], durationMs: job.durationMs || Math.max(0, (job.stoppedAt || now()) - job.startedAt),
        updatedAt: new Date(job.updatedAt).toISOString() } : null;
    },
  };
}

export function registerDesktopDeviceRoutes(app, store, { isEnded, isActive, refreshSchedule, archiveStatus, archiveMaterial, lessonTopic, pythonCatalog, pythonMaterial, mockReviewCatalog, mockReviewMaterial } = {}) {
  const handle = (fn) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { await fn(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось сохранить состояние записи' }); }
  };
  app.post('/api/desktop-recorder/pair', handle((req, res) => res.json(store.exchange(req.body?.code, req.body?.name))));
  app.use('/api/desktop-recorder', (req, res, next) => {
    const device = store.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!device) return res.status(401).json({ error: 'Подключите компьютер заново' });
    req.recorderDevice = device; next();
  });
  app.post('/api/desktop-recorder/poll', handle(async (req, res) => {
    await refreshSchedule?.(req.recorderDevice.teacherId);
    res.json(store.poll(req.recorderDevice, req.body?.ready, isEnded, isActive));
  }));
  app.post('/api/desktop-recorder/archive/status', handle((req, res) => {
    if (!archiveStatus) return res.status(503).json({ error: 'Добавление материалов из пульта ещё не настроено' });
    res.json(archiveStatus(req.recorderDevice.teacherId));
  }));
  app.post('/api/desktop-recorder/archive/lesson-topic', handle((req,res) => {
    if(!lessonTopic)return res.status(503).json({error:'Темы занятий ещё не настроены'});
    res.json(lessonTopic(req.recorderDevice.teacherId,req.body || {}));
  }));
  app.post('/api/desktop-recorder/mock-review/catalog', handle((req, res) => {
    if (!mockReviewCatalog) return res.status(503).json({ error: 'Запись разбора пробника ещё не настроена' });
    res.json(mockReviewCatalog(req.recorderDevice.teacherId));
  }));
  app.post('/api/desktop-recorder/mock-review/material', handle((req, res) => {
    if (!mockReviewMaterial) return res.status(503).json({ error: 'Запись разбора пробника ещё не настроена' });
    const result = mockReviewMaterial(req.recorderDevice.teacherId, req.body || {});
    res.status(result.created ? 201 : 200).json(result);
  }));
  app.post('/api/desktop-recorder/python/catalog', handle((req, res) => {
    if (!pythonCatalog) return res.status(503).json({ error: 'Запись теории Python ещё не настроена' });
    res.json(pythonCatalog(req.recorderDevice.teacherId));
  }));
  app.post('/api/desktop-recorder/python/material', handle((req, res) => {
    if (!pythonMaterial) return res.status(503).json({ error: 'Запись теории Python ещё не настроена' });
    const result = pythonMaterial(req.recorderDevice.teacherId, req.body || {});
    res.status(result.created ? 201 : 200).json(result);
  }));
  app.post('/api/desktop-recorder/archive/material', handle((req, res) => {
    if (!archiveMaterial) return res.status(503).json({ error: 'Добавление материалов из пульта ещё не настроено' });
    const result = archiveMaterial(req.recorderDevice.teacherId, req.body || {});
    res.status(result.created ? 201 : 200).json(result);
  }));
  app.post('/api/desktop-recorder/start-day', handle(async (req, res) => {
    await refreshSchedule?.(req.recorderDevice.teacherId);
    store.poll(req.recorderDevice, req.body?.ready, isEnded, isActive);
    res.json(store.configure(req.recorderDevice.teacherId, true));
  }));
  app.post('/api/desktop-recorder/share', handle((req, res) => res.json(store.share.device(req.recorderDevice.teacherId, req.body || {}))));
  app.post('/api/desktop-recorder/recover', handle((req, res) => res.json(store.recoverFile(req.recorderDevice, req.body?.id, req.body?.recoveryId))));
  app.post('/api/desktop-recorder/resume', handle(async (req, res) => {
    await refreshSchedule?.(req.recorderDevice.teacherId);
    res.json(store.resume(req.recorderDevice, req.body?.id, isActive));
  }));
  app.post('/api/desktop-recorder/jobs/:id', handle((req, res) => res.json(store.report(req.recorderDevice, req.params.id, req.body))));
  // Device credentials never reach the normal platform routes.
  app.use('/api/desktop-recorder', (_req, res) => res.status(404).json({ error: 'Not found' }));
}

export function registerDesktopRecordingRoutes(app, store, { teacherFor, resolveLesson, refreshSchedule, legacyRecordingEnabled = false }) {
  const handle = (fn, teacherOnly = true) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (teacherOnly && req.auth?.role !== 'teacher') return res.status(403).json({ error: 'Только для учителя' });
    try { await fn(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Не удалось обновить запись' }); }
  };
  app.get('/api/desktop-recording/settings', handle((req, res) => res.json({
    ...(req.auth.role === 'teacher' ? store.settings(req.auth.id) : { enabled: store.enabled(teacherFor(req.auth)) }),
    legacyRecordingEnabled,
  }), false));
  app.post('/api/desktop-recording/share', handle((req, res) => res.json(store.share.teacher(req.auth.id, req.body || {}))));
  app.post('/api/desktop-recording/pair', handle((req, res) => res.json(store.pair(req.auth.id))));
  app.get('/api/desktop-recording/download', handle((req, res) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="IVAN100-Recorder-Windows.zip"');
    res.send(recorderPackage());
  }));
  app.put('/api/desktop-recording/settings', handle((req, res) => res.json(store.configure(req.auth.id, req.body?.enabled))));
  app.delete('/api/desktop-recording/device', handle((req, res) => { store.revoke(req.auth.id); res.json({ ok: true }); }));
  app.post('/api/desktop-recording/start', handle(async (req, res) => {
    await refreshSchedule?.(req.auth.id);
    const result = await resolveLesson(req, res);
    if (!result) return;
    const { occurrence, cutoffAt, audioMode } = result;
    res.json(store.start(req.auth.id, occurrence, `Урок ${occurrence.dayKey} ${occurrence.time}`, cutoffAt, { audioMode, transitionFrom: req.body?.transitionFrom }));
  }));
  app.post('/api/desktop-recording/stop', handle((req, res) => {
    const job = store.settings(req.auth.id).jobs.find((item) => item.id === req.body?.id);
    if (!job) return res.status(404).json({ error: 'Запись не найдена' });
    if (req.body?.endRecording === true) store.stop(job.occurrence.key, job.occurrence.lessonId ? 'explicit-group-hangup' : 'explicit-hangup');
    else store.requestStop(job.occurrence.key);
    res.json({ ok: true });
  }));
}
