import test from 'node:test';
import assert from 'node:assert/strict';
import { enterFallback } from './fallback.mjs';
test('switching an active lesson offline changes sources without restarting its file or losing binding', async () => {
  const job = { id: 'one', status: 'recording', cutoffAt: 100, occurrence: { key: 'lesson' } };
  const calls = [];
  const obs = { choices: async () => ({ platform: [{ itemEnabled: true, itemValue: 'board' }], telemost: [{ itemEnabled: true, itemValue: 'meeting' }] }),
    assertCollection: async () => {}, status: async () => ({ outputActive: true }),
    call: async (method, payload) => { calls.push([method, payload]); return { parameterValue: 'lesson-one' }; }, select: async (...args) => calls.push(args) };
  const engine = { active: () => job, start: () => { throw Error('Must not restart'); } };
  await enterFallback({ engine, obs, payload: { window: 'board', audio: 'meeting' }, save: () => {}, now: () => 1000 });
  assert.equal(job.fallbackMode, true); assert.equal(job.occurrence.key, 'lesson');
  assert.equal(job.cutoffAt, 1000 + 10800000); assert.equal(obs.audioWindow, 'meeting');
  assert.ok(calls.some(([method]) => method === 'window'));
  await enterFallback({ engine, obs, payload: { window: 'board', audio: 'meeting' }, save: () => {}, now: () => 2000 });
  assert.equal(job.cutoffAt, 1000 + 10800000, 'Switching sources must not reset the safety deadline');
  await assert.rejects(enterFallback({ engine, obs, payload: { window: 'closed', audio: 'meeting' }, save: () => {} }), /Выберите/);
});
