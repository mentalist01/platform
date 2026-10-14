import { apiFetch, parseApiError, parseJsonResponse } from './api';

export const homeworkLivesRequest = async (route = '', body, method = body ? 'POST' : 'GET') => {
  const response = await apiFetch(`/api/homework-lives${route}`, {
    method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};
export const teacherHomeworkLives = async () => {
  const response = await apiFetch('/api/teacher-homework-lives');
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};
export const notifyHomeworkLivesUpdated = () => window.dispatchEvent(new Event('homework-lives-updated'));
