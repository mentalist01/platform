import assert from 'node:assert/strict';
import test from 'node:test';
import { canReviewSmsPayment, isSmsPaymentNotification } from './paymentSmsReview.js';

test('SMS actions are limited to positive pending student SMS, including old saved rows', () => {
  const old = { reason: 'SMS от банка: требуется ручная проверка.', status: 'pending', amount: 6000, currency: 'RUB' };
  assert.equal(canReviewSmsPayment(old), true);
  assert.equal(isSmsPaymentNotification({ reviewSource: 'sms', reason: 'Учтено вручную' }), true);
  for (const patch of [{ status: 'applied' }, { status: 'duplicate' }, { amount: 0 }, { amount: -1 }, { currency: 'USD' }, { paymentTarget: 'teacher-platform' }, { reason: 'Не похоже на входящий платёж.' }]) {
    assert.equal(canReviewSmsPayment({ ...old, ...patch }), false);
  }
});
