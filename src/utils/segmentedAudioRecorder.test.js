import assert from 'node:assert/strict';
import test from 'node:test';

import { createSegmentedAudioRecorder } from './segmentedAudioRecorder.js';

test('starts the next recorder before stopping the previous segment', async () => {
  const operations = [];
  const timers = new Map();
  const uploaded = [];
  let nextTimerId = 1;
  let recorderId = 0;
  let wallNow = 1_700_000_000_000;
  let monotonicNow = 0;

  class FakeMediaRecorder {
    constructor() {
      this.id = recorderId + 1;
      recorderId += 1;
      this.state = 'inactive';
    }

    start() {
      this.state = 'recording';
      operations.push(`start:${this.id}`);
    }

    stop() {
      this.state = 'inactive';
      operations.push(`stop:${this.id}`);
      this.ondataavailable?.({
        data: new Blob([`segment-${this.id}`], { type: 'audio/webm;codecs=opus' }),
      });
      this.onstop?.();
    }
  }

  const controller = createSegmentedAudioRecorder({
    stream: {},
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 32_000,
    segmentMs: 30_000,
    onSegment: async (blob, metadata) => {
      uploaded.push({ blob, metadata });
      return { saved: true };
    },
    MediaRecorderClass: FakeMediaRecorder,
    nowWall: () => wallNow,
    nowMonotonic: () => monotonicNow,
    setTimer: (callback) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimer: (timerId) => timers.delete(timerId),
  });

  assert.deepEqual(operations, ['start:1']);
  const firstRotation = timers.values().next().value;
  wallNow += 30_000;
  monotonicNow += 30_000;
  firstRotation();
  await Promise.resolve();

  assert.deepEqual(operations.slice(0, 3), ['start:1', 'start:2', 'stop:1']);
  assert.equal(uploaded[0].metadata.durationMs, 30_000);
  assert.equal(uploaded[0].metadata.occurredAt, new Date(1_700_000_000_000).toISOString());

  wallNow += 15_000;
  monotonicNow += 15_000;
  await controller.stop();

  assert.deepEqual(operations, ['start:1', 'start:2', 'stop:1', 'stop:2']);
  assert.equal(uploaded[1].metadata.durationMs, 15_000);
  assert.equal(uploaded[1].metadata.occurredAt, new Date(1_700_000_030_000).toISOString());
  await controller.uploadsDrained;
});

test('separates capture finalization from upload draining and makes stop idempotent', async () => {
  let recorder = null;
  let stopCalls = 0;
  let releaseUpload;
  let segmentWasHandedOff = false;
  const deferredUpload = new Promise((resolve) => {
    releaseUpload = resolve;
  });

  class AsyncStopMediaRecorder {
    constructor() {
      recorder = this;
      this.state = 'inactive';
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      stopCalls += 1;
      this.state = 'inactive';
    }

    finishStop() {
      this.ondataavailable?.({ data: new Blob(['final-audio'], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }

  const controller = createSegmentedAudioRecorder({
    stream: {},
    mimeType: 'audio/webm',
    segmentMs: 30_000,
    onSegment: () => {
      segmentWasHandedOff = true;
      return deferredUpload;
    },
    MediaRecorderClass: AsyncStopMediaRecorder,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });

  let captureResolved = false;
  let uploadsResolved = false;
  controller.captureStopped.then(() => { captureResolved = true; });
  controller.uploadsDrained.then(() => { uploadsResolved = true; });
  const firstStop = controller.stop();
  const secondStop = controller.stop();

  assert.equal(firstStop, secondStop);
  assert.equal(stopCalls, 1);
  await Promise.resolve();
  assert.equal(captureResolved, false);

  recorder.finishStop();
  await firstStop;
  assert.equal(segmentWasHandedOff, true);
  assert.equal(captureResolved, true);
  assert.equal(uploadsResolved, false);

  releaseUpload({ saved: true });
  await controller.uploadsDrained;
  assert.equal(uploadsResolved, true);
});
