import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeStudentParentContact } from '../src/utils/studentParentContact.js';

// Separate staff-only storage: contacts never enter student/parent payloads.
export function registerStudentParentContacts(app, { dataDir, staff, student, students, isAdmin }) {
  const filename = path.join(dataDir, 'student-parent-contacts.json');
  const read = () => {
    if (!fs.existsSync(filename)) return [];
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.contacts)) throw new Error('Invalid parent contact data');
    return value.contacts;
  };
  const wrap = action => (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!staff(req, res)) return;
    try { return action(req, res); }
    catch (error) { console.error('[parent-contacts] request failed:', error.name); return res.status(500).json({ error: 'Не удалось сохранить или загрузить контакт родителя.' }); }
  };
  app.get('/api/student-parent-contacts', wrap((req, res) => {
    const teacherId = isAdmin(req.auth) ? String(req.query.teacherId || '').trim() : req.auth.id;
    const accessible = new Map(students().filter(value => !value.deletedAt && (!teacherId || value.teacherId === teacherId)).map(value => [value.id, value]));
    const contacts = Object.fromEntries(read().filter(value => accessible.get(value.studentId)?.teacherId === value.teacherId)
      .map(value => [value.studentId, { name: value.name, url: value.url }]));
    return res.json({ contacts });
  }));
  app.patch('/api/students/:id/parent-contact', wrap((req, res) => {
    const pupil = student(req, res, req.params.id);
    if (!pupil) return;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !Object.hasOwn(req.body, 'url')) {
      return res.status(400).json({ error: 'Укажите ссылку на контакт родителя.' });
    }
    let contact;
    try { contact = normalizeStudentParentContact(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const records = read().filter(value => !(value.studentId === pupil.id && value.teacherId === pupil.teacherId));
    if (contact.url) records.push({ teacherId: pupil.teacherId, studentId: pupil.id, ...contact, updatedAt: new Date().toISOString() });
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, contacts: records }, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return res.json({ studentId: pupil.id, contact });
  }));
}
