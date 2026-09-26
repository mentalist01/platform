import test from 'node:test';
import assert from 'node:assert/strict';
import { queueEstimate, rememberSpeed } from './archive-eta.mjs';

const small = { model: 'small', audioSeconds: 300, wallSeconds: 60 };
const items = [{ id: 'a', model: 'small', duration: 1000, processed: 400 }, { id: 'b', model: 'small', duration: 2000, processed: 0 }];

test('ETA covers the remaining time of every queued recording, using this models measured speed', () => {
  const estimate = queueEstimate({ items, queue: ['a','b','a'], speedSamples: [small] });
  assert.equal(estimate.pendingCount, 2); assert.equal(estimate.seconds, 520); assert.equal(estimate.remainingAudioSeconds, 2600);
  const otherModel = queueEstimate({ items, queue: ['a'], speedSamples: [{ ...small, model: 'base' }] });
  assert.equal(otherModel.seconds, null); assert.equal(otherModel.stage, 'calibrating');
});
test('first-chunk live speed applies across the queue and a pause never counts uncommitted progress', () => {
  const work = { kind: 'transcribe', id: 'a', model: 'small', phase: 'transcribing', chunkStart: 400, seconds: 500, inferenceStartedAt: 1000 };
  const base = { items, queue: ['a','b'], work, now: 21000 };
  assert.equal(queueEstimate(base).seconds, 500);
  assert.equal(queueEstimate({ ...base, paused: true }).seconds, null);
  const paused = queueEstimate({ ...base, paused: true, speedSamples: [small] });
  assert.equal(paused.seconds, 520); assert.equal(paused.paused, true);
  assert.equal(queueEstimate({ ...base, blocked: true, speedSamples: [small] }).seconds, 520);
});
test('unknown durations never masquerade as an estimate of the entire queue; removal and completion recalculate it', () => {
  const unknown = { id: 'c', duration: 0 };
  const value = queueEstimate({ items: [...items, unknown], queue: ['a','c'], speedSamples: [small] });
  assert.equal(value.seconds, null); assert.equal(value.unknownCount, 1); assert.equal(value.stage, 'durations');
  assert.equal(queueEstimate({ items, queue: ['b'], speedSamples: [small] }).seconds, 400);
  assert.equal(queueEstimate({ items, queue: [], speedSamples: [small] }).stage, 'empty');
});
test('mixed models are estimated separately and valid measurements survive serialization', () => {
  let samples = rememberSpeed([], small);
  samples = rememberSpeed(samples, { model: 'base', audioSeconds: 300, wallSeconds: 30 });
  samples = rememberSpeed(samples, { ...small, wallSeconds: NaN });
  assert.equal(samples.length, 2);
  const result = queueEstimate({ items: [items[0], { ...items[1], model: 'base' }], queue: ['a','b'], speedSamples: JSON.parse(JSON.stringify(samples)) });
  assert.equal(result.seconds, 320);
});
