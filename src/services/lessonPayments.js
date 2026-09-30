import { apiFetch, parseApiError, parseJsonResponse } from './api.js';

export const setLessonPayment = async (teacherId, occurrence, paid) => {
  const response = await apiFetch('/api/teacher-lesson-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacherId, occurrence, paid }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};
