import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_LEARNING_TARIFFS, LearningSubscriptionStore, bindSubscriptionLessons, subscriptionAccess, subscriptionBlockState, subscriptionOccurrence, subscriptionEndOfDay, subscriptionDay } from './learningSubscriptions.js';
import { calculateTeacherStudentProfitability } from '../src/utils/teacherFinanceCalculations.js';

const setup = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-subscriptions-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = Date.parse('2026-10-05T12:00:00+03:00'); let id = 0;
  const store = new LearningSubscriptionStore(path.join(dir, 'subscriptions.json'), { now: () => now, id: () => `purchase-${++id}` });
  const students = [{ id: 'old', teacherId: 'teacher-a' }, { id: 'new', teacherId: 'teacher-a' }, { id: 'foreign', teacherId: 'teacher-b' }];
  const groups = [{ id: 'g2', teacherId: 'teacher-a', name: 'Группа 2', status: 'active', pricePerLesson: 900, members: students.slice(0, 2).map(student => ({ studentId: student.id, status: 'active' })) }];
  const lessons = Array.from({ length: 24 }, (_, index) => ({ id: `lesson-${index + 1}`, groupId: 'g2', teacherId: 'teacher-a', startAt: new Date(now + index * 3 * 86400_000).toISOString(), durationMinutes: 60, status: 'scheduled', participantIds: ['old', 'new'] }));
  const context = { students, groups, lessons, individualPrices: { old: 2000 } };
  const payload = { studentId: 'old', groupId: 'g2', tariffId: 'group-main', startsAt: lessons[0].startAt, accessUntil: '2026-11-02', keepCurrentPrice: true };
  const create = extra => store.create('teacher-a', { ...payload, ...extra }, context);
  const pay = block => store.change('teacher-a', block.id, 'pay', { amount: block.tariff.price }, lessons);
  return { store, context, payload, create, pay, lessons, setNow: value => { now = Date.parse(value); } };
};

test('new catalog and explicit legacy package preserve 900 and 2000 without automatic migration', t => {
  const f = setup(t);
  assert.equal(fs.existsSync(f.store.file), false);
  assert.deepEqual(f.store.tariffs('teacher-a').map(tariff => tariff.price), [2900, 1900, 9600, 13600]);
  assert.equal(fs.existsSync(f.store.file), false, 'reading the catalog creates no real assignments');
  const old = f.create(); const fresh = f.create({ studentId: 'new', keepCurrentPrice: false });
  assert.equal(old.tariff.price, 7200); assert.equal(old.agreedLessonPrice, 900);
  assert.equal(fresh.tariff.price, 9600); assert.equal(f.context.individualPrices.old, 2000);
  assert.deepEqual(old.lessonIds, f.lessons.slice(0, 8).map(lesson => lesson.id));
});

test('paid purchases keep their own tariff snapshot after catalog or group price changes', t => {
  const f = setup(t); const block = f.pay(f.create());
  f.store.updateTariff('teacher-a', 'group-main', { title: 'Будущий тариф', price: 12000 });
  f.context.groups[0].pricePerLesson = 1200;
  const saved = f.store.read().blocks[0];
  assert.equal(saved.tariff.price, 7200); assert.equal(saved.payment.amount, 7200);
  assert.equal(block.agreedLessonPrice, 900);
  assert.equal(f.store.tariffs('teacher-b').find(entry => entry.id === 'group-main').price, 9600);
});

test('only full payment activates a block and payment retries are idempotent', t => {
  const f = setup(t); const block = f.create();
  assert.equal(subscriptionAccess(f.store.read().blocks, 'old', 'g2', f.lessons).allowed, false);
  assert.throws(() => f.store.change('teacher-a', block.id, 'pay', { amount: 900 }, f.lessons), /полная оплата/);
  assert.equal(f.store.read().blocks[0].payment, null);
  const paid = f.pay(block); const again = f.pay(block);
  assert.deepEqual(again.payment, paid.payment);
  assert.equal(f.store.read().blocks.length, 1);
  assert.equal(subscriptionAccess(f.store.read().blocks, 'old', 'g2', f.lessons, { now: Date.parse(f.payload.startsAt), live: true }).allowed, true);
});

test('held lessons count despite absence; elapsed scheduled or cancelled lessons do not count', t => {
  const f = setup(t); const block = f.pay(f.create());
  f.lessons[0].status = 'completed'; f.lessons[0].participantIds = [];
  f.lessons[1].status = 'cancelled';
  const data = f.store.reconcile(f.lessons);
  const view = subscriptionBlockState(data.blocks[0], f.lessons, Date.parse('2026-12-01T12:00:00+03:00'));
  assert.equal(view.completed, 1); assert.equal(view.remaining, 7); assert.equal(view.status, 'active');
  assert.ok(!view.lessonIds.includes(f.lessons[1].id)); assert.ok(view.lessonIds.includes(f.lessons[8].id));
  assert.equal(block.tariff.price, 7200);
});

test('rescheduling keeps the same paid identity and extends access beyond four weeks', t => {
  const f = setup(t); f.pay(f.create()); f.lessons.slice(0, 8).forEach(lesson => { lesson.status = 'completed'; });
  f.lessons[7].startAt = '2026-12-05T18:00:00+03:00';
  const block = f.store.reconcile(f.lessons).blocks[0];
  const view = subscriptionBlockState(block, f.lessons, Date.parse('2026-12-05T19:00:00+03:00'));
  assert.equal(view.status, 'active'); assert.equal(view.endsAt, subscriptionEndOfDay('2026-12-05'));
  assert.equal(subscriptionBlockState(block, f.lessons, Date.parse('2026-12-06T00:00:00+03:00')).status, 'expired');
  assert.deepEqual(block.lessonIds, f.lessons.slice(0, 8).map(lesson => lesson.id));
});

test('renewal binds the next eight lessons and cancellation replacement never steals a renewed lesson', t => {
  const f = setup(t); const first = f.pay(f.create());
  const next = f.create({ startsAt: f.lessons[8].startAt, accessUntil: '2026-12-01' });
  assert.deepEqual(next.lessonIds, f.lessons.slice(8, 16).map(lesson => lesson.id));
  f.lessons[2].status = 'cancelled';
  const data = f.store.reconcile(f.lessons);
  assert.deepEqual(data.blocks[1].lessonIds, next.lessonIds);
  assert.equal(new Set(data.blocks.flatMap(block => block.lessonIds)).size, 16);
  assert.ok(data.blocks[0].lessonIds.includes(f.lessons[16].id));
  assert.throws(() => f.store.change('teacher-a', first.id, 'cancel', {}, f.lessons), /Оплаченный блок/);
});

test('new purchases reject ambiguous overlap, missing ownership, invalid dates and a second unpaid block', t => {
  const f = setup(t);
  assert.throws(() => f.create({ studentId: 'foreign' }), /не найдены/);
  assert.throws(() => f.create({ accessUntil: '2026-99-99' }), /срок доступа/);
  assert.throws(() => f.create({ accessUntil: '2026-02-31' }), /срок доступа/);
  assert.throws(() => f.create({ startsAt: '2026-09-01T10:00:00+03:00' }), /сегодняшнего/);
  const block = f.create(); assert.throws(() => f.create(), /уже созданный/);
  f.pay(block); assert.throws(() => f.create(), /предыдущего/);
});

test('recordings tariff grants its own content, rejects live calls and waits for all recordings to be delivered', t => {
  const f = setup(t); const block = f.pay(f.create({ tariffId: 'recordings', keepCurrentPrice: false }));
  const data = f.store.read(); const now = Date.parse(f.payload.startsAt);
  assert.equal(block.tariff.price, 1900);
  assert.equal(subscriptionAccess(data.blocks, 'old', 'g2', f.lessons, { live: true, now }).allowed, false);
  assert.equal(subscriptionAccess(data.blocks, 'old', 'g2', f.lessons, { lessonId: 'lesson-1', now }).allowed, true);
  assert.equal(subscriptionAccess(data.blocks, 'old', 'g2', f.lessons, { lessonId: 'lesson-9', now }).allowed, false);
  f.lessons.slice(0, 8).forEach(lesson => { lesson.status = 'completed'; lesson.recordingAvailable = true; });
  f.lessons[7].recordingAvailable = false;
  const view = subscriptionBlockState(block, f.lessons, Date.parse('2026-12-01T12:00:00+03:00'));
  assert.equal(view.completed, 7); assert.equal(view.status, 'active');
});

test('consultations are limited, idempotent and reversible without consuming group lessons', t => {
  const f = setup(t); const block = f.pay(f.create({ tariffId: 'group-plus', keepCurrentPrice: false }));
  const body = { heldAt: f.payload.startsAt, requestId: 'consult-1' };
  f.store.change('teacher-a', block.id, 'consultation', body, f.lessons);
  f.store.change('teacher-a', block.id, 'consultation', body, f.lessons);
  f.store.change('teacher-a', block.id, 'consultation', { ...body, requestId: 'consult-2' }, f.lessons);
  assert.throws(() => f.store.change('teacher-a', block.id, 'consultation', { ...body, requestId: 'consult-3' }, f.lessons), /Все консультации/);
  let saved = f.store.read().blocks[0]; assert.equal(saved.consultations.length, 2); assert.equal(saved.lessonIds.length, 8);
  assert.equal(subscriptionBlockState(saved, f.lessons, Date.parse(f.payload.startsAt)).completed, 0);
  f.store.change('teacher-a', block.id, 'undo-consultation', { consultationId: saved.consultations[0].id }, f.lessons);
  saved = f.store.read().blocks[0]; assert.equal(subscriptionBlockState(saved, f.lessons).consultationUsed, 1);
});

test('access does not change for legacy students; renewal requests are scoped and retained', t => {
  const f = setup(t);
  assert.deepEqual(subscriptionAccess([], 'old', 'g2', f.lessons), { allowed: true, legacy: true });
  const block = f.pay(f.create());
  assert.throws(() => f.store.requestRenewal('foreign', block.id), /не найден/);
  f.store.requestRenewal('old', block.id); const first = f.store.read().blocks[0].renewalRequestedAt;
  f.setNow('2026-10-06T12:00:00+03:00'); f.store.requestRenewal('old', block.id);
  assert.equal(f.store.read().blocks[0].renewalRequestedAt, first);
  const restored = new LearningSubscriptionStore(f.store.file);
  assert.equal(restored.read().blocks[0].payment.amount, 7200);
});

test('package receipt and paid lesson views are counted once alongside historical per-lesson payments', t => {
  const completed = [{ lessonPrice: 2000, paid: true }, ...Array.from({ length: 3 }, () => ({ lessonPrice: 900, paid: true, subscriptionId: 'block' }))];
  const metrics = calculateTeacherStudentProfitability({ lessonPrice: 2000, commissionAmount: 3000, completedOccurrences: completed,
    monthlyPaidAmounts: [2000], subscriptionPaidAmounts: [7200], paidCalendarOccurrences: completed });
  assert.equal(metrics.grossRevenue, 4700); assert.equal(metrics.receivedRevenue, 9200);
  assert.equal(metrics.netAfterCommission, 6200);
});

test('occurrence matching is scoped to group and Moscow dates and ignores future tariff revisions', t => {
  const f = setup(t); const block = f.pay(f.create());
  assert.equal(subscriptionOccurrence([block], f.lessons, 'old', { groupId: 'g2', date: '2026-10-05', time: '12:00' }).lessonPrice, 900);
  assert.equal(subscriptionOccurrence([block], f.lessons, 'new', { groupId: 'g2', lessonId: 'lesson-1' }), null);
  assert.equal(subscriptionDay('2026-10-01T00:00:00+03:00').slice(0, 7), '2026-10');
  assert.equal(subscriptionEndOfDay('2026-02-31'), '');
  assert.equal(bindSubscriptionLessons([block], f.lessons), false);
  assert.equal(DEFAULT_LEARNING_TARIFFS[1].price, 1900);
});

test('custom block prices preserve every cent across eight completed lessons', t => {
  const f = setup(t); const block = f.pay(f.create({ price: 7200.03 }));
  const prices = block.lessonIds.map(lessonId => subscriptionOccurrence([block], f.lessons, 'old', { groupId: 'g2', lessonId }).lessonPrice);
  assert.equal(prices.reduce((sum, price) => sum + Math.round(price * 100), 0), 720003);
  assert.equal(prices[0], 900.01); assert.equal(prices[7], 900);
});

test('mixed renewed tariffs only allow voice for lessons covered by a live block', t => {
  const f = setup(t); const groupBlock = f.pay(f.create());
  const recordBlock = f.pay(f.create({ startsAt: f.lessons[8].startAt, accessUntil: '2026-12-01', tariffId: 'recordings', keepCurrentPrice: false }));
  assert.equal(subscriptionAccess([groupBlock, recordBlock], 'old', 'g2', f.lessons, { live: true, lessonId: 'lesson-9', now: Date.parse(f.payload.startsAt) }).allowed, false);
});

test('already-paid lessons prevent double purchase or later confirmation after a conflicting manual payment', t => {
  const f = setup(t);
  assert.throws(() => f.store.create('teacher-a', f.payload, { ...f.context, isAlreadyPaid: () => true }), /уже оплаченные/);
  assert.equal(f.store.read().blocks.length, 0);
  const block = f.create();
  assert.throws(() => f.store.change('teacher-a', block.id, 'pay', { amount: 7200 }, f.lessons, () => true), /поурочная оплата/);
  assert.equal(f.store.read().blocks[0].payment, null);
});
