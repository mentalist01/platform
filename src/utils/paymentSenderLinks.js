// Use the same key as the bank notification matcher: case, spaces and periods
// must not let a second student silently take over an existing payer.
export const normalizePaymentSenderKey = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[ёЁ]/g, 'е')
  .toLocaleLowerCase('ru-RU')
  .replace(/[^a-z0-9а-я]+/gi, '');

export const findPaymentSenderConflict = (links, senderName, studentId) => {
  const key = normalizePaymentSenderKey(senderName);
  if (!key) return null;
  return (Array.isArray(links) ? links : []).find(link => (
    normalizePaymentSenderKey(link.senderKey || link.senderName) === key
    && String(link.studentId || '').trim() !== String(studentId || '').trim()
  )) || null;
};
