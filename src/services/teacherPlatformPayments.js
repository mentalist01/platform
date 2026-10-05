import { apiFetch } from './api';
async function json(route, options) {
  const res = await apiFetch(route, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Не удалось получить данные оплаты');
  return body;
}
export const saveTeacherPlatformPayment = (teacherId, monthlyFee, dueDay, payerName) => json('/api/teacher-subscription', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId, monthlyFee, dueDay, payerName }),
});
export const teacherPlatformNotifications = () => json('/api/teacher-subscription/notifications');
