import test from 'node:test';
import assert from 'node:assert/strict';
import { teacherSubscriptionPolicy as status, subscriptionPriceChange } from './teacherSubscriptionPolicy.js';
import { matchTeacherPlatformPayment } from './teacherPlatformPayments.js';
const fee = { monthlyFee: 2000, dueDay: 31, payments: { '2026-09': { amount: 2000 } } };
const at = day => new Date(`${day}T09:00:00Z`);

test('November 1–15 inclusive is grace; Moscow midnight on 16 blocks', () => {
  for (const day of ['01', '08', '15']) {
    const s = status(fee, at(`2026-11-${day}`));
    assert.equal(s.accessAllowed, true); assert.equal(s.status, 'unpaid');
    assert.equal(s.month, '2026-11'); assert.equal(s.remaining, 2000);
  }
  assert.equal(status(fee, new Date('2026-11-15T20:59:59Z')).accessAllowed, true);
  const blocked = status(fee, new Date('2026-11-15T21:00:00Z'));
  assert.equal(blocked.accessAllowed, false); assert.equal(blocked.status, 'overdue');
  assert.equal(blocked.graceUntil, '2026-11-15');
});
test('missing October marks are not invented as debt on policy rollout', () => {
  assert.deepEqual(status(fee, at('2026-11-08')).outstanding.map(p => p.month), ['2026-11']);
});
test('old debt blocks after month/year changes even when the new month is paid', () => {
  const s = status({ ...fee, payments: { '2026-12': { amount: 2000 }, '2027-01': { amount: 2000 } } }, at('2027-01-01'));
  assert.equal(s.month, '2026-11'); assert.equal(s.accessAllowed, false); assert.equal(s.totalRemaining, 2000);
});
test('full payment unlocks; partial payment keeps the real remainder', () => {
  assert.equal(status({ ...fee, payments: { '2026-11': { amount: 2000 } } }, at('2026-11-20')).status, 'paid');
  const partial = status({ ...fee, payments: { '2026-11': { amount: 500 } } }, at('2026-11-20'));
  assert.equal(partial.remaining, 1500); assert.equal(partial.accessAllowed, false);
  assert.equal(status({ ...fee, monthlyFee: 0 }, at('2027-01-20')).status, 'disabled');
});
test('new paid access begins in its activation month; old accrued prices stay fixed', () => {
  const fresh = subscriptionPriceChange({}, 2000, at('2027-02-05'));
  assert.equal(fresh.billingStartMonth, '2027-02');
  assert.equal(status(fresh, at('2027-02-05')).outstanding.length, 1);
  const changed = { ...fee, ...subscriptionPriceChange(fee, 3000, at('2026-12-05')) };
  assert.equal(status(changed, at('2026-12-05')).outstanding[0].periodFee, 2000);
  assert.equal(status(changed, at('2026-12-05')).totalRemaining, 5000);
});
test('December bank transfer settles November arrears instead of losing old debt', () => {
  const result = matchTeacherPlatformPayment({ teachers: [{ id: 'teacher' }], subscriptions: { teacher: { ...fee, payerName: 'Петр П.' } }, senderKey: 'Петр П.', nameKey: v => v, amount: 2000, receivedAt: '2026-12-02T10:00:00Z', ownerId: 'owner', receiverId: 'owner' });
  assert.equal(result.month, '2026-11'); assert.equal(result.status, 'applied');
});
