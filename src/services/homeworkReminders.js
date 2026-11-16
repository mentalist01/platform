import { apiFetch, parseApiError, parseJsonResponse } from './api';

export const homeworkReminders = async (id) => {
  const response = await apiFetch(`/api/teacher-homework-reminders${id ? `/${encodeURIComponent(id)}/dismiss` : ''}`,
    id ? { method: 'POST' } : {});
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};

export const homeworkSuggestion = async (id, signal) => {
  const response = await apiFetch(`/api/reply-assistant/learning/homework-suggestions/${encodeURIComponent(id)}`, {signal});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};
