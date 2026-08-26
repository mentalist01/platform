import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCalendarHomeworkProgressEntries,
  findCalendarHomeworkProgressForOccurrence,
  resolveCalendarEventHomeworkProgress,
} from './calendarHomeworkProgress.js';

test('buildCalendarHomeworkProgressEntries keeps upcoming homework and normalizes its progress', () => {
  const result = buildCalendarHomeworkProgressEntries({
    homeworks: [{
      id: 'homework-1',
      issuedAt: '2026-08-20T06:00:00.000Z',
      dueAt: '2026-08-27T06:00:00.000Z',
    }],
    statistics: [{
      id: 'homework-1',
      title: 'Домашняя работа',
      issuedAt: '2026-08-20T06:00:00.000Z',
      dueAt: '2026-08-27T06:00:00.000Z',
      percent: 49.6,
      completedCount: 1,
      totalCount: 2,
    }],
    getDateParts: () => ({ dayKey: '2026-08-27', time: '09:00' }),
    nowMs: Date.parse('2026-08-26T06:00:00.000Z'),
  });

  assert.deepEqual(result, [{
    homeworkId: 'homework-1',
    title: 'Домашняя работа',
    issuedAt: '2026-08-20T06:00:00.000Z',
    dueAt: '2026-08-27T06:00:00.000Z',
    dueDayKey: '2026-08-27',
    dueMinutes: 540,
    percent: 50,
    completedCount: 1,
    totalCount: 2,
  }]);
});

test('buildCalendarHomeworkProgressEntries excludes homework whose deadline has passed', () => {
  const result = buildCalendarHomeworkProgressEntries({
    statistics: [{ id: 'old', dueAt: '2026-08-25T06:00:00.000Z', percent: 100 }],
    getDateParts: () => ({ dayKey: '2026-08-25', time: '09:00' }),
    nowMs: Date.parse('2026-08-26T06:00:00.000Z'),
  });

  assert.deepEqual(result, []);
});

test('findCalendarHomeworkProgressForOccurrence requires the same lesson date and start time', () => {
  const entries = [{ dueDayKey: '2026-08-27', dueMinutes: 540, percent: 30 }];

  assert.equal(
    findCalendarHomeworkProgressForOccurrence(entries, '2026-08-27', 540)?.percent,
    30
  );
  assert.equal(findCalendarHomeworkProgressForOccurrence(entries, '2026-08-27', 600), null);
  assert.equal(findCalendarHomeworkProgressForOccurrence(entries, '2026-08-28', 540), null);
});

test('resolveCalendarEventHomeworkProgress returns zero for an untouched individual homework', () => {
  const result = resolveCalendarEventHomeworkProgress({
    homeworkProgressEntries: [{
      homeworkId: 'homework-1',
      dueDayKey: '2026-08-27',
      dueMinutes: 540,
      percent: 0,
      completedCount: 0,
      totalCount: 4,
    }],
  }, '2026-08-27', 540);

  assert.equal(result?.percent, 0);
  assert.equal(result?.totalCount, 4);
});

test('resolveCalendarEventHomeworkProgress preserves an arbitrary percentage', () => {
  const result = resolveCalendarEventHomeworkProgress({
    homeworkProgressEntries: [{
      dueDayKey: '2026-08-27',
      dueMinutes: 540,
      percent: 37,
      completedCount: 0,
      totalCount: 0,
    }],
  }, '2026-08-27', 540);

  assert.equal(result?.percent, 37);
});

test('resolveCalendarEventHomeworkProgress ignores an older homework with the same deadline', () => {
  const result = resolveCalendarEventHomeworkProgress({
    homeworkProgressEntries: [
      {
        homeworkId: 'old-homework',
        issuedAt: '2026-08-19T18:00:00.000Z',
        dueDayKey: '2026-08-26',
        dueMinutes: 1140,
        percent: 100,
        completedCount: 12,
        totalCount: 12,
      },
      {
        homeworkId: 'current-homework',
        issuedAt: '2026-08-25T18:00:00.000Z',
        dueDayKey: '2026-08-26',
        dueMinutes: 1140,
        percent: 0,
        completedCount: 0,
        totalCount: 17,
      },
    ],
  }, '2026-08-26', 1140);

  assert.equal(result?.homeworkId, 'current-homework');
  assert.equal(result?.percent, 0);
  assert.equal(result?.completedCount, 0);
  assert.equal(result?.totalCount, 17);
  assert.equal(result?.homeworkCount, 1);
});

test('resolveCalendarEventHomeworkProgress aggregates group progress by task count', () => {
  const result = resolveCalendarEventHomeworkProgress({
    participantIds: ['student-1', 'student-2'],
    studentHomeworkProgress: [
      {
        studentId: 'student-1',
        entries: [{
          dueDayKey: '2026-08-27',
          dueMinutes: 540,
          percent: 50,
          completedCount: 1,
          totalCount: 2,
        }],
      },
      {
        studentId: 'student-2',
        entries: [{
          dueDayKey: '2026-08-27',
          dueMinutes: 540,
          percent: 75,
          completedCount: 3,
          totalCount: 4,
        }],
      },
    ],
  }, '2026-08-27', 540);

  assert.equal(result?.percent, 67);
  assert.equal(result?.completedCount, 4);
  assert.equal(result?.totalCount, 6);
  assert.equal(result?.membersWithHomework, 2);
});

test('group progress uses only the latest homework per student and lesson', () => {
  const result = resolveCalendarEventHomeworkProgress({
    participantIds: ['student-1', 'student-2'],
    studentHomeworkProgress: [
      {
        studentId: 'student-1',
        entries: [
          {
            issuedAt: '2026-08-18T18:00:00.000Z',
            dueDayKey: '2026-08-27',
            dueMinutes: 540,
            completedCount: 8,
            totalCount: 8,
          },
          {
            issuedAt: '2026-08-26T08:00:00.000Z',
            dueDayKey: '2026-08-27',
            dueMinutes: 540,
            completedCount: 0,
            totalCount: 10,
          },
        ],
      },
      {
        studentId: 'student-2',
        entries: [{
          issuedAt: '2026-08-26T09:00:00.000Z',
          dueDayKey: '2026-08-27',
          dueMinutes: 540,
          completedCount: 5,
          totalCount: 10,
        }],
      },
    ],
  }, '2026-08-27', 540);

  assert.equal(result?.percent, 25);
  assert.equal(result?.completedCount, 5);
  assert.equal(result?.totalCount, 20);
  assert.equal(result?.homeworkCount, 2);
});
