import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBalanceAccount, addBalanceReceipt, availableCents, reconcileBalanceAccount,
  releaseBalanceAllocation, reserveBalanceAllocation, balancePaidByMonth,
  normalizeStudentBalances, possibleManualReceipts, confirmBalancePending,
} from './studentPaymentBalances.js';

const now = '2026-10-07T10:00:00.000Z';
const lesson = (key, date, extra = {}) => ({ markKey: key, dayKey: date, time: '18:00', cents: 200000, eligible: true, ...extra });
const account = () => createBalanceAccount({ now });
const receipt = (a, id, amount, extra = {}) => addBalanceReceipt(a, { id, amount, at: now, ...extra }, now);
const income = a => Object.values(balancePaidByMonth(a)).reduce((sum, amount) => sum + amount, 0);

test('annual prepayment is retained, only scheduled lessons are allocated, retries cannot create money', () => {
  const a = account();
  receipt(a, 'year', 160000);
  assert.equal(receipt(a, 'year', 160000).duplicate, true);
  assert.throws(() => receipt(a, 'year', 2000));
  reconcileBalanceAccount(a, [lesson('future', '2026-10-08'), lesson('past', '2026-10-05')], now);
  assert.deepEqual(Object.keys(a.allocations), ['past', 'future']);
  assert.equal(availableCents(a), 15600000);
  assert.equal(income(a), 160000);
  normalizeStudentBalances({ version: 1, accounts: { student: a } });
});

test('confirmed move releases duplicate old payment, pays next debt, and conserves income', () => {
  const old = lesson('old', '2026-09-28');
  const moved = lesson('moved', '2026-10-03', { moveFromKeys: ['old'] });
  const next = lesson('next', '2026-10-07');
  const a = createBalanceAccount({ now, openingByMonth: { '2026-09': 2000, '2026-10': 2000 }, paid: [old, moved] });
  reconcileBalanceAccount(a, [moved, next], now);
  assert.deepEqual(Object.keys(a.allocations), ['moved', 'next']);
  assert.equal(availableCents(a), 0);
  assert.equal(income(a), 4000);
  const count = a.entries.length;
  reconcileBalanceAccount(a, [moved, next], now);
  assert.equal(a.entries.length, count);
});

test('one payment travels with an identifiable move at the original price', () => {
  const a = createBalanceAccount({ now, openingByMonth: { '2026-09': 2000 }, paid: [lesson('old', '2026-09-28', { identity: 'series:original' })] });
  reconcileBalanceAccount(a, [lesson('new', '2026-10-03', { identity: 'series:original', cents: 250000 })], now);
  assert.equal(a.allocations.new.cents, 200000);
  assert.equal(income(a), 2000);
});

test('unknown disappearance locks funds; explicit cancellation releases; trial never spends', () => {
  const a = createBalanceAccount({ now, openingByMonth: { '2026-09': 2000 }, paid: [lesson('old', '2026-09-28')] });
  assert.equal(reconcileBalanceAccount(a, [lesson('new', '2026-10-07')], now).length, 1);
  assert.equal(a.allocations.new, undefined);
  reconcileBalanceAccount(a, [lesson('old', '2026-09-28', { eligible: false }), lesson('trial', '2026-10-06', { eligible: false }), lesson('new', '2026-10-07')], now);
  assert.equal(a.allocations.trial, undefined);
  assert.ok(a.allocations.new);
});

test('manual undo blocks the lesson across refresh and returns money to next lesson', () => {
  const a = account();
  receipt(a, 'single', 2000);
  const lessons = [lesson('first', '2026-10-05'), lesson('next', '2026-10-07')];
  reconcileBalanceAccount(a, lessons, now);
  releaseBalanceAllocation(a, 'first', now, { block: true });
  reconcileBalanceAccount(a, lessons, now);
  assert.equal(a.allocations.first, undefined);
  assert.ok(a.allocations.next);
  assert.throws(() => reserveBalanceAllocation(a, lessons[0], now, { force: true }), /Недостаточно/);
});

test('manual receipt and later bank notification are linked without crediting twice', () => {
  const a = account();
  receipt(a, 'manual:1', 4000, { senderName: 'Наталья К.' });
  const bank = { id: 'bank:1', amount: 4000, at: now, senderName: 'Наталья К', source: 'bank', aliases: ['hash'] };
  const matches = possibleManualReceipts(a, bank);
  assert.equal(matches.length, 1);
  a.pending[bank.id] = { ...bank, manualReceiptIds: matches.map(e => e.id) };
  confirmBalancePending(a, bank.id, matches[0].id, now);
  assert.equal(receipt(a, 'bank:1', 4000).duplicate, true);
  assert.equal(availableCents(a), 400000);
  assert.equal(possibleManualReceipts(a, bank).length, 0);
});

test('teacher confirms that matching equal amount is a separate payment', () => {
  const a = account();
  receipt(a, 'manual:1', 4000);
  a.pending.bank = { id: 'bank', amount: 4000, at: now, source: 'bank', manualReceiptIds: [a.entries.at(-1).id] };
  confirmBalancePending(a, 'bank', '', now);
  assert.equal(availableCents(a), 800000);
});

test('migration cannot invent receipts or permit overspending; corruption stops mutations', () => {
  assert.throws(() => createBalanceAccount({ now, openingByMonth: { '2026-09': 2000 }, paid: [lesson('one', '2026-09-28'), lesson('two', '2026-09-30')] }), /Сумма/);
  assert.throws(() => normalizeStudentBalances({ version: 2, accounts: {} }), /Поврежд/);
  const a = account();
  a.entries.push({ id: 'corrupt', cents: 1, creditCents: NaN });
  assert.throws(() => normalizeStudentBalances({ version: 1, accounts: { student: a } }), /Поврежд/);
});
