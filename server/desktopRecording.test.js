import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDesktopRecordingStore, privateRutubeVideo, RECORDING_RECONNECT_GRACE_MS } from './desktopRecording.js';
import { createStudentBalanceReadCoordinator } from './studentBalanceReadCoordinator.js';

const video = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Secret_Key-123';

test('scheduled recordings stop at endMs in every transport and cannot resume after that boundary', t => {
  for (const audioMode of ['platform', 'telemost']) {
    const f = fixture(t); const { device } = f.connect('teacher');
    const occurrence = { key: 'lesson', lessonId: 'group', endMs: f.now() + 1000 };
    const job = f.store.start('teacher', occurrence, 'Lesson', f.now() + 1800000, { audioMode });
    assert.equal(job.cutoffAt, occurrence.endMs);
    f.store.report(device, job.id, { status: 'recording' });
    f.advance(999); assert.equal(f.store.poll(device, true, () => false, () => true).jobs[0].desired, 'record');
    f.advance(1); assert.equal(f.store.poll(device, true, () => false, () => true).jobs[0].desired, 'stop');
    assert.throws(() => f.store.resume(device, job.id, () => true), /подключитесь/);
    assert.throws(() => f.store.start('teacher', occurrence, 'Lesson', f.now() + 1800000, { audioMode }), /завершено/);
    const next = f.store.start('teacher', { key: 'next', studentId: 'student', endMs: f.now() + 1000 }, 'Next', f.now() + 1800000);
    assert.notEqual(next.id, job.id); assert.equal(next.previousJobId, '');
  }
});

test('persisted legacy overrun is clamped on load before reconnect or resume', t => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const occurrence = { key: 'old', studentId: 'student', endMs: f.now() + 1000 };
  const job = f.store.start('teacher', occurrence, 'Old', occurrence.endMs);
  const db = JSON.parse(fs.readFileSync(f.file)); db.jobs[job.id].cutoffAt += 1800000;
  fs.writeFileSync(f.file, JSON.stringify(db)); f.advance(1000);
  const restarted = createDesktopRecordingStore(f.file, { now: f.now });
  assert.equal(restarted.settings('teacher').jobs[0].cutoffAt, occurrence.endMs);
  assert.throws(() => restarted.resume(device, job.id, () => true), /подключитесь/);
  assert.equal(restarted.poll(device, true, () => false, () => true).jobs[0].desired, 'stop');
});

test('repeated starts refresh the same lesson time in both directions without creating another recording', t => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const occurrence = { key: 'bound', studentId: 'pupil', startMs: f.now() - 1000, endMs: f.now() + 1000 };
  const first = f.store.start('teacher', occurrence, 'Lesson', occurrence.endMs);
  f.store.report(device, first.id, { status: 'recording' });
  const moved = { ...occurrence, startMs: occurrence.startMs + 100, endMs: occurrence.endMs + 2000 };
  const extended = f.store.start('teacher', moved, 'Lesson', moved.endMs);
  assert.equal(extended.id, first.id); assert.equal(extended.cutoffAt, moved.endMs);
  assert.equal(extended.occurrence.startMs, moved.startMs);
  f.advance(1001); assert.equal(f.store.poll(device, true, () => false, () => true).jobs[0].desired, 'record');
  const shortened = { ...moved, endMs: f.now() + 100 };
  assert.equal(f.store.start('teacher', shortened, 'Lesson', shortened.endMs).cutoffAt, shortened.endMs);
  f.advance(100); assert.equal(f.store.poll(device, true, () => false, () => true).jobs[0].desired, 'stop');
  assert.equal(f.store.libraryJobs('teacher').length, 1);
});

test('calendar refresh is scoped to a live bound job, retains its safety limit and survives restart', t => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const occurrence = { key: 'bound', studentId: 'pupil', startMs: f.now() - 1000, endMs: f.now() + 1000 };
  const first = f.store.start('teacher', occurrence, 'Lesson', occurrence.endMs);
  assert.equal(f.store.updateSchedule('other', first.id, { ...occurrence, endMs: f.now() + 2000 }), null);
  assert.equal(f.store.updateSchedule('teacher', first.id, { ...occurrence, studentId: 'other', endMs: f.now() + 2000 }), null);
  const endMs = f.now() + 6 * 3600_000 - 1000;
  assert.equal(f.store.updateSchedule('teacher', first.id, { ...occurrence, endMs }).cutoffAt, f.now() + 5 * 3600_000);
  const restored = createDesktopRecordingStore(f.file, { now: f.now });
  assert.equal(restored.poll(device, true, () => false, () => true).jobs[0].cutoffAt, f.now() + 5 * 3600_000);
  restored.stop(occurrence.key, 'explicit-hangup');
  assert.equal(restored.updateSchedule('teacher', first.id, occurrence), null, 'A calendar change cannot resurrect a stopped recording');
});
test('group hangup is immediate, channel changes keep one file, and rejoining creates a bound continuation', t => {
  const f=fixture(t); const {device}=f.connect('teacher');f.connect('other');
  const occurrence={key:'group',lessonId:'group1'};
  const job=f.store.start('teacher',occurrence,'Group',f.now()+3600000,{audioMode:'platform'});
  f.store.report(device,job.id,{status:'recording'});
  f.store.transitionPlatformCall('teacher',{lessonId:'group1'});
  f.store.stopGroupCall('other','group1');f.store.stopGroupCall('teacher','another');
  assert.equal(f.store.settings('teacher').jobs[0].desired,'record');
  f.store.stopGroupCall('teacher','group1');
  assert.equal(f.store.settings('teacher').jobs[0].desired,'stop');
  assert.equal(JSON.parse(fs.readFileSync(f.file)).jobs[job.id].stopReason,'explicit-group-hangup');
  f.store.report(device,job.id,{status:'saved'});
  const part=f.store.start('teacher',occurrence,'Group',f.now()+3600000,{audioMode:'platform'});
  assert.notEqual(part.id,job.id);assert.equal(part.previousJobId,job.id);
  f.store.transitionPlatformCall('other',{studentId:'pupil'});
  assert.equal(f.store.settings('teacher').jobs.find(j=>j.id===part.id).desired,'record');
  f.store.transitionPlatformCall('teacher',{studentId:'pupil'});
  assert.equal(f.store.settings('teacher').jobs.find(j=>j.id===part.id).desired,'stop');
  assert.equal(f.store.start('teacher',{key:'individual',studentId:'pupil'},'Next',f.now()+3600000,{audioMode:'platform'}).desired,'record');
});
test('quarantined source cannot be republished; a distinct repaired recovery keeps the original hidden', t => {
  const f=fixture(t);const {device}=f.connect('teacher');
  const job=f.store.start('teacher',{key:'group',lessonId:'group1'},'Group',f.now()+3600000);
  f.store.report(device,job.id,{status:'saved'});
  const db=JSON.parse(fs.readFileSync(f.file));db.jobs[job.id].quarantinedAt=new Date(f.now()).toISOString();db.jobs[job.id].status='error';
  fs.writeFileSync(f.file,JSON.stringify(db));const restored=createDesktopRecordingStore(f.file,{now:f.now});
  assert.throws(()=>restored.report(device,job.id,{status:'ready',url:video}),/скрыта/);
  const recovered=restored.recoverFile(device,job.id,'12345678-1234-1234-1234-123456789012');
  restored.report(device,recovered.id,{status:'ready',url:video});
  assert.equal(restored.replay('group').available,true);
  assert.equal(restored.settings('teacher').jobs.find(j=>j.id===job.id).video,null);
});
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-recorder-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let time = 1800000000000;
  const file = path.join(root, 'recordings.json');
  const store = createDesktopRecordingStore(file, { now: () => time, ...options });
  const connect = (teacherId) => {
    const paired = store.exchange(store.pair(teacherId).code, teacherId);
    const device = store.authenticate(paired.token);
    store.poll(device, true); store.configure(teacherId, true);
    return { device, token: paired.token };
  };
  return { root, file, store, connect, now: () => time, advance: (ms) => { time += ms; } };
}

test('recorder heartbeats reuse finance reads, while recording publication invalidates them', async t => {
  const f = fixture(t);
  const { device } = f.connect('teacher');
  let calls = 0;
  let queue = Promise.resolve();
  const read = createStudentBalanceReadCoordinator({
    now: f.now,
    version: teacherId => f.store.availabilityRevision(teacherId),
    enqueue: (_, action) => queue = queue.then(action),
    reconcile: () => { calls++; },
  });
  await read('teacher');
  const job = f.store.start('teacher', { key: 'lesson' }, 'Lesson', f.now() + 3600000);
  await read('teacher');
  assert.equal(calls, 2, 'a new replay may change duplicate lesson selection');
  f.store.report(device, job.id, { status: 'recording' });
  for (let n = 0; n < 5; n++) {
    f.advance(1000);
    f.store.poll(device, true, undefined, () => true);
    f.store.report(device, job.id, { status: 'recording', durationMs: (n + 1) * 1000 });
    await read('teacher');
  }
  assert.equal(calls, 2, 'recorder telemetry must not repeat reconciliation');
  f.store.report(device, job.id, { status: 'saved' });
  await read('teacher');
  assert.equal(calls, 2);
  f.store.report(device, job.id, { status: 'ready', url: video });
  await read('teacher');
  assert.equal(calls, 3, 'published recordings change subscription availability');
  f.advance(15000);
  await read('teacher');
  assert.equal(calls, 4, 'normal finance freshness still expires');
});

test('recording finance revision follows the latest continuation and is teacher scoped', t => {
  const f = fixture(t);
  const { device } = f.connect('teacher');
  f.connect('other');
  const otherRevision = f.store.availabilityRevision('other');
  const first = f.store.start('teacher', { key: 'lesson' }, 'Lesson', f.now() + 3600000);
  f.store.report(device, first.id, { status: 'saved' });
  const unavailable = f.store.availabilityRevision('teacher');
  const resumed = f.store.resume(device, first.id, () => true);
  f.store.report(device, first.id, { status: 'ready', url: video });
  assert.equal(f.store.replay('lesson').available, false);
  assert.equal(f.store.availabilityRevision('teacher'), unavailable);
  f.store.report(device, resumed.id, { status: 'saved' });
  f.store.report(device, resumed.id, { status: 'ready', url: video });
  assert.notEqual(f.store.availabilityRevision('teacher'), unavailable);
  assert.equal(f.store.availabilityRevision('other'), otherRevision);
  const recovered = f.store.recoverFile(device, resumed.id, '12345678-1234-1234-1234-123456789012');
  assert.equal(f.store.replay('lesson').available, false);
  assert.equal(f.store.availabilityRevision('teacher'), unavailable);
  f.store.report(device, recovered.id, { status: 'ready', url: video });
  assert.notEqual(f.store.availabilityRevision('teacher'), unavailable);
});
test('lesson names are resolved for existing recordings without changing file titles or teacher scope', (t) => {
  let name = 'Олег';
  const f = fixture(t, { lessonNameFor: job => job.occurrence.studentId === 'student' ? name : 'Группа 1' });
  const { device } = f.connect('teacher');
  const other = f.connect('other');
  const original = f.store.start('teacher', { key: 'lesson', studentId: 'student' }, 'Урок 2026-09-26 17:00', f.now() + 60000);
  name = 'Олег Иванов';
  const refreshed = f.store.poll(device, true, undefined, () => true);
  assert.equal(refreshed.currentLesson.lessonName, name);
  assert.equal(refreshed.jobs[0].title, original.title);
  assert.equal(f.store.poll(other.device, true).jobs.length, 0);
  f.store.stop('lesson');
  const group = f.store.start('teacher', { key: 'group', lessonId: 'group-lesson' }, 'Урок группы', f.now() + 60000);
  assert.equal(group.lessonName, 'Группа 1');
});

test('Rutube lessons require a real HTTPS private URL and preserve its key', () => {
  assert.equal(privateRutubeVideo(video).embedUrl, 'https://rutube.ru/play/embed/1234567890abcdef1234567890abcdef/?p=Secret_Key-123');
  for (const invalid of [video.replace('https:', 'http:'), video.replace('rutube.ru', 'rutube.ru.evil.test'), video.split('?')[0], video.replace('/private', ''), video.replace('rutube.ru', 'user@rutube.ru')]) assert.equal(privateRutubeVideo(invalid), null);
});
test('pairing is single use, expires, hashes credentials and scopes jobs to teacher', (t) => {
  const f = fixture(t); const code = f.store.pair('one').code;
  const paired = f.store.exchange(code, 'PC');
  assert.throws(() => f.store.exchange(code, 'PC'));
  assert.ok(!fs.readFileSync(f.file, 'utf8').includes(paired.token));
  assert.equal(f.store.authenticate('wrong-token'), null);
  const expired = f.store.pair('late').code; f.advance(300001);
  assert.throws(() => f.store.exchange(expired, 'PC'));
  const first = f.connect('one'); const second = f.connect('two');
  const job = f.store.start('one', { key: 'lesson-one' }, 'Урок', f.now() + 60000);
  assert.equal(f.store.poll(second.device, true).jobs.length, 0);
  assert.throws(() => f.store.report(second.device, job.id, { status: 'recording' }));
  assert.equal(f.store.report(first.device, job.id, { status: 'recording' }).status, 'recording');
});
test('lesson starts are idempotent, concurrent lessons rejected, no reopening a captured lesson', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const occurrence = { key: 'lesson' };
  const job = f.store.start('teacher', occurrence, 'Урок', f.now() + 60000);
  assert.equal(f.store.start('teacher', occurrence, 'Урок', f.now() + 60000).id, job.id);
  assert.throws(() => f.store.start('teacher', { key: 'another' }, 'Урок', f.now() + 60000));
  f.store.report(device, job.id, { status: 'recording' });
  f.store.stop('lesson');
  assert.equal(f.store.start('teacher', occurrence, 'Урок', f.now() + 60000).desired, 'stop');
  assert.throws(() => f.store.report(device, job.id, { status: 'recording' }));
});

test('a lesson that never reached OBS can start again when its call resumes', (t) => {
  const f = fixture(t); f.connect('teacher');
  const job = f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 60000);
  f.store.stop('lesson');
  const resumed = f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 60000, { audioMode: 'platform' });
  assert.equal(resumed.id, job.id); assert.equal(resumed.desired, 'record');
  assert.equal(resumed.audioMode, 'platform');
});

test('a live lesson transport handoff refreshes its audio mode without finishing or replacing the recording', t => {
  const f=fixture(t),{device}=f.connect('teacher'),occurrence={key:'lesson',studentId:'pupil'};
  const job=f.store.start('teacher',occurrence,'Lesson',f.now()+3600000,{audioMode:'platform'});
  f.store.report(device,job.id,{status:'recording'});
  f.store.requestStop('lesson');f.advance(1000);
  const moved=f.store.start('teacher',occurrence,'Lesson',f.now()+3600000,{audioMode:'telemost'});
  assert.equal(moved.id,job.id);assert.equal(moved.status,'recording');assert.equal(moved.desired,'record');assert.equal(moved.audioMode,'telemost');
  assert.equal(f.store.poll(device,true,undefined,()=>true).jobs[0].audioMode,'telemost');
  const returned=f.store.start('teacher',occurrence,'Lesson',f.now()+3600000,{audioMode:'platform'});
  assert.equal(returned.id,job.id);assert.equal(returned.audioMode,'platform');
  assert.equal(f.store.settings('teacher').jobs.length,1);
});

test('OBS keeps the same recording through a two-minute disconnect, then stops after five inactive minutes', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const cutoff = f.now() + 3600000;
  const job = f.store.start('teacher', { key: 'lesson' }, 'Урок', cutoff);
  f.store.report(device, job.id, { status: 'recording' });
  f.store.poll(device, true, undefined, () => true);
  f.store.requestStop('lesson'); f.advance(16000);
  assert.equal(f.store.poll(device, true, undefined, () => true).jobs[0].desired, 'record');
  f.store.requestStop('lesson');
  f.advance(120000);
  assert.equal(f.store.poll(device, true, undefined, () => false).jobs[0].desired, 'record');
  const resumed = f.store.start('teacher', { key: 'lesson' }, 'Урок', cutoff);
  assert.equal(resumed.id, job.id); assert.equal(resumed.status, 'recording');
  f.advance(RECORDING_RECONNECT_GRACE_MS - 1);
  assert.equal(f.store.poll(device, true, undefined, () => false).jobs[0].desired, 'record');
  f.advance(1);
  assert.equal(f.store.poll(device, true, undefined, () => false).jobs[0].desired, 'stop');
});

test('reconnection grace survives server restart and explicit finish still stops immediately', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  f.store.start('teacher', { key: 'first' }, 'Урок', f.now() + 3600000);
  f.store.requestStop('first'); f.advance(60000);
  const restored = createDesktopRecordingStore(f.file, { now: f.now });
  assert.equal(restored.poll(device, true, undefined, () => false).jobs[0].desired, 'record');
  restored.stop('first');
  assert.equal(restored.poll(device, true).jobs[0].desired, 'stop');
  const next = restored.start('teacher', { key: 'next' }, 'Следующий урок', f.now() + 3600000);
  assert.equal(next.desired, 'record');
  assert.notEqual(next.id, restored.settings('teacher').jobs.find(j => j.occurrence.key === 'first').id);
});
test('saved recording stops desired capture, ready is durable and cannot regress', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const job = f.store.start('teacher', { key: 'group:one', lessonId: 'one' }, 'Урок', f.now() + 60000);
  assert.throws(() => f.store.report(device, job.id, { status: 'ready', url: video }));
  f.store.report(device, job.id, { status: 'saved' });
  f.store.report(device, job.id, { status: 'ready', url: video });
  assert.equal(f.store.report(device, job.id, { status: 'error', error: 'late retry' }).status, 'ready');
  const restored = createDesktopRecordingStore(f.file);
  assert.equal(restored.replay('group:one').video.url, video);
  assert.equal(restored.replay('group:one').available, true);
  assert.equal(restored.poll(device, true).jobs.length, 0);
});
test('cutoff and cancelled group stop recording even without a browser', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 60000);
  f.advance(60001); assert.equal(f.store.poll(device, true).jobs[0].desired, 'stop');
  f.store.start('teacher', { key: 'group', lessonId: 'g' }, 'Урок', f.now() + 60000);
  assert.equal(f.store.poll(device, true, (job) => job.occurrence.lessonId === 'g').jobs.find(j => j.occurrence.key === 'group').desired, 'stop');
});
test('offline or unconfigured devices cannot enable recording and revocation disables it', (t) => {
  const f = fixture(t);
  assert.throws(() => f.store.configure('teacher', true));
  const { device, token } = f.connect('teacher'); f.advance(15001);
  assert.throws(() => f.store.configure('teacher', true));
  f.store.poll(device, true); f.store.revoke('teacher');
  assert.equal(f.store.authenticate(token), null); assert.equal(f.store.enabled('teacher'), false);
});


test('direct room switch stops the previous capture even before its disconnect arrives', (t) => {
  const f = fixture(t); f.connect('teacher');
  const one = f.store.start('teacher', { key: 'first' }, 'Первый', f.now() + 3600000);
  const two = f.store.start('teacher', { key: 'second' }, 'Второй', f.now() + 3600000, { transitionFrom: one.id });
  assert.equal(f.store.settings('teacher').jobs.find(j => j.id === one.id).desired, 'stop');
  assert.equal(two.desired, 'record');
});

test('manual resume creates an idempotent bound continuation and old uploads cannot replace it', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const first = f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 3600000);
  f.store.report(device, first.id, { status: 'saved' });
  f.store.report(device, first.id, { status: 'ready', url: video });
  const resumed = f.store.resume(device, first.id, () => true);
  assert.notEqual(resumed.id, first.id); assert.equal(resumed.previousJobId, first.id);
  assert.equal(resumed.occurrence.key, 'lesson');
  assert.equal(f.store.resume(device, first.id, () => true).id, resumed.id);
  assert.equal(f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 3600000).id, resumed.id);
  f.store.report(device, first.id, { status: 'ready', url: video });
  assert.equal(f.store.replay('lesson').status, 'waiting');
  f.store.report(device, resumed.id, { status: 'saved' });
  f.store.report(device, resumed.id, { status: 'ready', url: video.replace('Secret', 'Combined') });
  assert.match(f.store.replay('lesson').video.url, /Combined/);
});

test('a failed start cannot block a later continuation of the same lesson after a crash', t => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const first = f.store.start('teacher', { key: 'lesson' }, 'Lesson', f.now() + 3600000);
  f.store.report(device, first.id, { status: 'error', error: 'OBS did not confirm start' });
  const second = f.store.resume(device, first.id, () => true);
  assert.notEqual(second.id, first.id);
  assert.equal(f.store.settings('teacher').jobs.find(j => j.id === first.id).desired, 'stop');
  f.store.report(device, second.id, { status: 'saved' });
  // Reproduce state written by older versions: the failed first start still
  // requests recording while a newer part is saved after an OBS crash.
  const db = JSON.parse(fs.readFileSync(f.file)); db.jobs[first.id].desired = 'record';
  fs.writeFileSync(f.file, JSON.stringify(db));
  const restored = createDesktopRecordingStore(f.file, { now: f.now });
  const third = restored.resume(device, second.id, () => true);
  assert.notEqual(third.id, second.id); assert.equal(third.previousJobId, second.id);
  assert.equal(restored.resume(device, second.id, () => true).id, third.id);
  const archived = restored.settings('teacher').jobs.find(j => j.id === first.id);
  assert.equal(archived.desired, 'stop'); assert.equal(archived.status, 'error');
  assert.equal(archived.error, 'OBS did not confirm start');
  assert.equal(third.occurrence.key, 'lesson');
});

test('continuation reuses an older active part without taking another device or lesson', t => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const first = f.store.start('teacher', { key: 'lesson' }, 'Lesson', f.now() + 3600000);
  f.store.report(device, first.id, { status: 'saved' });
  const second = f.store.resume(device, first.id, () => true);
  f.store.report(device, second.id, { status: 'saved' });
  const db = JSON.parse(fs.readFileSync(f.file));
  db.jobs[first.id].desired = 'record'; db.jobs[first.id].status = 'recording';
  fs.writeFileSync(f.file, JSON.stringify(db));
  const restored = createDesktopRecordingStore(f.file, { now: f.now });
  assert.equal(restored.resume(device, second.id, () => true).id, first.id);
  const foreign = f.store.exchange(f.store.pair('teacher').code, 'other computer');
  const otherDevice = f.store.authenticate(foreign.token);
  assert.throws(() => restored.resume(otherDevice, second.id, () => true), /другому компьютеру/);
  // A genuinely different active lesson still blocks recovery, without edits.
  db.jobs[first.id].occurrence.key = 'another-lesson';
  fs.writeFileSync(f.file, JSON.stringify(db));
  const different = createDesktopRecordingStore(f.file, { now: f.now });
  assert.throws(() => different.resume(device, second.id, () => true), /другой урок/);
  assert.equal(different.settings('teacher').jobs.find(j => j.id === first.id).desired, 'record');
});

test('continuation cannot bind a different teacher, ended lesson or past cutoff', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher'); const other = f.connect('other');
  const job = f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 1000);
  f.store.report(device, job.id, { status: 'saved' });
  assert.throws(() => f.store.resume(other.device, job.id, () => true));
  assert.throws(() => f.store.resume(device, job.id, () => false));
  f.advance(1001); assert.throws(() => f.store.resume(device, job.id, () => true));
});

test('recovered full file replaces the short replay without changing the original ready job', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  const old = f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 1000);
  f.store.report(device, old.id, { status: 'saved' });
  f.store.report(device, old.id, { status: 'ready', url: video });
  const id = '12345678-1234-1234-1234-123456789012';
  const recovered = f.store.recoverFile(device, old.id, id);
  assert.equal(recovered.id, id); assert.equal(f.store.recoverFile(device, old.id, id).id, id);
  f.store.report(device, id, { status: 'ready', url: video.replace('Secret', 'Recovered') });
  assert.match(f.store.replay('lesson').video.url, /Recovered/);
  assert.equal(f.store.settings('teacher').jobs.find(j => j.id === old.id).video.url, video);
});


test('explicit platform hangup stops only the matching individual recording immediately', t => {
  const f = fixture(t); const { device } = f.connect('teacher'); f.connect('other');
  const job = f.store.start('teacher', { key: 'individual', studentId: 'pupil' }, 'Lesson', f.now() + 3600000, { audioMode: 'platform' });
  f.store.stopPlatformCall('other', 'pupil'); f.store.stopPlatformCall('teacher', 'another');
  assert.equal(f.store.poll(device, true, undefined, () => true).jobs[0].desired, 'record');
  f.store.stopPlatformCall('teacher', 'pupil');
  assert.equal(f.store.poll(device, true, undefined, () => true).jobs[0].desired, 'stop');
  assert.equal(JSON.parse(fs.readFileSync(f.file)).jobs[job.id].stopReason, 'explicit-hangup');
  const telemost = f.store.start('teacher', { key: 'telemost', studentId: 'pupil' }, 'External', f.now() + 3600000, { audioMode: 'telemost' });
  f.store.stopPlatformCall('teacher', 'pupil');
  assert.equal(f.store.settings('teacher').jobs.find(j => j.id === telemost.id).desired, 'record');
  f.store.stop('telemost');
  const group = f.store.start('teacher', { key: 'group', studentId: 'pupil', lessonId: 'g' }, 'Group', f.now() + 3600000, { audioMode: 'platform' });
  f.store.stopPlatformCall('teacher', 'pupil');
  assert.equal(f.store.settings('teacher').jobs.find(j => j.id === group.id).desired, 'record');
});
