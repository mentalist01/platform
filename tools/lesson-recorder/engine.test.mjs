import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RecorderEngine } from './engine.mjs';
import { ownedRecording } from './storage.mjs';
import { createTimeline } from './python-timeline.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-engine-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let recording = false; let paused = false; let name = ''; let startCount = 0; let stopCount = 0;
  let now = 100000; let offline = false; const reports = [];
  const state = { config: { token: 'test' }, jobs: {} };
  let remote = { enabled: true, jobs: [] };
  const obs = {
    launch: async () => {},
    status: async () => ({ outputActive: recording, outputPaused: paused }),
    call: async () => ({ parameterValue: name }),
    start: async (id) => { recording = true; name = `lesson-${id}`; startCount++; },
    stop: async () => { stopCount++; recording = false; const file = path.join(root, `${name}.mkv`); fs.writeFileSync(file, 'video'); return file; },
    setRecordPaused: async (id, value) => { assert.equal(name, `lesson-${id}`); paused = value; return { outputActive: recording, outputPaused: paused }; },
  };
  const engine = new RecorderEngine({ obs, state, save: () => {}, ready: () => true, recordDirectory: root,
    api: async (route, body) => { if (offline) throw new Error('offline'); if (route !== '/poll') reports.push(body); return route === '/poll' ? remote : {}; }, now: () => now });
  const job = { id: 'one', title: 'Урок', desired: 'record', cutoffAt: now + 1000 };
  return { engine, obs, state, root, job, reports, remote: (value) => { remote = value; }, offline: () => { offline = true; }, online: () => { offline = false; }, advance: (ms) => { now += ms; }, counts: () => [startCount, stopCount], foreign: () => { recording = true; name = 'foreign-output'; } };
}

test('Python pause and resume keep one active file, do not publish, and survive reconciliation', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, pythonTheory: {} });
  const result = await f.engine.setPythonPaused('one', true);
  assert.equal(result.outputPaused, true);
  await f.engine.tick();
  assert.equal((await f.obs.status()).outputPaused, true);
  assert.equal(f.engine.active().status, 'recording');
  assert.equal(f.engine.active().file, undefined);
  assert.equal((await f.engine.setPythonPaused('one', false)).outputPaused, false);
  assert.deepEqual(f.counts(), [1, 0]); assert.deepEqual(f.reports, []);
  await f.engine.setPythonPaused('one', true);
  await f.engine.stop(f.engine.active());
  assert.equal(f.state.jobs.one.status, 'saved'); assert.deepEqual(f.counts(), [1, 1]);
});

test('mock review pauses in the same output, continues and stops without creating a lesson', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, mockReview: { examId: 'exam' } });
  assert.equal((await f.engine.setMaterialPaused('one', true)).outputPaused, true);
  await assert.rejects(f.engine.setMaterialPaused('other', false), /текущую/);
  assert.equal((await f.engine.setMaterialPaused('one', false)).outputPaused, false);
  await f.engine.stop(f.engine.active());
  assert.deepEqual(f.counts(), [1, 1]); assert.deepEqual(f.reports, []);
  assert.equal(f.state.jobs.one.mockReview.examId, 'exam');
});

test('Python local pause does not wait for an unfinished platform poll', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, pythonTheory: {} });
  let releasePoll; let signalPoll;
  const enteredPoll = new Promise(resolve => { signalPoll = resolve; });
  const pendingPoll = new Promise(resolve => { releasePoll = resolve; });
  f.engine.api = async () => { signalPoll(); return pendingPoll; };
  const tick = f.engine.tick(); await enteredPoll;
  assert.equal((await f.engine.setPythonPaused('one', true)).outputPaused, true);
  releasePoll({ enabled: true, jobs: [] }); await tick;
  assert.deepEqual(f.counts(), [1, 0]);
});

test('finish waits for an in-flight pause and blocks late or overlapping commands', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, pythonTheory: {} });
  let release; f.obs.setRecordPaused = () => new Promise(resolve => { release = resolve; });
  const pause = f.engine.setPythonPaused('one', true);
  await assert.rejects(f.engine.setPythonPaused('one', false), /предыдущего нажатия/);
  const finish = f.engine.stop(f.engine.active());
  await assert.rejects(f.engine.setPythonPaused('one', true), /текущую запись/);
  assert.deepEqual(f.counts(), [1, 0]);
  release({ outputActive: true, outputPaused: true }); await pause; await finish;
  assert.deepEqual(f.counts(), [1, 1]); assert.equal(f.state.jobs.one.status, 'saved');
});

test('pause rejects ordinary lessons, stale Python IDs, expired jobs and invalid state', async t => {
  const f = fixture(t); await f.engine.start(f.job);
  await assert.rejects(f.engine.setPythonPaused('one', true), /Python/);
  f.state.jobs.one.pythonTheory = {};
  await assert.rejects(f.engine.setPythonPaused('old', true), /текущую запись/);
  await assert.rejects(f.engine.setPythonPaused('one', 'true'), /состояние паузы/);
  f.advance(1001);
  await assert.rejects(f.engine.setPythonPaused('one', false), /истекло/);
  await f.engine.tick(); assert.equal(f.state.jobs.one.status, 'saved');
});

test('failed OBS pause releases the control for a safe retry', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, pythonTheory: {} });
  const normal = f.obs.setRecordPaused; f.obs.setRecordPaused = async () => { throw Error('OBS disconnected'); };
  await assert.rejects(f.engine.setPythonPaused('one', true), /disconnected/);
  f.obs.setRecordPaused = normal;
  assert.equal((await f.engine.setPythonPaused('one', true)).outputPaused, true);
  assert.equal(f.state.jobs.one.status, 'recording');
});

test('late OBS pause is reconciled into one take and continuation opens a separate next take', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, pythonTheory: {}, pythonTimeline: createTimeline() });
  let paused = false, seconds = 5;
  f.obs.status = async () => ({ outputActive: true, outputPaused: paused, outputTimecode: `00:00:${seconds.toFixed(3).padStart(6, '0')}` });
  f.obs.setRecordPaused = async () => { throw Error('Late confirmation'); };
  await assert.rejects(f.engine.setPythonPaused('one', true), /Late/);
  paused = true; seconds = 8; await f.engine.reconcileActive(); await f.engine.reconcileActive();
  const timeline = f.state.jobs.one.pythonTimeline;
  assert.deepEqual(timeline.clips.map(c => [c.start,c.end,c.takeNumber]), [[0,8,1]]);
  assert.equal(timeline.openStart, null);
  paused = false; seconds = 10; await f.engine.reconcileActive();
  assert.equal(timeline.openStart, 8, 'Late resume never loses the start of the next take');
  paused = true; seconds = 15; await f.engine.reconcileActive();
  assert.deepEqual(timeline.clips.map(c => [c.start,c.end,c.takeNumber]), [[0,8,1],[8,15,2]]);
  assert.equal(timeline.takeCount, 2);
  assert.deepEqual(f.counts(), [1,0]); assert.deepEqual(f.reports, []);
});

test('stale reconcile snapshots cannot reopen or close a take during a pending command', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, pythonTheory: {}, pythonTimeline: createTimeline() });
  let release; f.obs.setRecordPaused = () => new Promise(resolve => { release = resolve; });
  f.obs.status = async () => ({ outputActive: true, outputPaused: true, outputTimecode: '00:00:05.000' });
  const pending = f.engine.setPythonPaused('one', true);
  await f.engine.reconcileActive();
  assert.equal(f.state.jobs.one.pythonTimeline.clips.length, 0);
  release({ outputActive: true, outputPaused: true, outputTimecode: '00:00:08.000' }); await pending;
  assert.deepEqual(f.state.jobs.one.pythonTimeline.clips.map(c=>[c.start,c.end]), [[0,8]]);
});

test('a poll which finishes after a confirmed local pause cannot reopen that take', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, local: true, pythonTheory: {}, pythonTimeline: createTimeline() });
  let releaseProfile;
  f.obs.status = async () => ({ outputActive:true,outputPaused:false,outputTimecode:'00:00:04.000' });
  f.obs.call = () => new Promise(resolve => { releaseProfile=resolve; });
  const recovering = f.engine.recover(f.state.jobs.one); await Promise.resolve();
  f.obs.setRecordPaused = async () => ({ outputActive:true,outputPaused:true,outputTimecode:'00:00:06.000' });
  await f.engine.setPythonPaused('one',true);
  releaseProfile({parameterValue:'lesson-one'});await recovering;
  assert.equal(f.state.jobs.one.pythonTimeline.openStart,null);
  assert.deepEqual(f.state.jobs.one.pythonTimeline.clips.map(c=>[c.start,c.end]),[[0,6]]);
});
test('repeated server polls start exactly once and explicit finish stops once', async (t) => {
  const f = fixture(t); f.remote({ enabled: true, jobs: [f.job] });
  await f.engine.tick(); await f.engine.tick(); assert.deepEqual(f.counts(), [1, 0]);
  f.job.desired = 'stop'; await f.engine.tick(); await f.engine.tick();
  assert.deepEqual(f.counts(), [1, 1]); assert.equal(f.state.jobs.one.status, 'saved');
});

test('poll refreshes the student name without restarting the recording or renaming its file', async (t) => {
  const f = fixture(t); await f.engine.start(f.job);
  const named = { ...f.job, lessonName: 'Олег' };
  f.remote({ enabled: true, jobs: [named], currentLesson: named });
  await f.engine.tick();
  assert.equal(f.state.jobs.one.lessonName, 'Олег');
  assert.equal(f.engine.currentLesson.lessonName, 'Олег');
  assert.equal(f.state.jobs.one.title, 'Урок');
  assert.deepEqual(f.counts(), [1, 0]);
});

test('back-to-back lessons switch files in one poll while the saved file waits for upload', async (t) => {
  const f = fixture(t); await f.engine.start(f.job);
  const next = { ...f.job, id: 'two', audioMode: 'platform' };
  f.remote({ enabled: true, jobs: [next, { ...f.job, desired: 'stop' }] });
  await f.engine.tick();
  assert.equal(f.state.jobs.one.status, 'saved');
  assert.equal(f.state.jobs.two.status, 'recording');
  assert.deepEqual(f.counts(), [2, 1]);
});

test('the lesson call mode reaches audio source selection', async (t) => {
  const f = fixture(t); let mode;
  f.obs.prepare = async (_config, _directory, audioMode) => { mode = audioMode; };
  await f.engine.start({ ...f.job, audioMode: 'platform' });
  assert.equal(mode, 'platform');
});
test('local cutoff stops capture during a platform network outage', async (t) => {
  const f = fixture(t); await f.engine.start(f.job); f.offline(); f.advance(1001);
  await assert.rejects(f.engine.tick(), /offline/);
  assert.deepEqual(f.counts(), [1, 1]); assert.equal(f.state.jobs.one.status, 'saved');
});

test('temporary internet loss keeps OBS writing the same file and reconnect does not start an upload', async (t) => {
  const f = fixture(t); f.job.cutoffAt += 3600000;
  f.remote({ enabled: true, jobs: [f.job] }); await f.engine.tick();
  f.offline(); f.advance(120000);
  await assert.rejects(f.engine.tick(), /offline/);
  assert.deepEqual(f.counts(), [1, 0]); assert.equal(f.state.jobs.one.status, 'recording');
  f.online(); await f.engine.tick();
  assert.deepEqual(f.counts(), [1, 0]);
  assert.ok(f.reports.every(report => report.status === 'recording'));
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

test('selected recording directory is applied before starting OBS', async (t) => {
  const f = fixture(t);
  f.obs.prepare = async (_config, directory) => {
    assert.equal(directory, f.root);
    assert.deepEqual(f.counts(), [0, 0]);
  };
  await f.engine.start(f.job);
  await f.engine.stop(f.state.jobs.one);
  assert.equal(path.dirname(f.state.jobs.one.file), f.root);
});

test('manual continuation keeps recording despite an old stop and publishes to its original lesson', async (t) => {
  const f = fixture(t); const sent = [];
  f.engine.api = async (route, body) => {
    if (route === '/poll') return { enabled: true, jobs: [{ ...f.job, id: 'original', desired: 'stop' }] };
    sent.push({ route, body }); return {};
  };
  await f.engine.start({ ...f.job, manual: true, remoteJobId: 'original' });
  await f.engine.tick();
  assert.deepEqual(f.counts(), [1, 0]);
  assert.deepEqual(sent, []);
  await f.engine.stop(f.state.jobs.one);
  assert.equal(sent[0].route, '/jobs/original');
  assert.equal(sent[0].body.status, 'saved');
  await f.engine.report(f.state.jobs.one, 'ready', { url: 'private-video' });
  assert.equal(sent[1].route, '/jobs/original');
  assert.equal(sent[1].body.url, 'private-video');
});


test('manual start asks the platform for a bound continuation instead of making a local orphan', async (t) => {
  const f = fixture(t); const calls = [];
  f.engine.api = async (route, body) => {
    calls.push([route, body]);
    if (route === '/poll') return { enabled: true, currentLesson: { id: 'old' } };
    if (route === '/resume') return { ...f.job, previousJobId: 'old' };
    return {};
  };
  await f.engine.startForCurrentLesson();
  assert.equal(f.engine.active().previousJobId, 'old'); assert.equal(f.engine.active().local, undefined);
  assert.deepEqual(calls[1], ['/resume', { id: 'old' }]);
});

test('retry cannot restart OBS with the name of an existing recording', async (t) => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, 'lesson-one.mkv'), 'original');
  await assert.rejects(f.engine.start(f.job), /уже существует/);
  assert.deepEqual(f.counts(), [0, 0]);
});

test('fallback capture ignores stale server stop after recovery but still obeys local cutoff', async t => {
  const f = fixture(t); await f.engine.start({ ...f.job, fallbackMode: true });
  f.remote({ enabled: true, jobs: [{ ...f.job, desired: 'stop' }] });
  await f.engine.tick(); assert.deepEqual(f.counts(), [1, 0]);
  f.offline(); f.advance(1001); await assert.rejects(f.engine.tick(), /offline/);
  assert.deepEqual(f.counts(), [1, 1]); assert.equal(f.state.jobs.one.status, 'saved');
});
