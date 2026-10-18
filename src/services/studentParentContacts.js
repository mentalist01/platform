import { apiFetch, parseApiError } from './api';
import { createStudentContactService } from './createStudentContactService';

export const parentContacts = createStudentContactService({
  listRoute: '/api/student-parent-contacts',
  itemRoute: studentId => `/api/students/${encodeURIComponent(studentId)}/parent-contact`,
});
export const parentContactSnapshot = parentContacts.snapshot;
export const parentContactsSnapshot = parentContacts.all;
export const subscribeParentContacts = parentContacts.subscribe;
export const loadParentContacts = parentContacts.load;
export const saveParentContact = parentContacts.save;

export async function ownParentContact(contact) {
  const response = await apiFetch('/api/my-parent-contact', contact ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact),
  } : {});
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
}
