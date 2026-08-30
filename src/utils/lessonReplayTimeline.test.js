import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findReplayAudioEventIndex,
  findUpcomingReplayAudioEventIndex,
  getReplayEventNarration,
  getReplayTimelineDurationMs,
} from './lessonReplayTimeline.js';

const audioEvents = [
  { id: 'first', type: 'audio', offsetMs: 0, payload: { durationMs: 30_000 } },
  { id: 'second', type: 'audio', offsetMs: 29_990, payload: { durationMs: 30_000 } },
  { id: 'third', type: 'audio', offsetMs: 70_000, payload: { durationMs: 30_000 } },
];

test('selects the newest overlapping audio segment at the hand-off boundary', () => {
  assert.equal(findReplayAudioEventIndex(audioEvents, 29_989), 0);
  assert.equal(findReplayAudioEventIndex(audioEvents, 29_990), 1);
  assert.equal(findReplayAudioEventIndex(audioEvents, 60_000), 1);
  assert.equal(findReplayAudioEventIndex(audioEvents, 61_000), -1);
  assert.equal(findUpcomingReplayAudioEventIndex(audioEvents, 61_000), 2);
});

test('keeps the recorded audio tail inside the replay duration', () => {
  assert.equal(getReplayTimelineDurationMs(audioEvents, 75_000), 100_000);
});

test('falls back to an older segment that still covers an overlap', () => {
  const overlapping = [
    { id: 'long', type: 'audio', offsetMs: 0, payload: { durationMs: 30_000 } },
    { id: 'short', type: 'audio', offsetMs: 10_000, payload: { durationMs: 1000 } },
  ];
  assert.equal(findReplayAudioEventIndex(overlapping, 12_000), 0);
});

test('builds readable narrations for code, board and viewport actions', () => {
  assert.equal(
    getReplayEventNarration({
      type: 'code',
      actor: { role: 'student', name: 'Аня' },
    }),
    'Аня печатает в коде'
  );
  assert.equal(
    getReplayEventNarration({
      type: 'board',
      payload: { sharedByRole: 'teacher', sharedByName: 'Иван' },
    }),
    'Иван рисует на доске'
  );
  assert.equal(
    getReplayEventNarration({
      type: 'viewport',
      payload: { surface: 'code' },
      actor: { role: 'student' },
    }),
    'Ученик перемещается по коду'
  );
  assert.equal(
    getReplayEventNarration({
      type: 'code',
      payload: { action: 'snapshot', actorVerified: false },
      actor: { role: 'teacher', name: 'Иван' },
    }),
    'Состояние кода'
  );
  assert.equal(
    getReplayEventNarration({
      type: 'code',
      payload: { action: 'edit', actorVerified: true },
      actor: { role: 'teacher', name: 'Иван' },
    }),
    'Иван печатает в коде'
  );
  assert.equal(
    getReplayEventNarration({
      type: 'board',
      payload: { mode: 'delta', upserts: [], removedIds: ['shape-1'] },
      actor: { role: 'student', name: 'Аня' },
    }),
    'Аня стирает с доски'
  );
  assert.equal(
    getReplayEventNarration({
      type: 'board',
      payload: { mode: 'delta', upserts: [{ item: { id: 'stroke-1' } }], removedIds: [] },
      actor: null,
    }),
    'Изменение на доске'
  );
});
