import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Private staff notes must never enter student profiles, search or report payloads.
export function registerStudentPlacementNotes(app, { dataDir, staff, student }) {
  const filename = path.join(dataDir, 'student-placement-notes.json');
  const read = () => {
    if (!fs.existsSync(filename)) return [];
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.notes)) throw new Error('Invalid placement notes');
    return value.notes;
  };
  const empty = { text: '', revision: '', updatedAt: null };
  const publicNote = record => record ? { text: record.text, revision: record.revision, updatedAt: record.updatedAt } : empty;
  const wrap = action => (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!staff(req, res)) return;
    const pupil = student(req, res, req.params.id);
    if (!pupil) return;
    try { return action(req, res, pupil); }
    catch (error) {
      console.error('[placement-notes] request failed:', error.name);
      return res.status(500).json({ error: 'Не удалось загрузить или сохранить заметку об уровне.' });
    }
  };
  app.get('/api/students/:id/placement-note', wrap((req, res, pupil) => {
    const record = read().find(value => value.studentId === pupil.id && value.teacherId === pupil.teacherId);
    return res.json({ note: publicNote(record) });
  }));
  app.patch('/api/students/:id/placement-note', wrap((req, res, pupil) => {
    if (typeof req.body?.text !== 'string' || typeof req.body?.revision !== 'string' || req.body.text.length > 6000) {
      return res.status(400).json({ error: 'Заметка должна быть текстом до 6000 символов. Обновите её перед сохранением.' });
    }
    const records = read();
    const index = records.findIndex(value => value.studentId === pupil.id && value.teacherId === pupil.teacherId);
    const previous = index < 0 ? null : records[index];
    if (req.body.revision !== (previous?.revision || '')) {
      return res.status(409).json({ error: 'Заметку уже изменили в другом окне. Скопируйте свой текст и загрузите свежую версию.' });
    }
    // Keep a revision even for an empty note, so a stale editor cannot restore deleted text.
    const record = { studentId: pupil.id, teacherId: pupil.teacherId, text: req.body.text.trim(), revision: randomUUID(), updatedAt: new Date().toISOString() };
    if (index < 0) records.push(record); else records[index] = record;
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, notes: records }, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return res.json({ note: publicNote(record) });
  }));
}
