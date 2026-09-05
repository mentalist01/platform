import assert from 'node:assert/strict';
import test from 'node:test';

import { createSegmentedAudioRecorder } from './segmentedAudioRecorder.js';

const createRecorderHarness = (onSegment = () => ({ saved: true })) => {
  const recorders = [];
  const timers = new Map();
  const failures = [];
  let monotonic = 0;
  let wall = 1_700_000_000_000;
  let nextTimer = 0;
  class Recorder {
    constructor() { this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
    finish() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['audio']) });
      this.onstop?.();
    }
  }
  const controller = createSegmentedAudioRecorder({
    stream: {}, mimeType: 'audio/webm', onSegment,
    onDisabled: (error) => failures.push(error),
    MediaRecorderClass: Recorder,
    nowWall: () => wall, nowMonotonic: () => monotonic,
    setTimer: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimer: (id) => timers.delete(id),
  });
  return {
    controller, recorders, failures,
    advance: (elapsed, wallElapsed = elapsed) => { monotonic += elapsed; wall += wallElapsed; },
    rotate: () => timers.values().next().value(),
  };
};

test('preserves continuous segment timestamps when the system clock changes', async () => {
  const metadata = [];
  const h = createRecorderHarness((blob, info) => { metadata.push(info); });
  h.advance(30_000, -3_600_000);
  h.rotate();
  h.recorders[0].finish();
  h.advance(5000);
  const stopped = h.controller.stop();
  h.recorders[1].finish();
  await stopped;
  await h.controller.uploadsDrained;
  assert.equal(Date.parse(metadata[1].occurredAt) - Date.parse(metadata[0].occurredAt), 30_000);
  assert.equal(metadata[0].durationMs, 30_000);
  assert.equal(metadata[1].durationMs, 5000);
});

test('waits for final audio when an encoder error makes the recorder inactive', async () => {
  let uploads = 0;
  const h = createRecorderHarness(() => { uploads++; });
  const recorder = h.recorders[0];
  recorder.state = 'inactive';
  recorder.onerror({ error: new Error('encoder failed') });
  let stopped = false;
  h.controller.captureStopped.then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  assert.equal(h.controller.disabled, true);
  recorder.finish();
  await h.controller.uploadsDrained;
  assert.equal(uploads, 1);
  assert.equal(h.failures.length, 1);
});

test('unexpected recorder stop finalizes capture and reports the failure', async () => {
  const h = createRecorderHarness();
  h.recorders[0].finish();
  await h.controller.uploadsDrained;
  assert.equal(h.controller.disabled, true);
  assert.match(h.failures[0].message, /stopped unexpectedly/);
});

test('rejected uploads stop capture instead of silently losing later segments', async () => {
  const h = createRecorderHarness(() => Promise.reject(new Error('upload failed')));
  h.advance(30_000);
  h.rotate();
  h.recorders[0].finish();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  assert.equal(h.controller.disabled, true);
  assert.equal(h.recorders[1].state, 'inactive');
  h.recorders[1].finish();
  await h.controller.uploadsDrained;
  assert.equal(h.failures.length, 1);
});

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
