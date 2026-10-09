import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('const buildStudentSchedulePaymentState ='), source.indexOf('const getStudentScheduleOccurrenceDays ='));
const key = (teacher, event, date, action) => `${teacher}:${event.id}:${date}:${event.studentId}:${event.time}:${action}`;
const scope = { normalizeTeacherId: String, normalizeDayKey: String, normalizeScheduleTime: String,
  getStudentSchedulePaymentEventStudentId: (_entry, _source, student) => student,
  buildTeacherCalendarPaymentMarkKey: key, buildTeacherCalendarCancellationMarkKey: () => '',
  getLearningSubscriptionOccurrence: () => null, isExplicitTrialLesson: () => false,
  isTeacherCalendarLessonCancelled: () => false, isGroupEntryAssigned: () => true,
  dayKeyToNumber: date => Date.parse(date) / 86400000 };
const build = vm.runInNewContext(`${helper}\nbuildStudentSchedulePaymentState`, scope);
const options = { teacherId: 'teacher', studentId: 'pupil', dayKey: '2026-10-07', startMinutes: 1200, endMinutes: 1260,
  entry: { id: 'google:pupil', time: '20:00', paymentSourceIds: ['plan:pupil'] },
  sourceEntry: { id: 'google:pupil', time: '20:00', paymentSourceIds: ['google', 'google:pupil'] },
  nowInfo: { todayNumber: Date.parse('2026-10-09') / 86400000, currentMinutes: 1300 } };

test('a fresh Google source does not erase the paid identity retained from the group plan', () => {
  const paid = 'teacher:plan:pupil:2026-10-07:pupil:20:00:paid';
  const result = build({ ...options, teacherMarks: { [paid]: '2026-10-01' } });
  assert.equal(result.status, 'paid'); assert.equal(result.paidMarkKey, paid);
});

test('same names and booking aliases never share payment across pupils, teachers, dates or time', () => {
  for (const paid of ['other:plan:pupil:2026-10-07:pupil:20:00:paid', 'teacher:plan:pupil:2026-10-07:other:20:00:paid',
    'teacher:plan:pupil:2026-10-08:pupil:20:00:paid', 'teacher:plan:pupil:2026-10-07:pupil:21:00:paid']) {
    assert.equal(build({ ...options, teacherMarks: { [paid]: '2026-10-01' } }).status, 'unpaid');
  }
});
