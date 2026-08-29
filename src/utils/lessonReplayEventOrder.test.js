import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareLessonReplayEvents,
  sortLessonReplayEvents,
} from './lessonReplayEventOrder.js';

test('orders clamped events by wall-clock time and keeps exact ties stable', () => {
  const source = [
    { id: 'delta', offsetMs: 0, occurredAt: '2026-08-29T09:59:59.500Z' },
    { id: 'snapshot', offsetMs: 0, occurredAt: '2026-08-29T09:59:59.000Z' },
    { id: 'first', offsetMs: 0, occurredAt: '2026-08-29T10:00:00.000Z' },
    { id: 'second', offsetMs: 0, occurredAt: '2026-08-29T10:00:00.000Z' },
  ];

  assert.deepEqual(sortLessonReplayEvents(source).map((event) => event.id), [
    'snapshot',
    'delta',
    'first',
    'second',
  ]);
  assert.equal(compareLessonReplayEvents(source[2], source[3]), 0);
});

test('uses the normalized offset before a potentially skewed timestamp', () => {
  const earlierOffset = { offsetMs: 100, occurredAt: '2026-08-29T10:05:00.000Z' };
  const laterOffset = { offsetMs: 200, occurredAt: '2026-08-29T10:00:00.000Z' };
  assert.ok(compareLessonReplayEvents(earlierOffset, laterOffset) < 0);
});
