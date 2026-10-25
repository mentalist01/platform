export const isSmsPaymentNotification = entry => entry?.reviewSource === 'sms'
  || /^SMS от банка:/.test(String(entry?.reason || ''));

export const canReviewSmsPayment = entry => isSmsPaymentNotification(entry)
  && entry.status === 'pending' && entry.currency === 'RUB' && Number(entry.amount) > 0
  && entry.paymentTarget !== 'teacher-platform';
