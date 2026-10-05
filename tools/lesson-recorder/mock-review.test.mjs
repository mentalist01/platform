import assert from 'node:assert/strict';
import test from 'node:test';
import { startMockReview, publishMockReview } from './mock-review.mjs';

const catalog = { teacherId: 'a', month: '2026-10', exams: [{ id: 'exam', title: 'Пробник октября', existingUrl: '' }] };
const payload = { examId: 'exam', month: '2026-10', expectedUrl: '' };
test('review recording retains its target and uses teacher audio without starting a lesson', async () => {
  let started;
  const engine = { active: () => null, start: async job => { started = job; } };
  await startMockReview({ api: async () => catalog, engine, payload, now: () => 100 });
  assert.equal(started.local, true); assert.equal(started.manual, true); assert.equal(started.audioMode, 'teacher');
  assert.equal(started.mockReview.teacherId, 'a'); assert.equal(started.mockReview.examId, 'exam');
  assert.equal(started.cutoffAt, 10800100); assert.equal(started.occurrence, undefined);
});
test('changed month, target, existing video or active lesson prevents capture', async () => {
  const engine = { active: () => null, start: async () => assert.fail('no capture') };
  for (const changes of [{ month: '2026-11' }, { examId: 'deleted' }, { expectedUrl: 'old' }]) {
    await assert.rejects(startMockReview({ api: async () => catalog, engine, payload: { ...payload, ...changes } }));
  }
  await assert.rejects(startMockReview({ engine: { active: () => ({}) }, payload }), /завершите/);
});
test('processing waits and attachment retries keep the same recording identity', async () => {
  const job = { id: 'one', url: 'video', mockReview: { teacherId: 'a', examId: 'exam', month: '2026-10' } };
  let calls = 0;
  const api = async (route, body) => { assert.equal(route, '/mock-review/material'); assert.equal(body.recordingId, 'one'); if (++calls === 1) throw Error('offline'); return { created: false }; };
  const save = () => {};
  await publishMockReview(job, { api, ready: async () => false, save }); assert.equal(calls, 0); assert.equal(job.status, 'processing');
  await assert.rejects(publishMockReview(job, { api, ready: async () => true, save }), /offline/);
  await publishMockReview(job, { api, ready: async () => true, save }); assert.equal(job.status, 'ready'); assert.equal(calls, 2);
});
