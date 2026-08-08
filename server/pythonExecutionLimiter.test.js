import test from 'node:test';
import assert from 'node:assert/strict';

import { BoundedExecutionSlots, SlidingWindowRateLimiter } from './pythonExecutionLimiter.js';

test('bounded execution slots reject work beyond the queue limit', async () => {
  const slots = new BoundedExecutionSlots({ maxConcurrent: 1, maxQueued: 1 });
  assert.equal(await slots.acquire(), true);
  const queued = slots.acquire();
  assert.equal(await slots.acquire(), false);
  slots.release();
  assert.equal(await queued, true);
  slots.release();
  assert.equal(slots.activeCount, 0);
});

test('bounded execution slots expire queued work without leaking a slot', async () => {
  const slots = new BoundedExecutionSlots({ maxConcurrent: 1, maxQueued: 1 });
  assert.equal(await slots.acquire(), true);
  assert.equal(await slots.acquire(10), false);
  assert.equal(slots.queuedCount, 0);
  slots.release();
  assert.equal(slots.activeCount, 0);
});

test('sliding window limiter allows work after the window expires', () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 1_000 });
  assert.equal(limiter.consume('student', 1_000).allowed, true);
  assert.equal(limiter.consume('student', 1_100).allowed, true);
  const blocked = limiter.consume('student', 1_200);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 800);
  assert.equal(limiter.consume('student', 2_001).allowed, true);
});
