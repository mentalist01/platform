import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findReplayAudioEventIndex,
  findUpcomingReplayAudioEventIndex,
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
