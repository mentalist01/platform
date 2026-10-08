import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as balances from './studentPaymentBalances.js';
import { retainWalletPaymentProjections, selectBalanceReconciliationStudents } from './studentBalanceCore.js';
import { createStudentBalanceReadContext } from './studentBalanceReadContext.js';
import { normalizePricingHistory } from '../src/utils/lessonPricing.js';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const declaration = name => {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\nconst ', start + 1));
};
const normalizers = source.slice(source.indexOf('const getDefaultTeacherFinanceProfile ='),
  source.indexOf('const readTeacherFinanceDb ='));

function fixture(count = 2500) {
  const students = ['egor', 'egor1'].map(id => ({ id, teacherId: 'teacher', name: id }));
  const accounts = {};
  for (const [studentIndex, student] of students.entries()) {
    const paid = Array.from({ length: studentIndex ? Math.floor(count / 2) : Math.ceil(count / 2) }, (_, index) => {
      const eventId = `${student.id}-event-${index}`;
      return { markKey: `teacher:${eventId}:2026-10-08:${student.id}:20:00:paid`,
        dayKey: '2026-10-08', time: '20:00', cents: 90000, eventId, paidAt: '2026-10-07T17:00:00Z', identity: `local:${eventId}` };
    });
    accounts[student.id] = balances.createBalanceAccount({ paid, openingByMonth: { '2026-01': paid.length * 900 }, now: '2026-10-07T17:00:00Z' });
  }
  let storedFinance = { teacher: { studentPaymentBalances: { version: 1, accounts }, months: {}, studentProfiles: {}, paymentAllocations: {}, lessonLedger: {} } };
  let storedMarks = { teacher: {} };
  const calls = { occurrences: [], reconciled: [], writes: 0, notifications: 0, invalidationReads: 0, legacyProjectionCounts: [] };
  const context = {
    ...balances, retainWalletPaymentProjections, selectBalanceReconciliationStudents, normalizePricingHistory, createStudentBalanceReadContext,
    crypto, normalizeTeacherId: value => String(value || '').trim(),
    normalizeTeacherFinanceMonthKey: value => value, normalizeTeacherFinanceText: value => String(value || ''),
    normalizeTeacherFinancePricingMode: (value, fallback) => value || fallback,
    normalizeTeacherFinancePaymentDay: value => value ?? null, roundTeacherFinanceNumber: value => Number(value) || 0,
    normalizeDayKey: value => value || '', normalizeScheduleTime: value => value || '',
    normalizeScheduleDurationMinutes: value => Number(value) || 60, normalizeTeacherCalendarMarkKey: value => value || '',
    normalizeTeacherCalendarMarks: value => value || {},
    TEACHER_FINANCE_PROFILE_NOTE_MAX_LENGTH: 400, TEACHER_FINANCE_STUDENT_NOTE_MAX_LENGTH: 1200, TEACHER_FINANCE_MONTH_NOTE_MAX_LENGTH: 2000,
    isStudentBalanceMaintenance: () => false,
    walletStudentEligible: () => true, readStudentsDb: () => students,
    learningSubscriptions: { read: () => ({ blocks: [] }), reconcile: (_lessons, data) => data },
    readLearningLessonSessionsDb: () => [], readResolvedGroupLessonSessions: lessons => lessons,
    readLearningGroupsDb: () => [], readPaymentNotificationsDb: () => ({ items: [] }),
    findStudentById: id => students.find(student => student.id === id),
    loadWalletCalendar: async () => [],
    getWalletOccurrences: (_teacher, student, entry) => {
      calls.occurrences.push(student.id);
      return Object.values(entry.studentPaymentBalances.accounts[student.id].allocations).map(allocation => ({ ...allocation, eligible: true, moveFromKeys: [] }));
    },
    reconcileBalanceAccount: (account, occurrences, now, options) => {
      calls.reconciled.push(students.find(student => account.enabledAt === accounts[student.id].enabledAt && occurrences[0]?.markKey.includes(`:${student.id}:`))?.id);
      return balances.reconcileBalanceAccount(account, occurrences, now, options);
    },
    readTeacherFinanceDb: () => context.normalizeDb(structuredClone(storedFinance)),
    readTeacherCalendarMarksDb: () => structuredClone(storedMarks),
    writeTeacherFinanceDb: value => { calls.writes += 1; storedFinance = context.normalizeDb(structuredClone(value)); },
    writeTeacherCalendarMarksDb: value => { storedMarks = structuredClone(value); },
    notifyScheduleSyncUpdate: () => { calls.notifications += 1; },
    enqueuePaymentNotification: async (_teacher, action) => action(),
    reconcileStudentBalanceReads: (teacherId, studentId) => context.mutate(teacherId, { studentId, allowCalendarFailure: true }),
    getTeacherScheduleEntries: () => { calls.invalidationReads += 1; return []; },
    bootstrapCancelledTeacherPaymentAllocations: async () => {},
    getPaymentScheduleEntries: async () => [],
    getPaymentTransferCandidates: async ({ teacherEntry }) => { calls.legacyProjectionCounts.push(Object.keys(teacherEntry.paymentAllocations).length); return []; },
    dayKeyToNumber: value => Date.parse(`${value}T00:00:00Z`) / 86_400_000,
    numberToDayKey: value => new Date(value * 86_400_000).toISOString().slice(0, 10),
    getStudentSchedulePaymentNowInfo: () => ({ todayKey: '2026-10-08' }), PAYMENT_TRANSFER_LOOKAHEAD_DAYS: 365,
  };
  const selected = ['getTeacherFinanceTeacherEntry', 'getTeacherFinanceStudentRecordForMonth', 'projectStudentBalances',
    'mutateStudentBalances', 'getPaymentAllocationByMarkKey', 'getPaymentAllocationCurrentOccurrence', 'reconcileTeacherPaymentCredits', 'walletEnabled', 'walletHasStudent'];
  vm.runInNewContext(`${normalizers}\n${selected.map(declaration).join('\n')}
    globalThis.normalizeDb = normalizeTeacherFinanceDb; globalThis.normalizeEntry = normalizeTeacherFinanceTeacherEntry;
    globalThis.project = projectStudentBalances; globalThis.mutate = mutateStudentBalances;
    globalThis.lookup = getPaymentAllocationByMarkKey; globalThis.reconcile = reconcileTeacherPaymentCredits;`, context);
  const initial = context.normalizeEntry(storedFinance.teacher);
  context.project('teacher', initial, storedMarks.teacher);
  storedFinance = context.normalizeDb({ teacher: initial });
  return { context, calls, students, finance: () => structuredClone(storedFinance), marks: () => structuredClone(storedMarks),
    replaceFinance: value => { storedFinance = context.normalizeDb(structuredClone(value)); } };
}

test('actual teacher-entry and payment lookup normalization retain more than 2000 wallet projections', () => {
  const data = fixture();
  const entry = data.context.normalizeEntry(data.finance().teacher);
  const key = Object.keys(entry.paymentAllocations)[0];
  assert.equal(Object.keys(entry.paymentAllocations).length, 2500);
  assert.equal(data.context.lookup(entry, key)?.amount, 900);
  assert.equal(Object.keys(entry.paymentAllocations).length, 2500, 'lookup normalization cannot truncate wallet projections before a later write');
  assert.deepEqual(entry.studentPaymentBalances, data.finance().teacher.studentPaymentBalances);
});

test('actual scoped mutation leaves another account, its profile, monthly payments and marks unchanged', async () => {
  const data = fixture(12);
  const before = data.finance();
  const marksBefore = data.marks();
  const result = await data.context.mutate('teacher', { studentId: 'egor' });
  assert.deepEqual(data.calls.occurrences, ['egor']);
  assert.deepEqual(data.calls.reconciled, ['egor']);
  assert.equal(result.students.length, 1);
  assert.equal(result.students[0].studentId, 'egor');
  assert.deepEqual(data.finance().teacher.studentPaymentBalances.accounts.egor1, before.teacher.studentPaymentBalances.accounts.egor1);
  assert.deepEqual(data.finance().teacher.studentProfiles.egor1, before.teacher.studentProfiles.egor1);
  for (const month of Object.keys(before.teacher.months)) assert.deepEqual(data.finance().teacher.months[month].students.egor1, before.teacher.months[month].students.egor1);
  assert.deepEqual(data.marks(), marksBefore);
});

test('alternating real scoped reads above 2000 stabilize without financial writes or SSE', async () => {
  const data = fixture();
  const before = data.finance();
  const marksBefore = data.marks();
  for (const studentId of ['egor', 'egor1', 'egor', 'egor1']) await data.context.mutate('teacher', { studentId });
  assert.equal(data.calls.writes, 0);
  assert.equal(data.calls.notifications, 0, 'a read must not continuously notify the next read');
  assert.deepEqual(data.finance(), before);
  assert.deepEqual(data.marks(), marksBefore);
  assert.equal(Object.keys(data.finance().teacher.paymentAllocations).length, 2500);
});

test('ordinary student reconciliation passes its scope and skips the empty invalidation action', async () => {
  const data = fixture(12);
  await data.context.reconcile('teacher', { studentId: 'egor1' });
  assert.deepEqual(data.calls.occurrences, ['egor1']);
  assert.deepEqual(data.calls.reconciled, ['egor1']);
  assert.equal(data.calls.invalidationReads, 0);
  assert.equal(data.calls.notifications, 0);
});

test('legacy credit reconciliation normalization preserves every wallet projection before its next write', async () => {
  const data = fixture();
  const finance = data.finance();
  finance.teacher.paymentAllocations['legacy-origin'] = {
    studentId: 'legacy', amount: 900, originMarkKey: 'legacy-origin', status: 'credit',
    sourceDayKey: '2026-10-08', sourceTime: '20:00', sourceDurationMinutes: 60,
  };
  data.replaceFinance(finance);
  const before = data.finance();
  const result = await data.context.reconcile('teacher', { studentId: 'legacy' });
  assert.equal(result.changed, false);
  assert.deepEqual(data.calls.legacyProjectionCounts, [2501]);
  assert.equal(data.calls.writes, 0);
  assert.deepEqual(data.finance(), before);
});
