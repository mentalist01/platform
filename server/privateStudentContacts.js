import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Contact records stay outside the pupil directory, chat payloads and exports.
export function registerPrivateStudentContacts(app, { dataDir, staff, student, students, isAdmin }, { file, listRoute, itemRoute, normalize, person }) {
  const filename = path.join(dataDir, file);
  const read = () => {
    if (!fs.existsSync(filename)) return [];
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.contacts)) throw new Error('Invalid contact data');
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
  const wrap = action => (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!staff(req, res)) return;
    try { return action(req, res); }
    catch (error) { console.error('[student-contacts] request failed:', error.name); return res.status(500).json({ error: `Не удалось сохранить или загрузить контакт ${person}.` }); }
  };
  app.get(listRoute, wrap((req, res) => {
    const teacherId = isAdmin(req.auth) ? String(req.query.teacherId || '').trim() : req.auth.id;
    const accessible = new Map(students().filter(value => !value.deletedAt && (!teacherId || value.teacherId === teacherId)).map(value => [value.id, value]));
    const contacts = Object.fromEntries(read().filter(value => {
      const pupil = accessible.get(value?.studentId);
      return pupil && pupil.teacherId === value.teacherId;
    })
      .map(value => [value.studentId, { name: value.name, url: value.url,
        ...(Array.isArray(value.contacts)?{contacts:value.contacts,notes:value.notes || ''}:{}),
        ...(value.providedByStudent ? { providedByStudent: true } : {}) }]));
    return res.json({ contacts });
  }));
  app.patch(itemRoute, wrap((req, res) => {
    const pupil = student(req, res, req.params.id);
    if (!pupil) return;
    if (!pupil.teacherId || pupil.deletedAt) return res.status(409).json({ error: 'Ученик не закреплён за преподавателем.' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || (!Object.hasOwn(req.body, 'url')&&!Object.hasOwn(req.body,'contacts'))) {
      return res.status(400).json({ error: `Укажите ссылку на контакт ${person}.` });
    }
    const current=read(),previous=current.find(value=>value.studentId===pupil.id&&value.teacherId===pupil.teacherId);
    let contact;
    try {
      // A still-open older client may edit the primary link. Keep additional
      // channels and notes unless it explicitly removes the entire contact.
      const input=!Object.hasOwn(req.body,'contacts')&&req.body.url&&Array.isArray(previous?.contacts)
        ?{...req.body,contacts:[{label:previous.contacts[0]?.label || '',value:req.body.url},...previous.contacts.slice(1)],notes:previous.notes || ''}:req.body;
      contact = normalize(input);
    }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const records = current.filter(value => !(value.studentId === pupil.id && value.teacherId === pupil.teacherId));
    if (contact.url || contact.notes || (Array.isArray(contact.contacts)&&contact.name)) records.push({ teacherId: pupil.teacherId, studentId: pupil.id, ...contact, updatedAt: new Date().toISOString() });
    write(records);
    return res.json({ studentId: pupil.id, contact });
  }));
  return { read, write };
}
