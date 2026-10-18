import { normalizeStudentParentContact } from '../src/utils/studentParentContact.js';
import { registerPrivateStudentContacts } from './privateStudentContacts.js';

// Separate storage: pupils can submit their own missing contact, but cannot read contacts.
export function registerStudentParentContacts(app, dependencies) {
  const { student } = dependencies;
  const { read, write } = registerPrivateStudentContacts(app, dependencies, {
    file: 'student-parent-contacts.json', listRoute: '/api/student-parent-contacts',
    itemRoute: '/api/students/:id/parent-contact', normalize: normalizeStudentParentContact, person: 'родителя',
  });
  const ownContact = action => (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.auth?.role !== 'student') return res.status(403).json({ error: 'Доступно только ученику.' });
    if (req.body?.studentId && req.body.studentId !== req.auth.id) return res.status(403).json({ error: 'Можно передать только свой контакт родителя.' });
    const pupil = student(req, res, req.auth.id);
    if (!pupil) return;
    if (!pupil.teacherId || pupil.deletedAt) return res.status(409).json({ error: 'Сначала нужно закрепить преподавателя.' });
    try { return action(req, res, pupil); }
    catch { return res.status(500).json({ error: 'Не удалось передать контакт. Попробуй ещё раз.' }); }
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
}
