import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLessonTopicOccurrenceKey,
  expandLessonScheduleOccurrences,
  normalizeLessonTopicsStore,
  resolveLessonTopicsForOccurrences,
  zonedLessonDateTimeToUtcMs,
} from './lessonTopics.js';

test('builds a stable occurrence key for one concrete lesson', () => {
  assert.equal(
    buildLessonTopicOccurrenceKey({
      studentId: 'student-a',
      dayKey: '2026-07-19',
      time: '9:05',
      durationMinutes: 60,
    }),
    'student-a|2026-07-19|09:05|60'
  );
});

test('expands recurring lessons and respects excluded dates', () => {
  const occurrences = expandLessonScheduleOccurrences({
    studentId: 'student-a',
    fromDayKey: '2026-07-13',
    toDayKey: '2026-07-26',
    schedule: [{
      id: 'weekly-slot',
      weekdayKey: 'sunday',
      weekdayOrder: 7,
      time: '21:00',
      durationMinutes: 60,
      excludedDates: ['2026-07-26'],
    }],
  });

  assert.deepEqual(occurrences.map((entry) => entry.dayKey), ['2026-07-19']);
  assert.equal(occurrences[0].key, 'student-a|2026-07-19|21:00|60');
});

test('converts lesson wall clock time with the configured timezone', () => {
  assert.equal(
    new Date(zonedLessonDateTimeToUtcMs('2026-07-19', '21:00', 'Europe/Moscow')).toISOString(),
    '2026-07-19T18:00:00.000Z'
  );
});

test('derives all tasks saved during the lesson and ranks repeated activity first', () => {
  const startMs = zonedLessonDateTimeToUtcMs('2026-07-19', '21:00', 'Europe/Moscow');
  const occurrence = {
    key: 'student-a|2026-07-19|21:00|60',
    studentId: 'student-a',
    startMs,
    endMs: startMs + (60 * 60 * 1000),
  };
  const topics = resolveLessonTopicsForOccurrences({
    occurrences: [occurrence],
    activities: [
      { id: 'a1', studentId: 'student-a', taskNumber: 15, occurredAt: '2026-07-19T18:10:00.000Z' },
      { id: 'a2', studentId: 'student-a', taskNumber: 13, occurredAt: '2026-07-19T18:20:00.000Z' },
      { id: 'a3', studentId: 'student-a', taskNumber: 15, occurredAt: '2026-07-19T18:30:00.000Z' },
      { id: 'outside', studentId: 'student-a', taskNumber: 7, occurredAt: '2026-07-19T17:00:00.000Z' },
    ],
  });

  assert.equal(topics[occurrence.key].source, 'notes');
  assert.deepEqual(topics[occurrence.key].taskNumbers, [15, 13]);
  assert.equal(topics[occurrence.key].text, 'Задания №15, 13');
});

test('teacher text always overrides an inferred notes topic', () => {
  const startMs = zonedLessonDateTimeToUtcMs('2026-07-19', '21:00', 'Europe/Moscow');
  const occurrence = {
    key: 'student-a|2026-07-19|21:00|60',
    studentId: 'student-a',
    startMs,
    endMs: startMs + (60 * 60 * 1000),
  };
  const topics = resolveLessonTopicsForOccurrences({
    occurrences: [occurrence],
    manualTopics: {
      [occurrence.key]: {
        studentId: 'student-a',
        dayKey: '2026-07-19',
        time: '21:00',
        durationMinutes: 60,
        text: '  Графы и кратчайшие пути  ',
        updatedAt: '2026-07-18T12:00:00.000Z',
      },
    },
    activities: [
      { id: 'a1', studentId: 'student-a', taskNumber: 15, occurredAt: '2026-07-19T18:10:00.000Z' },
    ],
  });

  assert.deepEqual(topics[occurrence.key], {
    text: 'Графы и кратчайшие пути',
    source: 'teacher',
    taskNumbers: [],
    updatedAt: '2026-07-18T12:00:00.000Z',
  });
});

test('legacy class files backfill the topic, including an original shared-file owner', () => {
  const startMs = zonedLessonDateTimeToUtcMs('2026-07-19', '21:00', 'Europe/Moscow');
  const occurrence = {
    key: 'student-a|2026-07-19|21:00|60',
    studentId: 'student-a',
    startMs,
    endMs: startMs + (60 * 60 * 1000),
  };
  const topics = resolveLessonTopicsForOccurrences({
    occurrences: [occurrence],
    files: [{
      id: 'shared-file',
      studentId: 'lesson-shared:teacher-a',
      originalStudentId: 'student-a',
      isLessonShared: true,
      category: 'class',
      taskNumber: 19,
      createdAt: '2026-07-19T18:25:00.000Z',
    }],
  });

  assert.equal(topics[occurrence.key].text, 'Задание №19–21');
});

test('normalizes the persisted store and rejects prototype-shaped garbage', () => {
  const store = normalizeLessonTopicsStore({
    topics: {
      arbitrary: {
        studentId: 'student-a',
        dayKey: '2026-07-19',
        time: '21:00',
        durationMinutes: 60,
        text: 'Следующая тема',
      },
      invalid: { __proto__: { polluted: true } },
    },
    activities: [
      { id: 'a1', studentId: 'student-a', taskNumber: 12, occurredAt: '2026-07-19T18:15:00.000Z' },
      { id: 'a1', studentId: 'student-a', taskNumber: 13, occurredAt: '2026-07-19T18:16:00.000Z' },
    ],
  });

  assert.equal(Object.keys(store.topics).length, 1);
  assert.equal(store.activities.length, 1);
  assert.equal({}.polluted, undefined);
});
