import { apiFetch } from './api';

async function request(route, options) {
  const response = await apiFetch(route, options);
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Не удалось получить настройки автооплаты.'), { code: body.code });
  return body;
}

export const getPaymentConnection = () => request('/api/teacher-payment-connection');
export const createPaymentConnection = (rotate = false) => request('/api/teacher-payment-connection', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotate }),
});
export const getPaymentNotificationHistory = () => request('/api/payment-notifications');
export const getPaymentReview = (teacherId, id) => request(`/api/payment-notifications/${encodeURIComponent(id)}/review?teacherId=${encodeURIComponent(teacherId)}`);
export const resolvePaymentReview = (teacherId, id, body) => request(`/api/payment-notifications/${encodeURIComponent(id)}/review`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, teacherId }),
});

export const paymentConnectionBody = (connection) => JSON.stringify({
  secret: connection.secret,
  teacherId: connection.teacherId,
  title: '{not_title}',
  text: '{notification}',
}, null, 2);
