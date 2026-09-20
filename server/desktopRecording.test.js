import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDesktopRecordingStore, privateRutubeVideo } from './desktopRecording.js';

const video = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Secret_Key-123';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-recorder-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let time = 1800000000000;
  const file = path.join(root, 'recordings.json');
  const store = createDesktopRecordingStore(file, { now: () => time });
  const connect = (teacherId) => {
    const paired = store.exchange(store.pair(teacherId).code, teacherId);
    const device = store.authenticate(paired.token);
    store.poll(device, true); store.configure(teacherId, true);
    return { device, token: paired.token };
  };
  return { root, file, store, connect, now: () => time, advance: (ms) => { time += ms; } };
}
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

test('a transient disconnected tab cannot stop a live call, but an ended call stops automatically', (t) => {
  const f = fixture(t); const { device } = f.connect('teacher');
  f.store.start('teacher', { key: 'lesson' }, 'Урок', f.now() + 60000);
  f.store.poll(device, true, undefined, () => true);
  f.store.requestStop('lesson'); f.advance(16000);
  assert.equal(f.store.poll(device, true, undefined, () => true).jobs[0].desired, 'record');
  f.advance(29000);
  assert.equal(f.store.poll(device, true, undefined, () => false).jobs[0].desired, 'record');
  f.advance(1000);
  assert.equal(f.store.poll(device, true, undefined, () => false).jobs[0].desired, 'stop');
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
