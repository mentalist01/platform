import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateLessonPrice, lessonRateAt, recordPricingChange, matchLessonPaymentTotal } from '../src/utils/lessonPricing.js';
import { summarizeUnpaidLessons } from '../src/utils/lessonPaymentSummary.js';
import { summarizeTeacherFinanceCalendarPlan } from './teacherFinanceCalendarPlan.js';
import { calculateTeacherStudentProfitability } from '../src/utils/teacherFinanceCalculations.js';

for (const [mode, price, amounts] of [
  ['perLesson', 2000, [2000, 2000, 2000, 2000]],
  ['perHour', 2000, [1000, 2000, 3000, 4000]],
  ['per90Minutes', 3000, [1000, 2000, 3000, 4000]],
]) test(`${mode}: agreed prices for 30, 60, 90, 120 minutes`, () => {
  assert.deepEqual([30, 60, 90, 120].map((duration) => calculateLessonPrice({ pricingMode: mode, lessonPrice: price }, duration)), amounts);
});

test('rounds money once to kopecks, including a non-divisible 90-minute rate', () => {
  assert.equal(calculateLessonPrice({ pricingMode: 'per90Minutes', lessonPrice: 2000 }, 60), 1333.33);
  assert.equal(calculateLessonPrice({ lessonPrice: 2000 }, 90), 2000, 'old profiles remain fixed per lesson');
});

test('rate changes preserve past and prepaid lessons and override stale future monthly records', () => {
  const old = { pricingMode: 'perLesson', lessonPrice: 2000 };
  const next = { pricingMode: 'per90Minutes', lessonPrice: 3000 };
  const from = '2026-09-29T18:00:00.000Z';
  const profile = { ...next, pricingHistory: recordPricingChange(old, next, from) };
  assert.deepEqual(lessonRateAt(profile, next, { dayKey: '2026-09-29', startsAt: '2026-09-29T17:00:00Z' }), old);
  assert.deepEqual(lessonRateAt(profile, old, { dayKey: '2026-10-05', startsAt: '2026-10-05T17:00:00Z' }), next);
  assert.deepEqual(lessonRateAt(profile, old, { dayKey: '2026-10-05', startsAt: '2026-10-05T17:00:00Z', paidAt: '2026-09-28T17:00:00Z' }), old);
  const historical = { pricingMode: 'perLesson', lessonPrice: 1500 };
  assert.deepEqual(lessonRateAt(profile, historical, { dayKey: '2026-08-05', startsAt: '2026-08-05T17:00:00Z' }).lessonPrice, 1500);
  assert.equal(lessonRateAt(profile, next, { dayKey: '2026-08-05', startsAt: '2026-08-05T17:00:00Z', hasMonthlyRate: false }).lessonPrice, 2000);
  assert.equal(recordPricingChange(profile, profile, from).length, 1, 'other profile edits do not change the rate');
});

test('bank payment matches exact mixed lesson sums without skipping an unpaid lesson', () => {
  const lessons = [2000, 3000, 2000];
  assert.deepEqual(matchLessonPaymentTotal(5000, lessons, (price) => price), [2000, 3000]);
  assert.deepEqual(matchLessonPaymentTotal(3000, lessons, (price) => price), []);
  assert.deepEqual(matchLessonPaymentTotal(3000, lessons.slice(1), (price) => price), [3000]);
  assert.deepEqual(matchLessonPaymentTotal(4999.99, lessons, (price) => price), []);
  assert.deepEqual(matchLessonPaymentTotal(5000, lessons, (price) => price, 1), []);
});

test('monthly plan sums mixed durations and never multiplies explicit historic quotes', () => {
  const result = summarizeTeacherFinanceCalendarPlan({
    monthKey: '2026-10', students: [{ id: 's', grade: '11', studyStatus: 'active', profile: { lessonPrice: 2000, pricingMode: 'perHour' } }],
    paidOccurrences: [{ studentId: 's', dayKey: '2026-10-01', time: '12:00', durationMinutes: 90, lessonPrice: 1800 }],
    unpaidOccurrences: [{ studentId: 's', dayKey: '2026-10-02', time: '12:00', durationMinutes: 60 }, { studentId: 's', dayKey: '2026-10-03', time: '12:00', durationMinutes: 90 }],
  });
  assert.equal(result.total.revenue, 6800);
  assert.equal(result.actual.revenue, 1800);
});

test('parent debt deduplicates calendar/history and uses each quoted duration', () => {
  const rate = { lessonPrice: 2000, pricingMode: 'perHour' };
  const first = { dayKey: '2026-10-01', time: '12:00', durationMinutes: 60, payment: { status: 'unpaid', amount: 2000 } };
  const second = { dayKey: '2026-10-02', time: '12:00', durationMinutes: 90, payment: { status: 'unpaid', amount: 3000 } };
  const schedule = [first, second].map((lesson) => ({ ...lesson, payment: { statesByDate: { [lesson.dayKey]: lesson.payment } } }));
  const result = summarizeUnpaidLessons(schedule, [second], rate);
  assert.equal(result.count, 2);
  assert.equal(result.amount, 5000);
  assert.equal(result.amountKnown, true);
});

test('duration-based payments do not fabricate a number of paid lessons', () => {
  const result = calculateTeacherStudentProfitability({ lessonPrice: 1000, pricingMode: 'per90Minutes', monthlyPaidAmounts: [4000], paidCalendarOccurrences: [{ lessonPrice: 2000 }, { lessonPrice: 2000 }] });
  assert.equal(result.paidLessonCount, 2);
  assert.equal(result.lessonsRemaining, null);
});
