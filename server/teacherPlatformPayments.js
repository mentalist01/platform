// A notification belongs to either a student's lessons or the platform fee, never both.
export function matchTeacherPlatformPayment({ teachers, subscriptions, senderKey, nameKey, amount, receivedAt, ownerId, receiverId, studentConflict = false }) {
  if (!senderKey) return null;
  const matches = teachers.filter(teacher => !teacher.deletedAt && nameKey(subscriptions[teacher.id]?.payerName) === senderKey);
  if (!matches.length) return null;
  if (ownerId && receiverId && receiverId !== ownerId) return null;
  const teacher = matches.length === 1 ? matches[0] : null;
  const date = new Date(receivedAt);
  // formatToParts avoids locale-dependent month/year ordering.
  const parts = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit' }).formatToParts(date) : [];
  const period = parts.length ? `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}` : '';
  const entry = teacher && subscriptions[teacher.id];
  let reason = '';
  if (!ownerId || receiverId !== ownerId) reason = 'Не настроен получатель платежей за платформу.';
  else if (!teacher || studentConflict) reason = 'Имя плательщика совпадает у нескольких получателей. Нужна ручная проверка.';
  else if (!period) reason = 'Не удалось определить месяц платежа.';
  else if (!(entry.monthlyFee > 0)) reason = 'У преподавателя не задана месячная стоимость платформы.';
  else if (Math.round(amount * 100) !== Math.round(entry.monthlyFee * 100)) reason = `Сумма отличается от месячной стоимости ${entry.monthlyFee} ₽. Нужна ручная проверка.`;
  else if (entry.payments?.[period]) reason = `За ${period} уже есть отметка оплаты. Нужна ручная проверка.`;
  return { teacherId: teacher?.id || '', month: period, reason, status: reason ? 'pending' : 'applied' };
}
