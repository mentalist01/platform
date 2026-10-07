import { apiFetch, parseApiError, parseJsonResponse } from './api';

const request = async (teacherId, path = '', body) => {
  const query = body === undefined && teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : '';
  const response = await apiFetch(`/api/student-payment-balances${path}${query}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, teacherId }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return parseJsonResponse(response);
};
export const getStudentBalances = teacherId => request(teacherId);
export const enableStudentBalances = (teacherId, previewToken) => request(teacherId, '/enable', { previewToken });
export const addStudentReceipt = (teacherId, studentId, body) => request(teacherId, `/${encodeURIComponent(studentId)}/receipts`, body);
export const confirmStudentReceipt = (teacherId, studentId, notificationId, manualEntryId) => request(teacherId, `/${encodeURIComponent(studentId)}/confirm`, { notificationId, manualEntryId });
export const releaseStudentPayment = (teacherId, studentId, markKey) => request(teacherId, `/${encodeURIComponent(studentId)}/release`, { markKey, confirmed: true });
