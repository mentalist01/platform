import { createStudentContactService } from './createStudentContactService';

export const studentContacts = createStudentContactService({
  listRoute: '/api/student-contacts',
  itemRoute: studentId => `/api/students/${encodeURIComponent(studentId)}/contact`,
});
