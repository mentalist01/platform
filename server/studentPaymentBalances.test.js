import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBalanceAccount, addBalanceReceipt, availableCents, reconcileBalanceAccount,
  releaseBalanceAllocation, reserveBalanceAllocation, balancePaidByMonth,
  normalizeStudentBalances, possibleManualReceipts, confirmBalancePending,
  adjustBalance, balanceSummary, settleBalanceLesson,
} from './studentPaymentBalances.js';

const now = '2026-10-07T10:00:00.000Z';
const lesson = (key, date, extra = {}) => ({ markKey: key, dayKey: date, time: '18:00', cents: 200000, eligible: true, ...extra });
const account = () => createBalanceAccount({ now });
const receipt = (a, id, amount, extra = {}) => addBalanceReceipt(a, { id, amount, at: now, ...extra }, now);
const income = a => Object.values(balancePaidByMonth(a)).reduce((sum, amount) => sum + amount, 0);

test('automatic payments skip pre-tracking history without erasing confirmed old payments', () => {
  const paidArchive = lesson('paid-archive', '2026-04-20', { autoEligible: false });
  const untracked = lesson('untracked', '2026-03-02', { autoEligible: false });
  const trackedDebt = lesson('tracked-debt', '2026-10-12', { autoEligible: true });
  const future = lesson('next-week', '2026-10-19', { autoEligible: true });
  const a = createBalanceAccount({ now, openingByMonth: { '2026-04': 2000 }, paid: [paidArchive] });
  receipt(a, 'monday-payment', 2000);
  reconcileBalanceAccount(a, [untracked, paidArchive, future, trackedDebt], now);
  assert.deepEqual(Object.keys(a.allocations), ['paid-archive', 'tracked-debt']);
  assert.equal(a.allocations['paid-archive'].imported, true);
  assert.equal(availableCents(a), 0);
  assert.equal(income(a), 4000);
  const entries = a.entries.length;
  reconcileBalanceAccount(a, [untracked, paidArchive, future, trackedDebt], now);
  assert.equal(a.entries.length, entries);
  normalizeStudentBalances({ version: 1, accounts: { student: a } });
});

test('the teacher can still explicitly pay an archived occurrence from an existing balance', () => {
  const a = account();
  const archived = lesson('explicit-archive', '2026-03-02', { autoEligible: false });
  receipt(a, 'manual-confirmed', 2000);
  reconcileBalanceAccount(a, [archived], now);
  assert.equal(availableCents(a), 200000);
  reserveBalanceAllocation(a, archived, now, { force: true });
  assert.equal(availableCents(a), 0);
  assert.equal(income(a), 2000);
});

test('a manual transfer pays the selected lesson first and cannot be credited twice', () => {
  const a = account();
  const selected = lesson('selected', '2026-10-13');
  const receipt = { confirmed: true, idempotencyKey: 'selected-transfer-2000', amount: 2000, receivedAt: now };
  const result = settleBalanceLesson(a, selected, { source: 'receipt', receipt }, now);
  assert.equal(result.receivedAmount, 2000);
  reconcileBalanceAccount(a, [lesson('older-debt', '2026-10-06'), selected], now);
  assert.deepEqual(Object.keys(a.allocations), ['selected']);
  assert.equal(settleBalanceLesson(a, selected, { source: 'receipt', receipt }, now).alreadyPaid, true);
  assert.equal(balanceSummary(a).received, 2000);
  assert.equal(availableCents(a), 0);
  assert.equal(possibleManualReceipts(a, { amount: 2000, at: now, senderName: 'Payer' }).length, 1);
  normalizeStudentBalances({ version: 1, accounts: { student: a } });
});

test('using a balance creates no receipt and an existing equal transfer requires review', () => {
  const a = account();
  receipt(a, 'bank-transfer', 2000);
  const selected = lesson('selected', '2026-10-13');
  const before = structuredClone(a);
  assert.throws(() => settleBalanceLesson(a, selected, { source: 'receipt', receipt: {
    confirmed: true, idempotencyKey: 'new-but-similar-transfer', amount: 2000, receivedAt: now,
  } }, now), error => error.code === 'balance_existing_receipt');
  assert.deepEqual(a, before);
  settleBalanceLesson(a, selected, { source: 'balance' }, now);
  assert.equal(a.entries.filter(e => e.type === 'receipt').length, 1);
  assert.equal(income(a), 2000);
});

test('invalid, partial and unconfirmed manual receipts never change the journal', () => {
  for (const fields of [{ confirmed: false }, { amount: 1000 }, { receivedAt: 'invalid' }, { idempotencyKey: '' }]) {
    const a = account();
    const before = structuredClone(a);
    assert.throws(() => settleBalanceLesson(a, lesson('selected', '2026-10-13'), { source: 'receipt', receipt: {
      confirmed: true, idempotencyKey: 'valid-manual-operation', amount: 2000, receivedAt: now, ...fields,
    } }, now));
    assert.deepEqual(a, before);
  }
});

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

const googleLesson = (key, date, extra = {}) => lesson(key, date, {
  external: true, eventId: `google-ical-${key}`, identity: `calendar:${key}`, durationMinutes: 60, ...extra,
});

test('one-to-one same-day Google reschedules preserve the original receipt and do not recredit', () => {
  const a = account();
  const first = googleLesson('first-18', '2026-11-17');
  const second = googleLesson('second-18', '2026-11-24');
  receipt(a, 'bank-first', 2000);
  reserveBalanceAllocation(a, first, now);
  receipt(a, 'bank-second', 2000);
  reserveBalanceAllocation(a, second, now);
  const next = [
    googleLesson('first-19', first.dayKey, { time: '19:00' }),
    googleLesson('second-19', second.dayKey, { time: '19:00' }),
    googleLesson('third', '2026-11-27'),
  ];
  const options = { sameDayMoveSince: '2026-11-11' };
  assert.equal(reconcileBalanceAccount(a, next, now, options).length, 0);
  assert.deepEqual(Object.keys(a.allocations), ['first-19', 'second-19']);
  for (const [index, occurrence] of next.slice(0, 2).entries()) {
    assert.deepEqual(a.allocations[occurrence.markKey].funds, [{ entryId: a.entries[1 + index * 2].id, cents: 200000 }]);
    assert.equal(a.allocations[occurrence.markKey].paidAt, now);
  }
  assert.deepEqual(balanceSummary(a).received, 4000);
  assert.equal(availableCents(a), 0);
  assert.equal(a.entries.filter(e => e.type === 'move').length, 2);
  const before = structuredClone(a);
  assert.equal(reconcileBalanceAccount(a, next, now, options).length, 0);
  assert.deepEqual(a, before);
  normalizeStudentBalances({ version: 1, accounts: { student: a } });
});

test('same-day inference leaves ambiguous, old, blocked, paid and trial slots on review', () => {
  const date = '2026-11-17';
  const old = googleLesson('old', date);
  const target = googleLesson('target', date, { time: '19:00' });
  const cases = [
    { next: [target, googleLesson('other', date, { time: '20:00' })] },
    { next: [target], alreadyPaid: [googleLesson('also-missing', date, { time: '17:00' })], issues: 2 },
    { next: [target], alreadyPaid: [target] },
    { next: [target], block: true },
    { next: [target], since: '2026-11-18' },
    { next: [{ ...target, eligible: false }] },
    { next: [{ ...target, autoEligible: false }] },
    { next: [{ ...target, cents: 250000 }] },
    { next: [{ ...target, groupId: 'group' }] },
    { next: [{ ...target, durationMinutes: 90 }] },
    { next: [{ ...target, external: false }] },
    { next: [{ ...target, dayKey: '2026-11-18' }] },
  ];
  for (const { next, alreadyPaid = [], issues = 1, block, since = '2026-11-11' } of cases) {
    const a = account();
    receipt(a, 'bank', 2000 * (1 + alreadyPaid.length));
    for (const occurrence of [old, ...alreadyPaid]) reserveBalanceAllocation(a, occurrence, now);
    if (block) a.blocked[target.markKey] = now;
    const before = structuredClone(a);
    assert.equal(reconcileBalanceAccount(a, next, now, { sameDayMoveSince: since }).length, issues);
    assert.deepEqual(a, before);
  }
});

test('explicit cross-day reschedule has priority over a same-day lookalike', () => {
  const date = '2026-11-17';
  const a = account();
  const old = googleLesson('old', date);
  const earlier = googleLesson('earlier', '2026-11-16');
  receipt(a, 'bank', 4000);
  reserveBalanceAllocation(a, old, now);
  reserveBalanceAllocation(a, earlier, now);
  const target = googleLesson('target', date, { time: '19:00', moveFromKeys: [earlier.markKey] });
  const issues = reconcileBalanceAccount(a, [target], now, { sameDayMoveSince: '2026-11-11' });
  assert.deepEqual(issues.map(issue => issue.markKey), [old.markKey]);
  assert.deepEqual(Object.keys(a.allocations), [old.markKey, target.markKey]);
  assert.equal(a.entries.at(-1).markKey, earlier.markKey);
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

test('bank pushes compare manual payments within exactly 24 hours, not three days', () => {
  const a = account();
  receipt(a, 'manual:daily-window', 900, { senderName: 'Ольга В' });
  const before = structuredClone(a);
  for (const direction of [-1, 1]) {
    for (const [distance, expected] of [[0, 1], [86_399_999, 1], [86_400_000, 1], [86_400_001, 0], [2 * 86_400_000, 0], [3 * 86_400_000, 0]]) {
      const at = new Date(Date.parse(now) + direction * distance).toISOString();
      assert.equal(possibleManualReceipts(a, { amount: 900, at, senderName: 'Ольга В' }).length, expected,
        `manual payment offset ${direction * distance} ms`);
    }
  }
  assert.equal(possibleManualReceipts(a, { amount: 900, at: now, senderName: 'Ольга К' }).length, 0);
  assert.equal(possibleManualReceipts(a, { amount: 2000, at: now, senderName: 'Ольга В' }).length, 0);
  assert.deepEqual(a, before, 'checking similarity does not mutate existing receipts or pending decisions');
  const later = new Date(Date.parse(now) + 2 * 86_400_000).toISOString();
  assert.equal(addBalanceReceipt(a, { id: 'bank:daily-window', amount: 900, at: later, source: 'bank', aliases: ['daily-window-hash'] }, later).duplicate, false);
  assert.equal(addBalanceReceipt(a, { id: 'bank:daily-window', amount: 900, at: later, source: 'bank' }, later).duplicate, true);
  assert.equal(addBalanceReceipt(a, { id: 'bank:other-delivery', amount: 900, at: later, source: 'bank', aliases: ['daily-window-hash'] }, later).duplicate, true);
  assert.equal(balanceSummary(a).received, 1800);
});

test('migration cannot invent receipts or permit overspending; corruption stops mutations', () => {
  assert.throws(() => createBalanceAccount({ now, openingByMonth: { '2026-09': 2000 }, paid: [lesson('one', '2026-09-28'), lesson('two', '2026-09-30')] }), /Сумма/);
  assert.throws(() => normalizeStudentBalances({ version: 2, accounts: {} }), /Поврежд/);
  const a = account();
  a.entries.push({ id: 'corrupt', cents: 1, creditCents: NaN });
  assert.throws(() => normalizeStudentBalances({ version: 1, accounts: { student: a } }), /Поврежд/);
});

const correction = (a, mode, amount, extra = {}) => adjustBalance(a, {
  mode, amount, reason: 'Исправление сверки', idempotencyKey: `correction:${a.entries.length}`,
  expectedAvailable: availableCents(a) / 100, ...extra,
}, now);
const conserved = a => {
  const summary = balanceSummary(a);
  assert.equal(Math.round((summary.available + summary.allocated) * 100), Math.round((summary.received + summary.adjusted) * 100));
  normalizeStudentBalances({ version: 1, accounts: { student: a } });
};

test('manual corrections add, subtract and set the free balance without inventing receipts', () => {
  const a = account();
  correction(a, 'add', 1500);
  assert.deepEqual({ received: balanceSummary(a).received, adjusted: balanceSummary(a).adjusted, available: availableCents(a) }, { received: 0, adjusted: 1500, available: 150000 });
  assert.equal(income(a), 0);
  assert.equal(possibleManualReceipts(a, { amount: 1500, at: now }).length, 0);
  assert.deepEqual(a.knownReceiptIds, []);
  correction(a, 'subtract', 200);
  correction(a, 'set', 500);
  assert.equal(availableCents(a), 50000);
  assert.equal(balanceSummary(a).adjusted, 500);
  assert.deepEqual(a.entries.filter(e => e.type === 'adjustment').map(e => e.adjustmentCents), [150000, -20000, -80000]);
  assert.equal(balanceSummary(a).entries[0].adjustmentAmount, -800);
  correction(a, 'set', 0);
  assert.equal(availableCents(a), 0);
  conserved(a);
});

test('correction retry is idempotent even after automatic allocation changes the balance', () => {
  const a = account();
  const payload = { mode: 'add', amount: 2000, reason: 'Бонус', expectedAvailable: 0, idempotencyKey: 'repeat-1' };
  assert.equal(adjustBalance(a, payload, now).duplicate, false);
  reconcileBalanceAccount(a, [lesson('one', '2026-10-08')], now);
  const before = structuredClone(a);
  assert.equal(adjustBalance(a, payload, now).duplicate, true);
  assert.deepEqual(a, before);
  for (const changed of [{ amount: 4000 }, { mode: 'set' }, { reason: 'Другая причина' }, { expectedAvailable: 100 }]) {
    assert.throws(() => adjustBalance(a, { ...payload, ...changed }, now), error => error.code === 'balance_idempotency_conflict');
    assert.deepEqual(a, before);
  }
  conserved(a);
});

test('stale balance, missing reasons and negative targets do not change any journal entry', () => {
  const a = account(); receipt(a, 'cash', 3000);
  const before = structuredClone(a);
  assert.throws(() => correction(a, 'add', 500, { expectedAvailable: 0 }), error => error.code === 'balance_stale');
  for (const payload of [
    { mode: 'invalid' }, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) },
    { idempotencyKey: '' }, { idempotencyKey: 'x'.repeat(201) }, { expectedAvailable: undefined },
    { expectedAvailable: -1 }, { amount: '' }, { amount: NaN }, { amount: Infinity }, { amount: 1e16 },
    { mode: 'add', amount: 0 }, { mode: 'subtract', amount: -1 }, { mode: 'set', amount: -1 },
  ]) assert.throws(() => correction(a, 'add', 500, payload), error => error.code === 'balance_invalid');
  assert.deepEqual(a, before);
});

test('subtract and set cannot touch money already assigned to a lesson', () => {
  const a = account(); receipt(a, 'cash', 3000);
  reserveBalanceAllocation(a, lesson('paid', '2026-10-08'), now);
  const before = structuredClone(a);
  assert.throws(() => correction(a, 'subtract', 1000.01), error => error.code === 'balance_insufficient');
  assert.deepEqual(a, before);
  correction(a, 'set', 0);
  assert.deepEqual(a.allocations, before.allocations);
  assert.equal(balanceSummary(a).received, 3000);
  assert.equal(balanceSummary(a).allocated, 2000);
  assert.equal(income(a), 2000);
  conserved(a);
});

test('safe total can exceed a single operation limit and still be corrected', () => {
  const a = account(); receipt(a, 'cash-1', 1_000_000_000); receipt(a, 'cash-2', 1_000_000_000);
  correction(a, 'subtract', 1_000_000_000);
  assert.equal(availableCents(a), 100_000_000_000);
  assert.equal(income(a), 1_000_000_000);
  conserved(a);
});

test('cash and noncash are consumed FIFO and only real cash reaches monthly revenue', () => {
  const a = createBalanceAccount({ now, openingByMonth: { '2026-09': 1500 } });
  correction(a, 'add', 2500, { reason: 'Бонус' });
  reserveBalanceAllocation(a, lesson('oct', '2026-10-08'), now);
  reserveBalanceAllocation(a, lesson('nov', '2026-11-08'), now);
  assert.deepEqual(balancePaidByMonth(a), { '2026-10': 1500 });
  assert.deepEqual(a.allocations.oct.funds.map(slice => slice.cents), [150000, 50000]);
  assert.deepEqual(a.allocations.nov.funds.map(slice => slice.cents), [200000]);
  assert.equal(balanceSummary(a).paidLessons, 2);
  assert.equal(balanceSummary(a).received, 1500);
  assert.equal(balanceSummary(a).adjusted, 2500);
  conserved(a);
});

test('negative correction consumes free sources and cannot reclassify allocated cash as a bonus', () => {
  const a = account(); receipt(a, 'cash', 6000);
  correction(a, 'add', 4000, { reason: 'Бонус' });
  reserveBalanceAllocation(a, lesson('paid', '2026-11-08'), now);
  const allocated = structuredClone(a.allocations);
  correction(a, 'subtract', 4500);
  assert.deepEqual(a.allocations, allocated);
  assert.equal(income(a), 2000);
  assert.equal(availableCents(a), 350000);
  reserveBalanceAllocation(a, lesson('bonus', '2026-12-08'), now);
  assert.deepEqual(balancePaidByMonth(a), { '2026-11': 2000 });
  assert.equal(availableCents(a), 150000);
  releaseBalanceAllocation(a, 'paid', now, { block: true });
  assert.deepEqual(balancePaidByMonth(a), { '2026-10': 2000 });
  assert.equal(availableCents(a), 350000);
  reserveBalanceAllocation(a, lesson('replacement', '2027-01-08'), now);
  assert.deepEqual(balancePaidByMonth(a), { '2027-01': 2000 });
  conserved(a);
});

test('bonus-only lesson release followed by subtraction never creates income', () => {
  const a = account(); correction(a, 'add', 4000);
  reserveBalanceAllocation(a, lesson('bonus', '2026-10-08'), now);
  correction(a, 'subtract', 2000);
  releaseBalanceAllocation(a, 'bonus', now, { block: true });
  assert.equal(availableCents(a), 200000);
  assert.equal(income(a), 0);
  correction(a, 'subtract', 2000);
  assert.equal(income(a), 0);
  assert.equal(availableCents(a), 0);
  conserved(a);
});

test('legacy allocations are pinned before correction and old journal still normalizes', () => {
  const a = createBalanceAccount({ now, openingByMonth: { '2026-09': 4000 }, paid: [lesson('old', '2026-09-08')] });
  assert.equal(a.allocations.old.funds, undefined);
  normalizeStudentBalances({ version: 1, accounts: { student: a } });
  correction(a, 'add', 3000);
  assert.deepEqual(a.allocations.old.funds, [{ entryId: a.entries[0].id, cents: 200000 }]);
  correction(a, 'subtract', 2500);
  assert.deepEqual(balancePaidByMonth(a), { '2026-09': 2000 });
  assert.equal(availableCents(a), 250000);
  conserved(a);
});

test('normalization rejects malformed signed adjustments, unsafe sums and invalid funding slices', () => {
  const original = account(); correction(original, 'add', 500);
  const corruptions = [
    a => { a.entries.at(-1).adjustmentCents = NaN; },
    a => { a.entries.at(-1).adjustmentCents = Number.MAX_SAFE_INTEGER + 1; },
    a => { a.entries.at(-1).adjustmentCents = -50000; },
    a => { a.entries.at(-1).cents = 1; },
    a => { a.entries.at(-1).creditCents = 50000; },
    a => { a.entries.at(-1).type = 'receipt'; },
    a => { a.entries.at(-1).adjustmentCents = undefined; },
    a => { a.entries.at(-1).funds = [{ entryId: 'missing', cents: 50000 }]; a.entries.at(-1).adjustmentCents = -50000; },
  ];
  for (const corrupt of corruptions) {
    const a = structuredClone(original); corrupt(a);
    assert.throws(() => normalizeStudentBalances({ version: 1, accounts: { student: a } }), error => error.code === 'balance_corrupt');
  }
  const a = account(); receipt(a, 'cash', 5000); reserveBalanceAllocation(a, lesson('paid', '2026-10-08'), now);
  a.allocations.paid.funds[0].cents += 1;
  assert.throws(() => normalizeStudentBalances({ version: 1, accounts: { student: a } }), error => error.code === 'balance_corrupt');
  a.allocations.paid.funds = [null];
  assert.throws(() => normalizeStudentBalances({ version: 1, accounts: { student: a } }), error => error.code === 'balance_corrupt');
  const overflowing = account();
  overflowing.entries.push({ id: 'one', type: 'opening', cents: Number.MAX_SAFE_INTEGER, creditCents: Number.MAX_SAFE_INTEGER },
    { id: 'two', type: 'opening', cents: 1, creditCents: 1 });
  assert.throws(() => normalizeStudentBalances({ version: 1, accounts: { student: overflowing } }), error => error.code === 'balance_corrupt');
});
