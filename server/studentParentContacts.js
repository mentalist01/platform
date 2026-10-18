import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeStudentParentContact } from '../src/utils/studentParentContact.js';

// Separate storage: pupils can submit their own missing contact, but cannot read contacts.
export function registerStudentParentContacts(app, { dataDir, staff, student, students, isAdmin }) {
  const filename = path.join(dataDir, 'student-parent-contacts.json');
  const read = () => {
    if (!fs.existsSync(filename)) return [];
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.contacts)) throw new Error('Invalid parent contact data');
    return value.contacts;
  };
  const write = records => {
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, contacts: records }, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  };
  const ownContact = action => (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.auth?.role !== 'student') return res.status(403).json({ error: 'Доступно только ученику.' });
    if (req.body?.studentId && req.body.studentId !== req.auth.id) return res.status(403).json({ error: 'Можно передать только свой контакт родителя.' });
    const pupil = student(req, res, req.auth.id);
    if (!pupil) return;
    if (!pupil.teacherId || pupil.deletedAt) return res.status(409).json({ error: 'Сначала нужно закрепить преподавателя.' });
    try { return action(req, res, pupil); }
    catch (error) { return res.status(500).json({ error: 'Не удалось передать контакт. Попробуй ещё раз.' }); }
  };
  app.get('/api/my-parent-contact', ownContact((req, res, pupil) => res.json({
    added: read().some(value => value.studentId === pupil.id && value.teacherId === pupil.teacherId && value.url),
  })));
  app.post('/api/my-parent-contact', ownContact((req, res, pupil) => {
    const records = read();
    // A pupil never overwrites a contact already supplied by the teacher.
    if (records.some(value => value.studentId === pupil.id && value.teacherId === pupil.teacherId && value.url)) return res.json({ added: true });
    let contact;
    try {
      contact = normalizeStudentParentContact(req.body);
      if (!contact.url) throw new Error('Укажи телефон или ссылку на контакт родителя.');
    } catch (error) { return res.status(400).json({ error: error.message }); }
    write([...records, { teacherId: pupil.teacherId, studentId: pupil.id, ...contact, providedByStudent: true, updatedAt: new Date().toISOString() }]);
    return res.json({ added: true });
  }));
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
      .map(value => [value.studentId, { name: value.name, url: value.url, ...(value.providedByStudent ? { providedByStudent: true } : {}) }]));
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
    write(records);
    return res.json({ studentId: pupil.id, contact });
  }));
}
