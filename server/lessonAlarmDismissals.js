import fs from 'node:fs';
import path from 'node:path';

const DAY_MS = 86_400_000;

export function registerLessonAlarmDismissals(app, { dataDir, notify = () => {}, now = Date.now }) {
  const file = path.join(dataDir, 'lesson-alarm-dismissals.json');
  const records = new Map(fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8')).map(record => [record.teacherId, record.stoppedAtMs])
    : []);
  const teacher = (req, res) => {
    const id = String(req.auth?.id || '');
    if (req.auth?.role !== 'teacher' || !id) {
      res.status(403).json({ error: 'Доступно только преподавателю' });
      return '';
    }
    res.setHeader('Cache-Control', 'no-store');
    return id;
  };
  const read = id => ({ stoppedAtMs: Math.max(0, records.get(id) || 0) });
  const stop = (id, timestamp) => {
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
      throw Object.assign(new Error('Некорректное время отключения'), { status: 400 });
    }
    // Delayed requests cannot silence a later lesson; both transports share
    // the same persisted cutoff and account-scoped authorization.
    const at = Math.min(now(), timestamp);
    if (at <= now() - DAY_MS || at <= (records.get(id) || 0)) return read(id);
    const updated = new Map([...records].filter(([, time]) => time > now() - DAY_MS));
    updated.set(id, at);
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify([...updated].map(([teacherId, stoppedAtMs]) => ({ teacherId, stoppedAtMs }))), { mode: 0o600 });
    fs.renameSync(temporary, file);
    records.clear();
    for (const [key, value] of updated) records.set(key, value);
    const state = read(id);
    notify(id, state);
    return state;
  };
  app.get('/api/lesson-alarm', (req, res) => {
    const id = teacher(req, res);
    if (id) res.json(read(id));
  });
  app.post('/api/lesson-alarm/stop', (req, res, next) => {
    const id = teacher(req, res);
    if (!id) return;
    try { return res.json(stop(id, req.body?.stoppedAtMs)); }
    catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      return next(error);
    }
  });
  return { read, stop };
}

export function attachLessonAlarmSocket(ws, auth, controller, send) {
  if (auth?.role !== 'teacher' || !auth.id) return;
  const teacherId = String(auth.id);
  const reply = (alarm, requestId, error) => send(ws, { type: 'lesson-alarm-state', teacherId, alarm, requestId, error });
  reply(controller.read(teacherId));
  ws.on('message', raw => {
    let payload;
    try { payload = JSON.parse(String(raw)); } catch { return; }
    if (payload?.type !== 'lesson-alarm-stop') return;
    const requestId = typeof payload.requestId === 'string' ? payload.requestId.slice(0, 80) : '';
    try { reply(controller.stop(teacherId, payload.stoppedAtMs), requestId); }
    catch (error) { reply(null, requestId, error.status === 400 ? error.message : 'Не удалось сохранить остановку будильника'); }
  });
}
