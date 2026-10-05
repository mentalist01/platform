import { apiFetch } from './api';
export async function fetchGroupLibrary() {
  const response = await apiFetch('/api/student-group-library');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить занятия и записи');
  return data;
}
