import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RecorderEngine } from './engine.mjs';
import { ownedRecording } from './storage.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-engine-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let recording = false; let name = ''; let startCount = 0; let stopCount = 0;
  let now = 100000; let offline = false; const reports = [];
  const state = { config: { token: 'test' }, jobs: {} };
  let remote = { enabled: true, jobs: [] };
  const obs = {
    launch: async () => {},
    status: async () => ({ outputActive: recording }),
    call: async () => ({ parameterValue: name }),
    start: async (id) => { recording = true; name = `lesson-${id}`; startCount++; },
    stop: async () => { stopCount++; recording = false; const file = path.join(root, `${name}.mkv`); fs.writeFileSync(file, 'video'); return file; },
  };
  const engine = new RecorderEngine({ obs, state, save: () => {}, ready: () => true, recordDirectory: root,
    api: async (route, body) => { if (offline) throw new Error('offline'); if (route !== '/poll') reports.push(body); return route === '/poll' ? remote : {}; }, now: () => now });
  const job = { id: 'one', title: 'Урок', desired: 'record', cutoffAt: now + 1000 };
  return { engine, obs, state, root, job, reports, remote: (value) => { remote = value; }, offline: () => { offline = true; }, online: () => { offline = false; }, advance: (ms) => { now += ms; }, counts: () => [startCount, stopCount], foreign: () => { recording = true; name = 'foreign-output'; } };
}
test('repeated server polls start exactly once and explicit finish stops once', async (t) => {
  const f = fixture(t); f.remote({ enabled: true, jobs: [f.job] });
  await f.engine.tick(); await f.engine.tick(); assert.deepEqual(f.counts(), [1, 0]);
  f.job.desired = 'stop'; await f.engine.tick(); await f.engine.tick();
  assert.deepEqual(f.counts(), [1, 1]); assert.equal(f.state.jobs.one.status, 'saved');
});
test('local cutoff stops capture during a platform network outage', async (t) => {
  const f = fixture(t); await f.engine.start(f.job); f.offline(); f.advance(1001);
  await assert.rejects(f.engine.tick(), /offline/);
  assert.deepEqual(f.counts(), [1, 1]); assert.equal(f.state.jobs.one.status, 'saved');
});
test('crash after OBS start is recovered without starting another recording', async (t) => {
  const f = fixture(t); f.state.jobs.one = { ...f.job, status: 'starting' };
  await f.obs.start('one'); await f.engine.tick();
  assert.equal(f.state.jobs.one.status, 'recording'); assert.deepEqual(f.counts(), [1, 0]);
});
test('foreign recording is neither stopped nor overwritten', async (t) => {
  const f = fixture(t); f.foreign();
  await assert.rejects(f.engine.start(f.job), /уже идёт запись/);
  f.state.jobs.one = { ...f.job, status: 'recording' }; f.advance(2000);
  await assert.rejects(f.engine.tick(), /другая запись/); assert.deepEqual(f.counts(), [0, 0]);
});
test('OBS file paths cannot escape the recording directory or select another lesson', (t) => {
  const f = fixture(t);
  assert.throws(() => ownedRecording(f.root, 'one', path.join(f.root, '..', 'secret.mkv')));
  assert.throws(() => ownedRecording(f.root, 'one', path.join(f.root, 'lesson-two.mkv')));
});
test('already stopped unseen lessons do not start late recordings', async (t) => {
  const f = fixture(t); f.remote({ enabled: true, jobs: [{ ...f.job, desired: 'stop' }] });
  await f.engine.tick(); assert.deepEqual(f.counts(), [0, 0]);
});

test('saved status is retried after restart and reconnect without automatic upload', async (t) => {
  const f = fixture(t); await f.engine.start(f.job); f.offline();
  await assert.rejects(f.engine.stop(f.state.jobs.one), /offline/);
  assert.equal(f.state.jobs.one.pendingReport.status, 'saved');
  f.state.jobs = JSON.parse(JSON.stringify(f.state.jobs));
  f.online(); await f.engine.tick();
  assert.equal(f.reports.at(-1).status, 'saved');
  assert.equal(f.state.jobs.one.pendingReport, undefined);
  assert.deepEqual(f.counts(), [1, 1]);
});

test('unavailable capture sources do not start an empty recording', async (t) => {
  const f = fixture(t); f.obs.prepare = async () => { throw new Error('source unavailable'); };
  await assert.rejects(f.engine.start(f.job), /source unavailable/);
  assert.deepEqual(f.counts(), [0, 0]); assert.equal(f.engine.active(), undefined);
});
