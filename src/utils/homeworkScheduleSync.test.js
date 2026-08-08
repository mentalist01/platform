import test from 'node:test';
import assert from 'node:assert/strict';

import { synchronizeHomeworkDueAtWithSchedule } from './homeworkScheduleSync.js';

const makeHomework = (patch = {}) => ({
  id: 'homework-1',
  issuedAt: new Date(2026, 6, 30, 12, 0, 0).toISOString(),
  dueAt: new Date(2026, 7, 4, 18, 30, 0).toISOString(),
  dueAtMode: 'next-lesson',
  daysToComplete: 6,
  homeWork: 'Решить задания',
  goals: [],
  checklistItems: [],
  dayPlan: { enabled: true, requestedSessionCount: 3, selectedWeekdays: [1, 2, 3, 4, 5, 6, 7] },
  ...patch,
});

test('moves an automatic homework deadline and rebuilds its plan after a lesson transfer', () => {
  const homework = makeHomework();
  const rebuiltFor = [];
  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework } },
    previousSchedule: [{ weekdayKey: 'tuesday', time: '18:30' }],
    schedule: [{ date: '2026-08-05', time: '17:00' }],
    now: new Date(2026, 6, 30, 13, 0, 0),
    buildDayPlan: (config, updatedHomework) => {
      rebuiltFor.push(updatedHomework.dueAt);
      return { ...config, generatedFor: updatedHomework.dueAt };
    },
  });

  const expectedDueAt = new Date(2026, 7, 5, 17, 0, 0).toISOString();
  assert.equal(result.deadlineChanged, true);
  assert.equal(result.studentData.homeworks[0].dueAt, expectedDueAt);
  assert.equal(result.studentData.homeworks[0].dayPlan.generatedFor, expectedDueAt);
  assert.equal(result.studentData.nextLesson.dueAt, expectedDueAt);
  assert.deepEqual(rebuiltFor, [expectedDueAt]);
});

test('extends the day plan to the next closest lesson when its planned lesson is deleted', () => {
  const plannedLesson = {
    id: 'lesson-planned',
    date: '2026-08-04',
    time: '18:30',
  };
  const followingLesson = {
    id: 'lesson-following',
    date: '2026-08-11',
    time: '18:30',
  };
  const homework = makeHomework({
    dueAt: '2026-08-04T15:30:00.000Z',
    dayPlan: {
      enabled: true,
      requestedSessionCount: 3,
      selectedWeekdays: [1, 2, 3, 4, 5, 6, 7],
      calendarOffsetMinutes: 180,
      dueDay: '2026-08-04',
    },
  });
  const rebuiltFor = [];

  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework } },
    previousSchedule: [plannedLesson, followingLesson],
    schedule: [followingLesson],
    now: new Date('2026-07-30T10:00:00.000Z'),
    buildDayPlan: (config, updatedHomework) => {
      rebuiltFor.push(updatedHomework.dueAt);
      return { ...config, dueDay: '2026-08-11', generatedFor: updatedHomework.dueAt };
    },
  });

  assert.equal(result.deadlineChanged, true);
  assert.equal(result.studentData.homeworks[0].dueAt, '2026-08-11T15:30:00.000Z');
  assert.equal(result.studentData.homeworks[0].dayPlan.dueDay, '2026-08-11');
  assert.equal(result.studentData.nextLesson.dayPlan.dueDay, '2026-08-11');
  assert.deepEqual(rebuiltFor, ['2026-08-11T15:30:00.000Z']);
});

test('infers the automatic mode for homework created before the mode was stored', () => {
  const homework = makeHomework({ dueAtMode: undefined });
  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework } },
    previousSchedule: [{ weekdayKey: 'tuesday', time: '18:30' }],
    schedule: [{ weekdayKey: 'tuesday', time: '19:00' }],
    now: new Date(2026, 6, 30, 13, 0, 0),
  });

  assert.equal(result.deadlineChanged, true);
  assert.equal(result.studentData.homeworks[0].dueAtMode, 'next-lesson');
  assert.equal(result.studentData.homeworks[0].dueAt, new Date(2026, 7, 4, 19, 0, 0).toISOString());
});

test('does not change a manually selected deadline', () => {
  const homework = makeHomework({ dueAtMode: 'manual' });
  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework } },
    previousSchedule: [{ weekdayKey: 'tuesday', time: '18:30' }],
    schedule: [{ weekdayKey: 'friday', time: '15:00' }],
    now: new Date(2026, 6, 30, 13, 0, 0),
  });

  assert.equal(result.deadlineChanged, false);
  assert.equal(result.studentData.homeworks[0].dueAt, homework.dueAt);
});

test('does not rebuild an automatic deadline when the schedule was only read', () => {
  const homework = makeHomework();
  const schedule = [{ weekdayKey: 'tuesday', time: '18:30' }];
  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework }, schedule },
    previousSchedule: schedule,
    schedule,
    now: new Date(2026, 6, 30, 13, 0, 0),
    buildDayPlan: () => { throw new Error('plan must not be rebuilt'); },
  });

  assert.equal(result.deadlineChanged, false);
  assert.equal(result.studentData.homeworks[0].dueAt, homework.dueAt);
  assert.equal(result.studentData.homeworks[0].dayPlan, homework.dayPlan);
});

test('does not roll an overdue automatic homework forward to another lesson', () => {
  const homework = makeHomework({
    dueAt: new Date(2026, 6, 28, 18, 30, 0).toISOString(),
  });
  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework } },
    previousSchedule: [{ weekdayKey: 'tuesday', time: '18:30' }],
    schedule: [{ weekdayKey: 'tuesday', time: '19:00' }],
    now: new Date(2026, 6, 30, 13, 0, 0),
  });

  assert.equal(result.deadlineChanged, false);
  assert.equal(result.studentData.homeworks[0].dueAt, homework.dueAt);
});

test('extends an overdue plan when the lesson at its boundary was explicitly deleted', () => {
  const homework = makeHomework({
    dueAt: '2026-07-30T09:30:00.000Z',
    dayPlan: {
      enabled: true,
      requestedSessionCount: 3,
      selectedWeekdays: [1, 2, 3, 4, 5, 6, 7],
      calendarOffsetMinutes: 180,
    },
  });
  const deletedLesson = { id: 'lesson-deleted', date: '2026-07-30', time: '12:30' };
  const followingLesson = { id: 'lesson-following', date: '2026-08-06', time: '12:30' };

  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework } },
    previousSchedule: [deletedLesson, followingLesson],
    schedule: [followingLesson],
    now: new Date('2026-07-30T10:00:00.000Z'),
    buildDayPlan: (config, updatedHomework) => ({
      ...config,
      dueDay: '2026-08-06',
      generatedFor: updatedHomework.dueAt,
    }),
  });

  assert.equal(result.deadlineChanged, true);
  assert.equal(result.studentData.homeworks[0].dueAt, '2026-08-06T09:30:00.000Z');
  assert.equal(result.studentData.homeworks[0].dayPlan.dueDay, '2026-08-06');
});

test('keeps the current deadline when no future lesson exists and preserves inferred tracking', () => {
  const homework = makeHomework({ dueAtMode: undefined });
  const result = synchronizeHomeworkDueAtWithSchedule({
    studentData: { homeworks: [homework], nextLesson: { ...homework } },
    previousSchedule: [{ weekdayKey: 'tuesday', time: '18:30' }],
    schedule: [],
    now: new Date(2026, 6, 30, 13, 0, 0),
  });

  assert.equal(result.deadlineChanged, false);
  assert.equal(result.studentData.homeworks[0].dueAt, homework.dueAt);
  assert.equal(result.studentData.homeworks[0].dueAtMode, 'next-lesson');
  assert.equal(result.homeworkChanged, true);
  assert.deepEqual(result.studentData.schedule, []);

  const afterAddingLesson = synchronizeHomeworkDueAtWithSchedule({
    studentData: result.studentData,
    previousSchedule: [],
    schedule: [{ weekdayKey: 'friday', time: '16:00' }],
    now: new Date(2026, 6, 30, 14, 0, 0),
  });
  assert.equal(afterAddingLesson.deadlineChanged, true);
  assert.equal(
    afterAddingLesson.studentData.homeworks[0].dueAt,
    new Date(2026, 6, 31, 16, 0, 0).toISOString()
  );
});
