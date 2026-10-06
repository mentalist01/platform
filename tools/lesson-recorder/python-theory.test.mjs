import assert from 'node:assert/strict';
import test from 'node:test';
import { startPythonTheory, publishPythonTheory } from './python-theory.mjs';
const catalog = { teacherId: 't1', tasks: [{ number: 101, title: 'Ввод', subsections: [{ id: '__default__', title: 'Вся тема', existingUrl: '' }] }] };
const payload = { taskNumber: 101, subsectionId: '__default__', expectedUrl: '', title: 'Ввод данных' };
const captureConfig = { mode: 'window', window: 'python-editor', mic: 'python-mic' };
test('preflight binds an independent recording to the selected teacher and topic', async () => {
  let started; const engine = { active: () => null, start: async job => { started = job; } };
  await startPythonTheory({ api: async () => catalog, engine, payload, captureConfig, now: () => 100 });
  assert.equal(started.local, true); assert.equal(started.audioMode, 'teacher');
  assert.equal(started.pythonTheory.teacherId, 't1'); assert.equal(started.cutoffAt, 10800100);
  assert.equal(started.occurrence, undefined);
  assert.equal(started.captureProfile, 'python');
  assert.equal(started.captureConfig.window, 'python-editor');
  assert.equal(started.captureConfig.mic, 'python-mic');
  assert.notEqual(started.captureConfig, captureConfig);
  await assert.rejects(startPythonTheory({ api: async () => { throw Error('offline'); }, engine, payload }), /offline/);
});
test('Python cannot start by silently borrowing ordinary lesson windows or microphone', async () => {
  const engine = { active: () => null, start: async () => assert.fail('must not start') };
  for (const selected of [undefined, {}, { mode: 'window', window: 'editor' }]) {
    await assert.rejects(startPythonTheory({ api: async () => catalog, engine, payload, captureConfig: selected }), /Выберите/);
  }
});
test('preflight will not overwrite a changed video or start over an active capture', async () => {
  const engine = { active: () => null, start: async () => assert.fail('must not start') };
  await assert.rejects(startPythonTheory({ api: async () => catalog, engine, payload: { ...payload, expectedUrl: 'old' } }), /изменился/);
  await assert.rejects(startPythonTheory({ engine: { active: () => ({}) }, payload }), /завершите/);
});
test('processing waits; lost attach response retries same recording without uploading again', async () => {
  const job = { id: 'stable-id', title: 'Урок', url: 'private-link', pythonTheory: { teacherId: 't1', taskNumber: 101 } };
  let calls = 0; const save = () => {};
  const api = async (_route, body) => { assert.equal(body.recordingId, 'stable-id'); if (++calls === 1) throw Error('offline'); return { created: false }; };
  await publishPythonTheory(job, { api, ready: async () => false, save });
  assert.equal(calls, 0); assert.equal(job.status, 'processing');
  await assert.rejects(publishPythonTheory(job, { api, ready: async () => true, save }), /offline/);
  await publishPythonTheory(job, { api, ready: async () => true, save });
  assert.equal(calls, 2); assert.equal(job.status, 'ready');
});
