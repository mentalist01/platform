import assert from 'node:assert/strict';
import test from 'node:test';
import { repairStudentLessonPayment } from './repair-student-lesson-payment.mjs';
import { addBalanceReceipt, adjustBalance, balancePaidByMonth, createBalanceAccount, reserveBalanceAllocation } from '../server/studentPaymentBalances.js';

test('targeted repair preserves real receipts and other students, reverses only the duplicate bonus and is idempotent', () => {
  const now = '2026-10-14T00:00:00Z';
  const account = createBalanceAccount({ now });
  addBalanceReceipt(account, { id: 'bank', source: 'bank', amount: 2000, at: now }, now);
  const occurrence = (day, id) => ({ markKey: `teacher:${id}:${day}:student:18:00:paid`, dayKey: day, time: '18:00', cents: 200000, eligible: true });
  const source = occurrence('2026-03-02', 'wrong');
  reserveBalanceAllocation(account, source, now);
  const adjustment = adjustBalance(account, { mode: 'add', amount: 2000, reason: 'Duplicate attempt', idempotencyKey: 'bonus', expectedAvailable: 0 }, now).entry;
  const correction = occurrence('2026-03-09', 'bonus');
  reserveBalanceAllocation(account, correction, now);
  const finance = { teacher: { studentPaymentBalances: { version: 1, accounts: { student: account, other: createBalanceAccount({ now }) } },
    lessonLedger: { target: { studentId: 'student', dayKey: '2026-10-12', time: '18:00', sourceEntryId: 'correct', durationMinutes: 90, lessonPrice: 2000 } },
    months: {}, paymentAllocations: {} }, otherTeacher: { unchanged: true } };
  const marks = { teacher: { [source.markKey]: now, [correction.markKey]: now, 'unrelated-mark': now }, otherTeacher: { untouched: now } };
  const options = { teacherId: 'teacher', studentId: 'student', from: '2026-03-02@18:00', to: '2026-10-12@18:00',
    correctionLesson: '2026-03-09@18:00', adjustmentId: adjustment.id, now };
  const result = repairStudentLessonPayment(finance, marks, options);
  assert.equal(result.after.received, 2000); assert.equal(result.after.adjusted, 0);
  assert.equal(result.after.allocated, 2000); assert.equal(result.after.available, 0);
  assert.deepEqual(result.finance.teacher.studentPaymentBalances.accounts.other, finance.teacher.studentPaymentBalances.accounts.other);
  assert.deepEqual(result.finance.otherTeacher, finance.otherTeacher); assert.deepEqual(result.marks.otherTeacher, marks.otherTeacher);
  assert.equal(result.marks.teacher['unrelated-mark'], now);
  assert.equal(Object.values(balancePaidByMonth(result.finance.teacher.studentPaymentBalances.accounts.student)).reduce((a, b) => a + b, 0), 2000);
  const retry = repairStudentLessonPayment(result.finance, result.marks, options);
  assert.equal(retry.duplicate, true); assert.deepEqual(retry.finance, result.finance); assert.deepEqual(retry.marks, result.marks);
});
