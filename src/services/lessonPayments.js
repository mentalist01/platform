import { apiFetch, parseApiError, parseJsonResponse } from './api.js';

export const setLessonPayment = async (teacherId, occurrence, paid, options = {}) => {
  const response = await apiFetch('/api/teacher-lesson-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...options, teacherId, occurrence, paid }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};

export const getLessonPaymentQuote = async (teacherId, occurrence) => {
  const response = await apiFetch('/api/teacher-lesson-payment/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId, occurrence }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};
