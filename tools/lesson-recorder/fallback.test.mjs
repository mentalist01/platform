import test from 'node:test';
import assert from 'node:assert/strict';
import { enterFallback } from './fallback.mjs';
test('switching an active lesson offline changes sources without restarting its file or losing binding', async () => {
  const job = { id: 'one', status: 'recording', cutoffAt: 100000, occurrence: { key: 'lesson', endMs: 3000 } };
  const calls = [];
  const obs = { choices: async () => ({ platform: [{ itemEnabled: true, itemValue: 'board' }], telemost: [{ itemEnabled: true, itemValue: 'meeting' }] }),
    assertCollection: async () => {}, status: async () => ({ outputActive: true }),
    call: async (method, payload) => { calls.push([method, payload]); return { parameterValue: 'lesson-one' }; }, select: async (...args) => calls.push(args) };
  const engine = { active: () => job, start: () => { throw Error('Must not restart'); } };
  await enterFallback({ engine, obs, payload: { window: 'board', audio: 'meeting' }, save: () => {}, now: () => 1000 });
  assert.equal(job.fallbackMode, true); assert.equal(job.occurrence.key, 'lesson');
  assert.equal(job.cutoffAt, 3000); assert.equal(obs.audioWindow, 'meeting');
  assert.ok(calls.some(([method]) => method === 'window'));
  await enterFallback({ engine, obs, payload: { window: 'board', audio: 'meeting' }, save: () => {}, now: () => 2000 });
  assert.equal(job.cutoffAt, 3000, 'Switching sources must not extend the schedule');
  await assert.rejects(enterFallback({ engine, obs, payload: { window: 'closed', audio: 'meeting' }, save: () => {}, now: () => 2000 }), /Выберите/);
  const before = calls.length;
  await assert.rejects(enterFallback({ engine, obs, payload: { window: 'board', audio: 'meeting' }, save: () => {}, now: () => 3000 }), /Время урока закончилось/);
  assert.equal(calls.length, before, 'An expired lesson must not switch or unmute OBS');
});

test('a new unbound offline recording retains the explicit three-hour local limit', async () => {
  let created;
  const engine = { active: () => undefined, start: async job => { created = job; } };
  const obs = { choices: async () => ({ platform: [{ itemEnabled: true, itemValue: 'board' }], telemost: [{ itemEnabled: true, itemValue: 'meeting' }] }), select: async () => {} };
  await enterFallback({ engine, obs, payload: { window: 'board', audio: 'meeting', title: 'Offline' }, save: () => {}, now: () => 1000 });
  assert.equal(created.cutoffAt, 10801000); assert.equal(created.local, true); assert.equal(created.occurrence, undefined);
});
