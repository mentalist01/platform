import { apiFetch } from './api';

async function request(route, options) {
  const response = await apiFetch(route, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Не удалось получить настройки автооплаты.');
  return body;
}

export const getPaymentConnection = () => request('/api/teacher-payment-connection');
export const createPaymentConnection = (rotate = false) => request('/api/teacher-payment-connection', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotate }),
});
export const getPaymentNotificationHistory = () => request('/api/payment-notifications');

export const paymentConnectionBody = (connection) => JSON.stringify({
  secret: connection.secret,
  teacherId: connection.teacherId,
  title: '{not_title}',
  text: '{notification}',
}, null, 2);
