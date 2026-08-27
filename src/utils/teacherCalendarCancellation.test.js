import test from 'node:test';
import assert from 'node:assert/strict';

import {
  annotateTeacherCalendarCancellation,
  buildTeacherCalendarCancellationMarkKey,
  filterTeacherCalendarCancelledSchedule,
  isTeacherCalendarLessonCancelled,
  parseTeacherCalendarCancellationMarkKey,
} from './teacherCalendarCancellation.js';

const teacherId = 'teacher-1';
const recurring = {
  id: 'slot-1',
  studentId: 'student-1',
  weekdayKey: 'monday',
  time: '18:00',
};

test('cancellation key identifies one occurrence and survives parsing', () => {
  const key = buildTeacherCalendarCancellationMarkKey(teacherId, recurring, '2026-08-31');
  assert.equal(key, 'calendar-cancelled|teacher-1|slot-1|2026-08-31|student%3Astudent-1|18:00');
  assert.deepEqual(parseTeacherCalendarCancellationMarkKey(key), {
    teacherId,
    sourceId: 'slot-1',
    dayKey: '2026-08-31',
    scopeId: 'student:student-1',
    time: '18:00',
  });
});

test('recurring cancellation excludes only the selected date', () => {
  const key = buildTeacherCalendarCancellationMarkKey(teacherId, recurring, '2026-08-31');
  const marks = { [key]: '2026-08-27T10:00:00.000Z' };
  const [activeEntry] = filterTeacherCalendarCancelledSchedule(teacherId, [recurring], marks);

  assert.deepEqual(activeEntry.excludedDates, ['2026-08-31']);
  assert.equal(isTeacherCalendarLessonCancelled(teacherId, activeEntry, '2026-08-31', marks), true);
  assert.equal(isTeacherCalendarLessonCancelled(teacherId, activeEntry, '2026-09-07', marks), false);
});

test('explicit Google occurrence is annotated for the teacher and omitted from active schedule', () => {
  const googleEntry = {
    id: 'google-instance-id',
    externalEventId: 'series@example.com',
    studentId: 'student-1',
    date: '2026-09-01',
    time: '09:00',
  };
  const projectedEntry = { ...googleEntry, id: 'student-projection-id' };
  const key = buildTeacherCalendarCancellationMarkKey(teacherId, googleEntry, googleEntry.date);
  const marks = { [key]: '2026-08-27T10:00:00.000Z' };

  assert.equal(annotateTeacherCalendarCancellation(teacherId, googleEntry, marks).cancelled, true);
  assert.equal(isTeacherCalendarLessonCancelled(teacherId, projectedEntry, projectedEntry.date, marks), true);
  assert.deepEqual(filterTeacherCalendarCancelledSchedule(teacherId, [projectedEntry], marks), []);
});

test('group cancellation uses one shared scope for every participant and restores only that date', () => {
  const groupOccurrence = {
    id: 'google-group-occurrence',
    externalEventId: 'google-group-series',
    groupId: 'group-1',
    studentId: 'student-a',
    date: '2026-09-07',
    time: '19:00',
  };
  const participantKey = buildTeacherCalendarCancellationMarkKey(
    teacherId,
    { ...groupOccurrence, studentId: 'student-b' },
    groupOccurrence.date
  );
  const groupKey = buildTeacherCalendarCancellationMarkKey(
    teacherId,
    groupOccurrence,
    groupOccurrence.date
  );
  assert.equal(participantKey, groupKey);

  const marks = { [groupKey]: '2026-08-27T12:00:00.000Z' };
  assert.equal(isTeacherCalendarLessonCancelled(
    teacherId,
    groupOccurrence,
    '2026-09-07',
    marks
  ), true);
  assert.equal(isTeacherCalendarLessonCancelled(
    teacherId,
    { ...groupOccurrence, date: '2026-09-14' },
    '2026-09-14',
    marks
  ), false);
  assert.equal(isTeacherCalendarLessonCancelled(
    teacherId,
    groupOccurrence,
    '2026-09-07',
    {}
  ), false);
});
