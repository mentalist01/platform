import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createStudentBalanceReadContext } from './studentBalanceReadContext.js';
import { LearningSubscriptionStore, subscriptionOccurrence } from './learningSubscriptions.js';
import { deduplicateGroupLessonSessions } from './groupScheduleDuplicates.js';
import { isGroupLessonAssigned, participationOccurrence } from '../src/utils/groupParticipation.js';
import { calculateLessonPrice, lessonRateAt } from '../src/utils/lessonPricing.js';
import { balanceCents, createBalanceAccount } from './studentPaymentBalances.js';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const declaration = name => {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\nconst ', start + 1));
};
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const students = Array.from({ length: 6 }, (_, index) => ({ id: `student-${index}`, teacherId: 'teacher', name: 'Егор', createdAt: '2026-01-01' }));
  const days = Array.from({ length: 100 }, (_, index) => new Date(Date.UTC(2026, 0, 7 + index * 7)).toISOString().slice(0, 10));
  const lessons = days.map((day, index) => ({ id: `lesson-${index}`, groupId: 'group', teacherId: 'teacher',
    startAt: `${day}T20:00:00+03:00`, durationMinutes: 60, status: 'scheduled', source: 'google-calendar',
    ...(index === 1 ? { participationOverrides: { 'student-0': false } } : {}),
  }));
  // Participation resolves Google's duplicate; subscriptions use the raw list.
  lessons.unshift({ ...lessons[1], id: 'duplicate', source: 'availability-plan', participationOverrides: {} });
  const groups = [{ id: 'group', teacherId: 'teacher', pricePerLesson: 1200, members: students.map(student => ({
    studentId: student.id, status: 'active', participationPlans: student.id === 'student-1'
      ? [{ from: '2026-01-01', mode: 'selected', slots: ['friday|20:00'] }] : [],
  })) }];
  const subscriptions = { version: 1, tariffs: {}, blocks: [{ id: 'subscription', teacherId: 'teacher', studentId: 'student-5', groupId: 'group',
    startsAt: `${days[0]}T20:00:00+03:00`, createdAt: '2026-01-01T00:00:00Z', tariff: { kind: 'group', price: 3600, lessonCount: 4 },
    cancelledAt: '', lessonIds: [] }] };
  const counters = { students: 0, groups: 0, lessons: 0, subscriptions: 0, replaySummaries: 0, reconcile: 0, subscriptionWrites: 0, notifications: 0 };
  const clone = value => structuredClone(value);
  let storedSubscriptions = clone(subscriptions);
  const store = {
    read: () => { counters.subscriptions += 1; return clone(storedSubscriptions); },
    save: data => { counters.subscriptionWrites += 1; storedSubscriptions = clone(data); },
    reconcile(lessons, data) { counters.reconcile += 1; return LearningSubscriptionStore.prototype.reconcile.call(this, lessons, data); },
  };
  const context = {
    createStudentBalanceReadContext, subscriptionOccurrence, deduplicateGroupLessonSessions, isGroupLessonAssigned, participationOccurrence,
    calculateLessonPrice, lessonRateAt, balanceCents, createBalanceAccount,
    learningSubscriptions: store,
    readLearningGroupsDb: () => { counters.groups += 1; return clone(groups); },
    readLearningLessonSessionsDb: () => { counters.lessons += 1; return clone(lessons); },
    readStudentsDb: () => { counters.students += 1; return clone(students); },
    readPaymentNotificationsDb: () => { counters.notifications += 1; return { items: [
      { teacherId: 'teacher', studentId: 'student-0', status: 'applied', id: 'receipt-own', rawHash: 'hash-own' },
      { teacherId: 'teacher', studentId: 'student-1', status: 'applied', id: 'receipt-other' },
    ] }; },
    getLearningGroupById: id => context.readLearningGroupsDb().find(group => group.id === id && !group.deletedAt) || null,
    getLessonReplaySummary: () => { counters.replaySummaries += 1; return { available: false, eventCount: 0 }; }, buildLearningGroupLessonReplayKey: id => id,
    lessonPaceStore: { list: () => [] },
    buildStudentScheduleEntryFromGoogleCalendar: (entry, student) => ({ id: `projected:${entry.id}:${student.id}` }),
    normalizeScheduleDurationMinutes: value => Number(value) || 60,
    normalizeTeacherFinanceMonthKey: value => /^\d{4}-\d{2}$/.test(value) ? value : '',
    roundTeacherFinanceNumber: value => Math.round(value * 100) / 100, LEARNING_GROUP_DEFAULT_LESSON_PRICE: 1000,
    getTeacherFinanceStudentRecordForMonth: (entry, studentId, month) => ({ profile: entry.studentProfiles[studentId] || {},
      record: entry.months[month]?.students[studentId] || {} }),
    getCalendarOffsetMinutesAt: () => 180,
    getStudentSchedulePaymentNowInfo: () => ({ todayNumber: 20734, lookbackStartNumber: 20000 }),
    getStudentSchedulePaymentDateFromCreatedAt: student => student.createdAt,
    dayKeyToNumber: day => Date.parse(`${day}T00:00:00Z`) / 86400_000, PAYMENT_TRANSFER_LOOKAHEAD_DAYS: 365,
    normalizeDayKey: day => day || '', normalizeScheduleTime: time => time || '', normalizeTeacherId: value => String(value || '').trim(),
    isGoogleStudentScheduleEntry: entry => entry.source === 'google-ical', isActiveStudent: student => !student.deletedAt,
    googleCalendarEntryMatchesStudent: (_entry, student, roster) => roster.some(candidate => candidate.id === student.id),
    getPaymentStudentScheduleNameKeys: student => new Set([student.name]), getPaymentScheduleEntryNameKeys: entry => new Set([entry.studentName]),
    getStudentScheduleOccurrenceDays: entry => [{ dayKey: entry.date }],
    buildTeacherCalendarPaymentMarkKey: (teacherId, event, day, type) => `${teacherId}:${event.id}:${day}:${event.studentId}:${event.time}:${type}`,
    isTeacherCalendarLessonCancelled: (_teacher, event) => Boolean(event.cancelled), isExplicitTrialLesson: event => Boolean(event.trial),
    getDatePartsInCalendarTimeZone: date => ({ dayKey: date.toISOString().slice(0, 10), time: '20:00' }),
    getPaymentAllocationByMarkKey: (entry, key, studentId) => Object.values(entry.paymentAllocations).find(allocation => allocation.studentId === studentId
      && [allocation.currentMarkKey, allocation.originMarkKey].includes(key)),
  };
  const names = ['getLearningSubscriptionOccurrence', 'resolveGroupParticipationOccurrence', 'isGroupEntryAssigned', 'getGroupEntryStudentSourceIds',
    'doesPaymentScheduleEntryMatchStudent', 'getLessonPriceForPaymentOccurrence', 'walletStudentEligible', 'walletMarkParts',
    'getWalletOccurrences', 'seedStudentBalance', 'readResolvedGroupLessonSessions'];
  vm.runInNewContext(`${names.map(declaration).join('\n')}\nglobalThis.api = {${names.join(',')}};`, context);
  // Extract the deployed factory wiring as well as its functions: callback
  // arguments must really reach LearningSubscriptionStore.reconcile.
  const factoryStart = source.indexOf('const readContext = createStudentBalanceReadContext(');
  const factoryEnd = source.indexOf('\n  const db =', factoryStart);
  vm.runInNewContext(source.slice(factoryStart, factoryEnd).replace('const readContext =', 'globalThis.snapshot ='), context);
  const entry = { studentProfiles: Object.fromEntries(students.map(student => [student.id, { lessonPrice: 900, pricingMode: 'perLesson' }])),
    months: { '2026-01': { students: Object.fromEntries(students.map(student => [student.id, { paidAmount: 3600 }])) } },
    lessonLedger: { [`student-0:${days[2]}:20:00:60`]: { studentId: 'student-0', dayKey: days[2], time: '20:00', durationMinutes: 60, lessonPrice: 850 } },
    paymentAllocations: { old: { studentId: 'student-0', status: 'allocated', currentDayKey: days[0], currentTime: '20:00', currentDurationMinutes: 60, currentGroupId: 'group', amount: 800 } },
  };
  const entries = students.flatMap(student => days.map((date, index) => ({ id: `event-${index}:${student.id}`, teacherId: 'teacher',
    studentId: student.id, groupId: 'group', date, time: '20:00', durationMinutes: 60, isLearningGroupEvent: true,
    ...(index === 3 ? { cancelled: true } : {}), ...(index === 4 ? { trial: true } : {}),
    ...(index === 5 ? { calendarMovedFromId: `old:${student.id}`, calendarOriginalStartAt: '2026-01-01T17:00:00Z' } : {}),
  })));
  // A roster-matched Google entry exercises the supporting student snapshot.
  entries.push({ id: 'roster-event', source: 'google-ical', externalEventId: 'ical-id', date: '2026-10-08', time: '22:00', durationMinutes: 90 });
  return { api: context.api, snapshot: context.snapshot, entry, entries, students, counters, lessons, store };
}

test('actual wallet occurrence/price/participation functions keep monetary and identity results with one store read', () => {
  const reference = fixture();
  const expected = reference.students.map(student => reference.api.getWalletOccurrences('teacher', student, reference.entry, {}, reference.entries));
  const cached = fixture();
  const actual = cached.students.map(student => cached.api.getWalletOccurrences('teacher', student, cached.entry, {}, cached.entries, cached.snapshot));
  assert.deepEqual(plain(actual), plain(expected));
  assert.equal(actual[0][0].cents, 80000, 'allocated historical price stays immutable');
  assert.equal(actual[0][2].cents, 85000, 'ledger historical price stays immutable');
  assert.equal(actual[0][6].cents, 90000, 'the personal group rate remains 900');
  assert.equal(actual[0][1].eligible, false, 'resolved Google participation override wins over the duplicate');
  assert.equal(actual[0][3].eligible, false, 'cancelled lesson is not charged');
  assert.equal(actual[0][4].eligible, false, 'trial lesson is not charged');
  assert.equal(actual[1][0].eligible, false, 'selected weekly participation is preserved');
  assert.equal(actual[5][0].eligible, false, 'subscription lesson is not charged to the wallet');
  assert.ok(actual[0][5].moveFromKeys.some(key => key.includes('old:student-0')), 'reschedule aliases remain attached to the same student');
  assert.equal(cached.counters.subscriptions, 1);
  assert.equal(cached.counters.lessons, 1);
  assert.equal(cached.counters.groups, 1);
  assert.equal(cached.counters.students, 1);
  assert.equal(cached.counters.replaySummaries, 2, 'the duplicate resolver checks both copies only once');
  assert.equal(cached.counters.reconcile, 1);
  assert.equal(cached.counters.subscriptionWrites, reference.counters.subscriptionWrites);
  assert.ok(reference.counters.subscriptions > 600);
  assert.ok(reference.counters.lessons > 400);
});

test('actual balance seeding preserves old charges, opening funds and own payment receipts across students', () => {
  const expected = fixture();
  const actual = fixture();
  const marks = Object.fromEntries(actual.students.map(student => [`teacher:historic:2026-01-14:${student.id}:20:00:paid`, '2026-01-13T12:00:00Z']));
  const accounts = actual.students.map(student => actual.api.seedStudentBalance('teacher', student, actual.entry, marks, [], '2026-10-08T12:00:00Z', actual.snapshot));
  const baseline = expected.students.map(student => expected.api.seedStudentBalance('teacher', student, expected.entry, marks, [], '2026-10-08T12:00:00Z'));
  const withoutRandomJournalIds = values => values.map(account => ({ ...account, entries: account.entries.map(({ id: _randomId, ...entry }) => entry) }));
  assert.deepEqual(plain(withoutRandomJournalIds(accounts)), plain(withoutRandomJournalIds(baseline)));
  assert.equal(accounts[0].allocations['teacher:historic:2026-01-14:student-0:20:00:paid'].cents, 90000);
  assert.ok(accounts[0].knownReceiptIds.includes('receipt-own'));
  assert.ok(!accounts[1].knownReceiptIds.includes('receipt-own'), 'equal display names cannot mix payment receipt owners');
  assert.equal(actual.counters.notifications, 1);
  assert.equal(expected.counters.notifications, 6);
});

test('a reconciliation snapshot is lazy, isolated to one call, and retries a failed supporting read', () => {
  let reads = 0;
  const readers = { readSubscriptions: () => ({ blocks: [] }), reconcileSubscriptions: (_lessons, data) => data,
    readLessons: () => [], readResolvedLessons: lessons => lessons, readGroups: () => [],
    readStudents: () => { reads += 1; if (reads === 1) throw new Error('read unavailable'); return [{ id: String(reads) }]; },
    readPaymentNotifications: () => ({ items: [] }) };
  const first = createStudentBalanceReadContext(readers);
  assert.equal(reads, 0);
  assert.throws(() => first.students(), /unavailable/);
  assert.equal(first.students()[0].id, '2');
  assert.strictEqual(first.students(), first.students());
  assert.equal(createStudentBalanceReadContext(readers).students()[0].id, '3');
});

test('LearningSubscriptionStore reconciles an already read snapshot without a second disk read or changing purchased money', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-subscription-snapshot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new LearningSubscriptionStore(path.join(dir, 'subscriptions.json'));
  const block = { id: 'paid-block', teacherId: 'teacher', studentId: 'student', groupId: 'group', startsAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z', cancelledAt: '', lessonIds: [],
    tariff: { kind: 'group', lessonCount: 4, price: 3600 }, payment: { id: 'payment', amount: 3600, receivedAt: '2026-10-01T00:00:00Z' } };
  store.save({ version: 1, tariffs: {}, blocks: [block] });
  let reads = 0;
  const originalRead = store.read.bind(store);
  store.read = () => { reads += 1; return originalRead(); };
  const data = store.read();
  const lessons = Array.from({ length: 4 }, (_, index) => ({ id: `lesson-${index}`, groupId: 'group', teacherId: 'teacher',
    startAt: `2026-10-${String(2 + index).padStart(2, '0')}T20:00:00+03:00`, status: 'scheduled' }));
  assert.strictEqual(store.reconcile(lessons, data), data);
  assert.equal(reads, 1);
  assert.equal(data.blocks[0].tariff.price, 3600);
  assert.deepEqual(data.blocks[0].payment, block.payment);
  assert.deepEqual(originalRead(), data, 'binding replacement slots still persists normally');
  assert.deepEqual(store.reconcile(lessons), data, 'existing callers retain their default disk read');
  assert.equal(reads, 2);
});
