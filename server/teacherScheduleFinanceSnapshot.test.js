import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('const buildGoogleCalendarLearningGroupMemberPaymentStatuses ='),
  source.indexOf('const getPaymentScheduleEntries ='));
const route = source.slice(source.indexOf("app.get('/api/teacher-schedule',"),
  source.indexOf('const getTeacherCalendarCancellationStudentIds ='));

function fixture({ groupCount = 100, corrupt = false } = {}) {
  const students = Array.from({ length: 6 }, (_, index) => ({ id: `pupil-${index}`, name: `Pupil ${index}`, teacherId: 'teacher' }));
  const entries = Array.from({ length: groupCount }, (_, index) => ({
    id: `lesson-${index}`, groupId: 'group', isLearningGroupEvent: true,
    participantIds: students.map(student => student.id), date: '2026-10-08', time: '20:00', durationMinutes: 60,
  }));
  const financeEntry = { price: 900, studentPaymentBalances: { version: 1, accounts: {} } };
  let reads = 0;
  let handler;
  const snapshots = new Set();
  const identity = entry => entry;
  const context = {
    console: { error() {} },
    app: { get(_path, callback) { handler = callback; } },
    materializeAvailabilitySchedules() {},
    isStudentRole: () => false, isTeacherRole: () => true,
    ensureTeacherAccess: () => ({ id: 'teacher' }),
    readTeacherCalendarMarksDb: () => ({}), normalizeTeacherCalendarMarks: () => ({}),
    buildTeacherCalendarHomeworkProgressByStudentId: () => ({}),
    getTeacherScheduleEntries: () => [],
    annotateTeacherCalendarCancellation: (_id, entry) => entry,
    annotateTeacherCalendarEntryWithHomeworkProgress: identity,
    fetchTeacherGoogleCalendarEntries: async () => entries,
    availabilityCalendarEntries: () => [],
    deduplicateGroupScheduleEntries: identity,
    normalizeTeacherId: identity,
    readLearningGroupsDb: () => [{ id: 'group', teacherId: 'teacher', pricePerLesson: 900 }],
    roundTeacherFinanceNumber: Number,
    LEARNING_GROUP_DEFAULT_LESSON_PRICE: 900,
    readStudentsDb: () => students,
    isCurrentStudent: () => true,
    getStudentSchedulePaymentNowInfo: () => ({}),
    normalizeDayKey: identity, normalizeScheduleDurationMinutes: Number,
    parseScheduleMinutes: () => 1200,
    projectGoogleCalendarEntryForPaymentStudent: identity,
    buildStudentSchedulePaymentState: () => ({ status: 'paid', paid: true, participationRequired: true }),
    readTeacherFinanceDb() {
      reads += 1;
      if (corrupt) throw Object.assign(new Error('Invalid balance journal'), { status: 503, code: 'balance_corrupt' });
      return { teacher: financeEntry };
    },
    getTeacherFinanceTeacherEntry: db => db.teacher,
    getLessonPriceForPaymentOccurrence(entry) { snapshots.add(entry); return { lessonPrice: entry.price }; },
  };
  vm.runInNewContext(`${helpers}\n${route}`, context);
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  return { run: () => handler({ query: {}, auth: { id: 'teacher' } }, response), response,
    reads: () => reads, snapshots, financeEntry };
}

test('600 group member prices share one validated financial snapshot', async () => {
  const data = fixture();
  await data.run();
  assert.equal(data.response.statusCode, 200);
  assert.equal(data.reads(), 1, 'calendar complexity must not multiply full journal reads');
  assert.equal(data.response.body.length, 100);
  for (const event of data.response.body) {
    assert.equal(event.memberPaymentStatuses.length, 6);
    assert.ok(event.memberPaymentStatuses.every(member => member.lessonPrice === 900 && member.paid));
  }
  assert.equal(data.snapshots.size, 1);
  assert.ok(data.snapshots.has(data.financeEntry));
});

test('financial read failure returns 503 instead of an unhandled async rejection', async () => {
  const data = fixture({ corrupt: true });
  await assert.doesNotReject(data.run());
  assert.equal(data.response.statusCode, 503);
  assert.equal(data.response.body.code, 'balance_corrupt');
});

test('an empty calendar does not read or validate unrelated financial data', async () => {
  const data = fixture({ groupCount: 0, corrupt: true });
  await data.run();
  assert.equal(data.response.statusCode, 200);
  assert.equal(data.reads(), 0);
  assert.equal(data.response.body.length, 0);
});
