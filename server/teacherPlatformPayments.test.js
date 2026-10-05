import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTeacherPlatformPayment as match } from './teacherPlatformPayments.js';
const input = { teachers: [{ id: 'owner' }, { id: 'other' }], subscriptions: { other: { payerName: 'Пётр П.', monthlyFee: 3000, payments: {} } }, senderKey: 'петрп', nameKey: value => String(value || '').toLowerCase().replaceAll('ё', 'е').replace(/[^а-я]/g, ''), amount: 3000, receivedAt: '2026-09-30T21:10:00Z', ownerId: 'owner', receiverId: 'owner' };
test('uses Moscow receipt month and exact fee', () => assert.deepEqual(match(input), { teacherId: 'other', month: '2026-10', status: 'applied', reason: '' }));
test('other bank receiver keeps student processing', () => assert.equal(match({ ...input, receiverId: 'other' }), null));
test('unknown payer keeps student processing', () => assert.equal(match({ ...input, senderKey: 'unknown' }), null));
test('wrong fee, disabled fee, collisions, no receiver and already paid require review', () => {
  for (const change of [
    { amount: 2999 }, { studentConflict: true }, { ownerId: '' },
    { subscriptions: { other: { ...input.subscriptions.other, monthlyFee: 0 } } },
    { subscriptions: { other: { ...input.subscriptions.other, payments: { '2026-10': { amount: 3000 } } } } },
    { subscriptions: { other: input.subscriptions.other, owner: input.subscriptions.other } },
  ]) assert.equal(match({ ...input, ...change }).status, 'pending');
});
