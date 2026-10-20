import { apiFetch } from './api';
export async function fetchGroupLibrary() {
  const response = await apiFetch('/api/student-group-library');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить занятия и записи');
  return data;
}

export async function setStudentGroupAccess(studentId, enabled) {
  const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/group-access`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось изменить доступ');
  return data;
}
