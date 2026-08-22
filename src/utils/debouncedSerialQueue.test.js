import test from 'node:test';
import assert from 'node:assert/strict';

import { createDebouncedSerialQueue } from './debouncedSerialQueue.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('serializes an immediate final state after an already-started debounced write', async () => {
  const firstWrite = deferred();
  const writes = [];
  const queue = createDebouncedSerialQueue({
    delayMs: 0,
    persist: async (value) => {
      writes.push(value);
      if (value.checkState === 'idle') await firstWrite.promise;
    },
  });

  queue.schedule('lesson:student:task', { checkState: 'idle' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const finalWrite = queue.enqueue('lesson:student:task', { checkState: 'correct' });

  assert.deepEqual(writes, [{ checkState: 'idle' }]);
  firstWrite.resolve();
  await finalWrite;
  assert.deepEqual(writes, [{ checkState: 'idle' }, { checkState: 'correct' }]);
});

test('flush persists the latest debounced value before a surface is closed', async () => {
  const writes = [];
  let timerCallback = null;
  const queue = createDebouncedSerialQueue({
    persist: async (value) => { writes.push(value); },
    setTimer: (callback) => {
      timerCallback = callback;
      return 17;
    },
    clearTimer: () => { timerCallback = null; },
  });

  queue.schedule('lesson:student:task', { answers: ['1'] });
  queue.schedule('lesson:student:task', { answers: ['12'] });
  await queue.flush('lesson:student:task');

  assert.equal(timerCallback, null);
  assert.deepEqual(writes, [{ answers: ['12'] }]);
});
