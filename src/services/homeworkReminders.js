import { apiFetch, parseApiError, parseJsonResponse } from './api';

export const homeworkReminders = async (id) => {
  const response = await apiFetch(`/api/teacher-homework-reminders${id ? `/${encodeURIComponent(id)}/dismiss` : ''}`,
    id ? { method: 'POST' } : {});
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};
