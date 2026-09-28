import { apiFetch, parseApiError, parseJsonResponse } from './api';

const request = async (base, path = '', body) => {
  const res = await apiFetch(`${base}${path}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return parseJsonResponse(res);
};
export const lessonReschedules = (path, body) => request('/api/lesson-reschedules', path, body);
export const weeklySchedules = (path, body) => request('/api/weekly-schedules', path, body);
