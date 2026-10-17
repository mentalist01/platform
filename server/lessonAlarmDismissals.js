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
  app.get('/api/lesson-alarm', (req, res) => {
    const id = teacher(req, res);
    if (id) res.json(read(id));
  });
  app.post('/api/lesson-alarm/stop', (req, res, next) => {
    const id = teacher(req, res);
    if (!id) return;
    const timestamp = req.body?.stoppedAtMs;
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
      return res.status(400).json({ error: 'Некорректное время отключения' });
    }
    // A delayed request silences only alarms already due at the original click.
    const at = Math.min(now(), timestamp);
    if (at <= now() - DAY_MS || at <= (records.get(id) || 0)) return res.json(read(id));
    try {
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
      return res.json(state);
    } catch (error) { return next(error); }
  });
}
