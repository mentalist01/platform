import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStudentLessonHistory,
  collectLessonHistoryTombstones,
  normalizeLessonHistoryStore,
  paginateStudentLessonHistory,
} from './lessonHistory.js';

const NOW_MS = Date.parse('2026-07-19T17:30:00.000Z'); // 20:30 in Moscow.

test('keeps only completed lessons and sorts the newest first', () => {
  const history = buildStudentLessonHistory({
    studentId: 'student-a',
    studentCreatedAt: '2026-07-10T09:00:00.000Z',
    nowMs: NOW_MS,
    schedule: [
      { id: 'monday', weekdayKey: 'monday', time: '20:00', durationMinutes: 60, createdAt: '2026-07-10T09:00:00.000Z' },
      { id: 'wednesday', weekdayKey: 'wednesday', time: '20:00', durationMinutes: 60, createdAt: '2026-07-10T09:00:00.000Z' },
      { id: 'active', date: '2026-07-19', time: '20:00', durationMinutes: 60, createdAt: '2026-07-10T09:00:00.000Z' },
      { id: 'future', date: '2026-07-19', time: '21:00', durationMinutes: 60, createdAt: '2026-07-10T09:00:00.000Z' },
    ],
  });

  assert.deepEqual(history.map((entry) => entry.dayKey), ['2026-07-15', '2026-07-13']);
});

test('treats a lesson ending exactly now as completed and orders times inside one day', () => {
  const history = buildStudentLessonHistory({
    studentId: 'student-a',
    studentCreatedAt: '2026-07-01T09:00:00.000Z',
    nowMs: Date.parse('2026-07-19T18:00:00.000Z'),
    schedule: [
      { id: 'early', date: '2026-07-19', time: '18:00', durationMinutes: 60 },
      { id: 'late', date: '2026-07-19', time: '20:00', durationMinutes: 60 },
    ],
  });

  assert.deepEqual(history.map((entry) => entry.time), ['20:00', '18:00']);
});

test('starts a recurring series at creation and omits excluded or cancelled lessons', () => {
  const history = buildStudentLessonHistory({
    studentId: 'student-a',
    studentCreatedAt: '2026-06-01T09:00:00.000Z',
    nowMs: NOW_MS,
    schedule: [
      {
        id: 'weekly',
        weekdayKey: 'monday',
        time: '12:00',
        createdAt: '2026-07-10T09:00:00.000Z',
        excludedDates: ['2026-07-13'],
      },
      { id: 'before-student', date: '2026-05-31', time: '12:00' },
      { id: 'cancelled-1', date: '2026-07-12', time: '12:00', status: 'cancelled' },
      { id: 'cancelled-2', date: '2026-07-11', time: '12:00', isCancelled: true },
    ],
  });

  assert.deepEqual(history, []);
});

test('deduplicates schedule, ledger and stored snapshots by occurrence key', () => {
  const shared = {
    studentId: 'student-a',
    dayKey: '2026-07-15',
    time: '20:00',
    durationMinutes: 60,
  };
  const history = buildStudentLessonHistory({
    studentId: 'student-a',
    studentCreatedAt: '2026-07-01T09:00:00.000Z',
    nowMs: NOW_MS,
    schedule: [{ ...shared, id: 'slot-a', date: shared.dayKey, subject: 'Информатика' }],
    ledgerEntries: [{ ...shared, sourceEntryId: 'slot-a' }],
    storedOccurrences: [{ ...shared, topic: { text: 'Массивы', source: 'teacher' } }],
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].subject, 'Информатика');
  assert.equal(history[0].topic.text, 'Массивы');
});

test('keeps a manually titled past lesson after its schedule slot was removed', () => {
  const history = buildStudentLessonHistory({
    studentId: 'student-a',
    studentCreatedAt: '2026-07-01T09:00:00.000Z',
    nowMs: NOW_MS,
    manualTopics: [{
      studentId: 'student-a',
      dayKey: '2026-07-13',
      time: '20:00',
      durationMinutes: 60,
      text: 'Графы и кратчайшие пути',
      updatedAt: '2026-07-13T19:00:00.000Z',
    }],
  });

  assert.equal(history.length, 1);
  assert.deepEqual(history[0].topic, {
    text: 'Графы и кратчайшие пути',
    source: 'teacher',
    taskNumbers: [],
    updatedAt: '2026-07-13T19:00:00.000Z',
  });
});

test('retains lessons without a topic and normalizes durable snapshots', () => {
  const history = buildStudentLessonHistory({
    studentId: 'student-a',
    studentCreatedAt: '2026-07-01T09:00:00.000Z',
    nowMs: NOW_MS,
    schedule: [{ id: 'slot', date: '2026-07-12', time: '16:00', durationMinutes: 60 }],
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].topic, null);

  const store = normalizeLessonHistoryStore({ occurrences: { arbitrary: history[0] } });
  assert.deepEqual(Object.keys(store.occurrences), ['student-a|2026-07-12|16:00|60']);
});

test('paginates in stable order without duplicates at the boundary', () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ key: `lesson-${index}` }));
  const first = paginateStudentLessonHistory(items, { limit: 3 });
  const second = paginateStudentLessonHistory(items, { limit: 3, offset: first.nextOffset });
  const third = paginateStudentLessonHistory(items, { limit: 3, offset: second.nextOffset });

  assert.deepEqual([...first.items, ...second.items, ...third.items].map((entry) => entry.key), items.map((entry) => entry.key));
  assert.equal(first.total, 7);
  assert.equal(third.hasMore, false);
  assert.equal(third.nextOffset, null);
});

test('collects excluded dates and explicit cancellations as durable tombstones', () => {
  const tombstones = collectLessonHistoryTombstones({
    studentId: 'student-a',
    recordedAt: '2026-07-19T18:00:00.000Z',
    schedule: [
      {
        weekdayKey: 'monday',
        time: '20:00',
        durationMinutes: 60,
        excludedDates: ['2026-07-13'],
      },
      {
        date: '2026-07-15',
        time: '18:30',
        durationMinutes: 90,
        status: 'cancelled',
      },
      {
        weekdayKey: 'friday',
        time: '17:00',
        durationMinutes: 60,
        cancelled: true,
      },
    ],
  });

  assert.deepEqual(Object.keys(tombstones).sort(), [
    'student-a|2026-07-13|20:00|60',
    'student-a|2026-07-15|18:30|90',
  ]);
  const store = normalizeLessonHistoryStore({ tombstones });
  assert.deepEqual(Object.keys(store.tombstones).sort(), Object.keys(tombstones).sort());
  assert.equal(store.tombstones['student-a|2026-07-13|20:00|60'].recordedAt, '2026-07-19T18:00:00.000Z');
});

test('a durable tombstone keeps a stored cancelled lesson hidden after its slot is removed', () => {
  const storedOccurrence = {
    studentId: 'student-a',
    dayKey: '2026-07-13',
    time: '20:00',
    durationMinutes: 60,
    subject: 'Informatics',
  };
  const key = 'student-a|2026-07-13|20:00|60';
  const history = buildStudentLessonHistory({
    studentId: 'student-a',
    studentCreatedAt: '2026-07-01T09:00:00.000Z',
    nowMs: NOW_MS,
    schedule: [],
    storedOccurrences: [storedOccurrence],
    tombstones: {
      [key]: {
        key,
        studentId: 'student-a',
        dayKey: '2026-07-13',
        time: '20:00',
        durationMinutes: 60,
        recordedAt: '2026-07-14T09:00:00.000Z',
      },
    },
  });

  assert.deepEqual(history, []);
});
