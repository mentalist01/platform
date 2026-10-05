import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RecorderEngine } from './engine.mjs';
import { recordingSegments } from './segments.mjs';

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-restart-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = { id: 'first', title: 'Урок', occurrence: { key: 'same-lesson' }, desired: 'record', status: 'recording', cutoffAt: 200000, ...overrides };
  fs.writeFileSync(path.join(root, 'lesson-first.mkv'), 'original video');
  const state = { config: { token: 'test' }, jobs: { first: original } };
  let now = 100000, running = false, launched = false, connectedLesson = false, offline = false, owner = 'lesson-first';
  let starts = 0, launches = 0, resumes = 0;
  const obs = {
    launch: async () => { launches++; launched = true; },
    status: async () => { if (!launched) throw Error('OBS not running'); return { outputActive: running }; },
    call: async () => ({ parameterValue: owner }),
    start: async id => { starts++; running = true; owner = `lesson-${id}`; },
    stop: async () => { running = false; return path.join(root, `${owner}.mkv`); },
  };
  const engine = new RecorderEngine({ obs, state, recordDirectory: root, save: () => {}, ready: () => true, now: () => now,
    api: async (route, payload) => {
      if (offline) throw Error('offline');
      if (route === '/jobs/first') { if (payload.status === 'saved') original.desired = 'stop'; return {}; }
      if (route === '/poll') return { enabled: true, currentLesson: connectedLesson ? { ...original } : null, jobs: [{ ...original }] };
      if (route === '/resume') {
        resumes++; assert.equal(payload.id, 'first');
        return { ...original, id: 'second', previousJobId: 'first', status: 'waiting', desired: 'record' };
      }
      return {};
    } });
  return { engine, state, obs, root, original, connect: () => { connectedLesson = true; }, offline: () => { offline = true; }, online: () => { offline = false; },
    expire: () => { now = 200001; }, live: (foreign = false) => { launched = true; running = true; owner = foreign ? 'foreign' : 'lesson-first'; },
    counts: () => ({ launches, starts, resumes }) };
}

test('PC restart launches OBS, preserves the first file and waits for the same active lesson', async t => {
  const f = fixture(t);
  await f.engine.tick();
  assert.equal(f.original.status, 'saved'); assert.equal(f.original.resumeAfterRestart, true);
  assert.equal(f.counts().starts, 0); assert.equal(f.counts().launches, 1);
  f.connect(); await f.engine.tick(); await f.engine.tick();
  assert.equal(f.state.jobs.second.status, 'recording'); assert.equal(f.original.resumeAfterRestart, undefined);
  assert.equal(f.counts().starts, 1); assert.equal(f.counts().resumes, 1);
  assert.equal(fs.readFileSync(f.original.file, 'utf8'), 'original video');
  fs.writeFileSync(path.join(f.root, 'lesson-second.mkv'), 'continuation');
  f.state.jobs.second.file = path.join(f.root, 'lesson-second.mkv');
  assert.deepEqual(recordingSegments(f.state.jobs.second, f.state.jobs, f.root), [f.original.file, f.state.jobs.second.file]);
});

test('the continue button reconciles a stale active job instead of blocking after restart', async t => {
  const f = fixture(t); f.connect();
  await f.engine.startForCurrentLesson();
  assert.equal(f.state.jobs.second.status, 'recording'); assert.equal(f.counts().starts, 1);
});

test('pending continuation survives another panel restart and waits for capture readiness', async t => {
  const f = fixture(t);
  await f.engine.tick();
  const restoredState = JSON.parse(JSON.stringify(f.state));
  let ready = false;
  const restored = new RecorderEngine({ ...f.engine, state: restoredState, ready: () => ready });
  f.connect(); await restored.tick();
  assert.equal(f.counts().starts, 0);
  assert.equal(restoredState.jobs.first.resumeAfterRestart, true);
  ready = true; await restored.tick();
  assert.equal(restoredState.jobs.second.status, 'recording');
  assert.equal(restoredState.jobs.first.resumeAfterRestart, undefined);
  assert.equal(f.counts().starts, 1);
});

test('a panel restart while OBS still records keeps the same output, and never touches foreign output', async t => {
  const f = fixture(t); f.live(); f.connect();
  await f.engine.tick();
  assert.equal(f.original.status, 'recording'); assert.equal(f.counts().starts, 0); assert.equal(f.counts().resumes, 0);
  const foreign = fixture(t); foreign.live(true);
  await assert.rejects(foreign.engine.tick(), /другую запись/);
  assert.equal(foreign.counts().starts, 0);
});

test('network failure after saving the crash file retries its report before resuming', async t => {
  const f = fixture(t); f.offline();
  await assert.rejects(f.engine.tick(), /offline/);
  assert.equal(f.original.status, 'saved'); assert.equal(f.original.resumeAfterRestart, true);
  f.online(); f.connect(); await f.engine.tick();
  assert.equal(f.state.jobs.second.status, 'recording'); assert.equal(f.counts().resumes, 1);
});

test('expired or deliberately stopping recordings never restart automatically', async t => {
  const expired = fixture(t); expired.expire(); expired.connect(); await expired.engine.tick();
  assert.equal(expired.counts().starts, 0); assert.equal(expired.counts().resumes, 0);
  const stopping = fixture(t, { status: 'stopping' }); stopping.connect(); await stopping.engine.tick();
  assert.equal(stopping.original.resumeAfterRestart, undefined); assert.equal(stopping.counts().starts, 0);
});

test('missing original footage and local standalone recordings are not silently resumed', async t => {
  const missing = fixture(t); fs.unlinkSync(path.join(missing.root, 'lesson-first.mkv')); missing.connect(); await missing.engine.tick();
  assert.equal(missing.original.status, 'error'); assert.equal(missing.counts().starts, 0);
  const local = fixture(t, { local: true }); local.connect(); await local.engine.tick();
  assert.equal(local.original.status, 'saved'); assert.equal(local.original.resumeAfterRestart, undefined); assert.equal(local.counts().starts, 0);
});

test('OBS interruption during a running service preserves the partial file and resumes the same live lesson', async t => {
  const f = fixture(t); f.live(); f.connect(); await f.engine.tick();
  // The service is running normally: restartJobs no longer contains this job.
  assert.equal(f.engine.restartJobs.size, 0);
  f.obs.status = async () => ({ outputActive: false });
  await f.engine.tick();
  assert.equal(f.original.status, 'saved');
  assert.equal(f.state.jobs.second.status, 'recording');
  assert.equal(f.counts().starts, 1); assert.equal(f.counts().resumes, 1);
  assert.equal(fs.readFileSync(f.original.file, 'utf8'), 'original video');
});

test('lost OBS connection relaunches capture independently of a service restart', async t => {
  const f = fixture(t); f.live(); await f.engine.tick();
  f.obs.connected = false; f.connect();
  f.obs.status = async () => ({ outputActive: false });
  const before = f.counts().launches;
  await f.engine.tick();
  assert.ok(f.counts().launches > before);
  assert.equal(f.counts().starts, 1); assert.equal(f.counts().resumes, 1);
  assert.equal(f.state.jobs.second.status, 'recording');
});
