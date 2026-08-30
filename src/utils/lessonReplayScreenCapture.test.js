import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLessonReplayScreenFingerprintDifference,
  shouldSaveLessonReplayScreenFrame,
} from './lessonReplayScreenCapture.js';

test('saves the first screen frame and a visibly changed frame', () => {
  assert.equal(shouldSaveLessonReplayScreenFrame({
    previousFingerprint: [],
    nextFingerprint: [10, 20, 30],
    lastSavedAt: 0,
    nowMs: 1000,
  }), true);
  assert.equal(shouldSaveLessonReplayScreenFrame({
    previousFingerprint: [10, 20, 30],
    nextFingerprint: [20, 30, 40],
    lastSavedAt: 1000,
    nowMs: 6000,
  }), true);
});

test('skips an unchanged poll but preserves the heartbeat frame', () => {
  const fingerprint = [10, 20, 30];
  assert.equal(shouldSaveLessonReplayScreenFrame({
    previousFingerprint: fingerprint,
    nextFingerprint: fingerprint,
    lastSavedAt: 1000,
    nowMs: 6000,
  }), false);
  assert.equal(shouldSaveLessonReplayScreenFrame({
    previousFingerprint: fingerprint,
    nextFingerprint: fingerprint,
    lastSavedAt: 1000,
    nowMs: 61_000,
    heartbeatMs: 60_000,
  }), true);
});

test('compares every color channel instead of losing color-only changes', () => {
  assert.equal(
    getLessonReplayScreenFingerprintDifference([255, 0, 0], [0, 130, 0]) > 1.5,
    true
  );
});
