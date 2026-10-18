import { normalizeStudentContact } from '../src/utils/studentParentContact.js';
import { registerPrivateStudentContacts } from './privateStudentContacts.js';

export function registerStudentContacts(app, dependencies) {
  registerPrivateStudentContacts(app, dependencies, {
    file: 'student-contacts.json', listRoute: '/api/student-contacts',
    itemRoute: '/api/students/:id/contact', normalize: normalizeStudentContact, person: 'ученика',
  });
}
