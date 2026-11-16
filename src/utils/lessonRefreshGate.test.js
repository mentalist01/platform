import assert from 'node:assert/strict';
import test from 'node:test';
import { createLessonRefreshGate } from './lessonRefreshGate.js';

test('a slow response and a burst of focus events result in one read and a quiet period', async () => {
  let now = 0, reads = 0, resolveRead;
  const refresh = createLessonRefreshGate({ now: () => now });
  const read = () => new Promise(resolve => { reads++; resolveRead = resolve; });
  const requests = Array.from({ length: 300 }, () => refresh(read));
  await Promise.resolve();
  assert.equal(reads, 1);
  assert.ok(requests.every(request => request === requests[0]));
  now = 10000;
  resolveRead('result');
  assert.equal(await requests[0], 'result');
  await refresh(() => { reads++; });
  assert.equal(reads, 1);
  now += 2000;
  await refresh(() => { reads++; });
  assert.equal(reads, 2);
});

test('an urgent lesson opening waits for a slow read and gets one fresh result', async () => {
  let resolveBefore;
  const refresh = createLessonRefreshGate();
  const before = refresh(() => new Promise(resolve => { resolveBefore = resolve; }));
  const first = refresh(() => 'link now visible', { urgent: true });
  const second = refresh(() => assert.fail('expected one follow-up'), { urgent: true });
  await Promise.resolve();
  resolveBefore('too early');
  assert.equal(await before, 'too early');
  assert.equal(await first, 'link now visible');
  assert.equal(await second, 'link now visible');
});

test('a failed read also slows retries and an explicit refresh can recover immediately', async () => {
  const refresh = createLessonRefreshGate({ now: () => 0 });
  await assert.rejects(refresh(() => { throw Error('slow server'); }), /slow server/);
  await refresh(() => assert.fail('a burst should not restart after a failure'));
  assert.equal(await refresh(() => 'recovered', { urgent: true }), 'recovered');
});
