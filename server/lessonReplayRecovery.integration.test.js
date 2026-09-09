import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { appendLessonReplayEvents, createLessonReplay, LESSON_REPLAY_MAX_FILE_BYTES } from './lessonReplay.js';
import { createLessonReplayEventLog } from './lessonReplayEventLog.js';
import { createLessonReplayReceipts } from './lessonReplayReceipts.js';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const freePort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const codeHash = (code) => {
  const salt = Buffer.from('replay-recovery-integration').toString('base64');
  return `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`;
};

test('durable recovery survives server restarts, response loss and a failed disk write', { timeout: 60_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-recovery-'));
  const data = path.join(root, 'data');
  fs.mkdirSync(path.join(data, 'lesson-replays'), { recursive: true });
  const teacherId = 'recovery-teacher';
  const studentId = 'recovery-student';
  const capturedAt = Date.now() - 24 * 60 * 60 * 1000;
  const occurrence = { key: 'original-offline-lesson', studentId, startMs: capturedAt,
    endMs: capturedAt + 60 * 60 * 1000, durationMinutes: 60, dayKey: new Date(capturedAt).toISOString().slice(0, 10) };
  const session = { id: crypto.randomUUID(), clientSessionId: crypto.randomUUID(),
    actorId: teacherId, actorRole: 'teacher', actorName: 'Recovery Teacher', studentId,
    occurrenceKey: occurrence.key, scope: 'student', via: 'platform', createdAt: capturedAt, clientClockOffsetMs: 1234 };
  const receipts = createLessonReplayReceipts(path.join(data, 'lesson-replay-receipts'));
  receipts.save(session);
  const hash = crypto.createHash('sha256').update(occurrence.key).digest('hex');
  const replayFile = path.join(data, 'lesson-replays', `${hash}.json.gz`);
  fs.writeFileSync(replayFile, gzipSync(JSON.stringify(createLessonReplay(occurrence, capturedAt))));
  const largeOccurrence = { ...occurrence, key: 'large-lesson' };
  const largeSession = { ...session, id: crypto.randomUUID(), clientSessionId: crypto.randomUUID(), occurrenceKey: largeOccurrence.key };
  receipts.save(largeSession);
  const largeReplay = createLessonReplay(largeOccurrence, capturedAt);
  largeReplay.events = Array.from({ length: 400 }, (_, index) => ({
    id: `large-${index}`, type: 'code', actorRole: 'teacher', actorId: teacherId,
    occurredAt: new Date(capturedAt + index * 1000).toISOString(), offsetMs: index * 1000,
    payload: { code: `${index}\n${'x'.repeat(79_990)}`, language: 'python', action: 'edit' },
  }));
  const largeReplayBytes = JSON.stringify(largeReplay);
  assert.ok(Buffer.byteLength(largeReplayBytes) > LESSON_REPLAY_MAX_FILE_BYTES * 0.9);
  assert.ok(Buffer.byteLength(largeReplayBytes) < LESSON_REPLAY_MAX_FILE_BYTES);
  const largeHash = crypto.createHash('sha256').update(largeOccurrence.key).digest('hex');
  fs.writeFileSync(path.join(data, 'lesson-replays', `${largeHash}.json.gz`), gzipSync(largeReplayBytes));
  const eventLog = createLessonReplayEventLog(path.join(data, 'lesson-replay-event-log'));
  const readReplay = () => {
    const compact = JSON.parse(gunzipSync(fs.readFileSync(replayFile)));
    return appendLessonReplayEvents(compact, eventLog.read(occurrence.key), {
      normalizedReplay: true,
    }).replay;
  };
  const writeJson = (name, value) => fs.writeFileSync(path.join(data, name), JSON.stringify(value));
  writeJson('teachers.json', [teacherId, 'other-teacher'].map((id) => ({ id, name: id, codeHash: codeHash(id), createdAt: new Date(capturedAt).toISOString() })));
  writeJson('students.json', [{ id: studentId, teacherId, name: 'Recovery Student', code: 'recovery-student-code', grade: '11', studyStatus: 'active', createdAt: new Date(capturedAt).toISOString(), deletedAt: null }]);
  writeJson('tests.json', {});
  writeJson('progress.json', { [studentId]: { progress: {}, mocks: [], schedule: [], homeworks: [], solvedByTask: {}, solvedEvents: [] } });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  let token;
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGKILL'); });
  };
  const request = async (endpoint, body, auth = token) => {
    const response = await fetch(`${base}/api/${endpoint}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}),
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const ok = async (...args) => {
    const response = await request(...args);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };
  const start = async () => {
    const env = { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: data,
      PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
      COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' };
    // This test must never upload to a configured production bucket.
    for (const prefix of ['S3', 'LESSON_REPLAY_S3']) for (const key of ['ENDPOINT', 'BUCKET', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY']) env[`${prefix}_${key}`] = '';
    child = spawn(process.execPath, ['server/index.js'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (value) => { logs += value; });
    child.stderr.on('data', (value) => { logs += value; });
    const deadline = Date.now() + 15_000;
    while (true) {
      assert.equal(child.exitCode, null, logs);
      try { if ((await fetch(`${base}/api/client-build-version`)).ok) break; } catch { /* starting */ }
      assert.ok(Date.now() < deadline, logs);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    token = `Bearer ${(await ok('login', { code: teacherId }, '')).token}`;
  };
  const events = ['board', 'code'].map((type, i) => ({ id: `durable-${type}`, type,
    occurredAt: new Date(capturedAt + 1000 + i).toISOString(), payload: type === 'board'
      ? { mode: 'snapshot', items: [{ id: 'retained-stroke', type: 'path', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] }
      : { code: 'print("retained")', language: 'python' } }));
  const batch = { sessionId: session.id, recovery: true, durable: true, events };
  const audio = { sessionId: session.id, recovery: true, clientUploadId: crypto.randomUUID(), mimeType: 'audio/webm',
    sizeBytes: 5, durationMs: 1000, occurredAt: events[0].occurredAt };
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ddaa33' } }).jpeg().toBuffer();
  const screenId = crypto.randomUUID();
  const screen = async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ sessionId: session.id, recovery: 'true', clientUploadId: screenId,
      occurredAt: events[0].occurredAt, width: 20, height: 20, sharedByRole: 'teacher' })) form.append(key, String(value));
    form.append('file', new Blob([image], { type: 'image/jpeg' }), 'screen.jpg');
    const response = await fetch(`${base}/api/lesson-replay/snapshot`, { method: 'POST', headers: { Authorization: token }, body: form });
    return { status: response.status, body: await response.json() };
  };
  try {
    await start();
    const recovered = await ok('lesson-replay/session', { studentId, clientSessionId: session.clientSessionId, recovery: true, createdAt: capturedAt });
    assert.equal(recovered.sessionId, session.id);
    assert.equal(recovered.clockOffsetMs, 1234);
    await ok('lesson-replay/events', batch);
    assert.equal(readReplay().events.length, 2, 'HTTP acknowledgement follows the durable event journal write');
    const prepared = await ok('lesson-replay/audio/prepare', audio);
    assert.equal(prepared.storage, 'local');
    assert.equal((await ok('lesson-replay/audio/prepare', audio)).audioId, prepared.audioId);
    const upload = (body) => fetch(`${base}${prepared.uploadUrl}`, { method: 'PUT', headers: { Authorization: token, 'Content-Type': 'audio/webm' }, body });
    assert.equal((await upload('bad')).status, 400);
    assert.equal((await upload('voice')).status, 200);
    await t.test('concurrent completion acknowledges the same audio exactly once', async () => {
      const completions = await Promise.all(Array.from({ length: 3 }, () => request('lesson-replay/audio/complete', { audioId: prepared.audioId })));
      assert.ok(completions.every((result) => result.status === 200), JSON.stringify(completions));
    });
    assert.equal(readReplay().events.filter((event) => event.type === 'audio').length, 1);

    // A directory where the backup file belongs makes replacement fail on
    // Windows and Linux, after the new snapshot file has already been written.
    fs.mkdirSync(`${replayFile}.bak`);
    assert.equal((await screen()).status, 500);
    assert.equal(readReplay().events.filter((event) => event.type === 'screen').length, 0);
    fs.rmdirSync(`${replayFile}.bak`);
    const savedScreen = await screen();
    assert.equal(savedScreen.status, 200, JSON.stringify(savedScreen.body));
    const screenEvent = readReplay().events.find((event) => event.type === 'screen');
    assert.ok(screenEvent, 'the failed cache entry cannot make the retry silently skip saving');
    assert.ok(fs.readdirSync(path.join(data, 'lesson-replay-snapshots', hash)).some((file) => file.includes(screenEvent.payload.snapshotId)));
    await ok('lesson-replay/finish', { sessionId: session.id, recovery: true, endedAt: new Date(capturedAt + 60_000).toISOString() });
    const savedCount = readReplay().events.length;
    await stop();
    await start();
    await ok('lesson-replay/events', batch);
    const duplicateAudio = await ok('lesson-replay/audio/prepare', audio);
    assert.equal(duplicateAudio.audioId, prepared.audioId);
    assert.equal(duplicateAudio.completed, true);
    assert.equal((await screen()).body.duplicate, true);
    assert.equal(readReplay().events.length, savedCount, 'retries after restart cannot duplicate events or media');
    const outsider = `Bearer ${(await ok('login', { code: 'other-teacher' }, '')).token}`;
    assert.notEqual((await request('lesson-replay/events', batch, outsider)).status, 200);
    assert.equal((await request('lesson-replay/session', { studentId, clientSessionId: crypto.randomUUID(), recovery: true, createdAt: capturedAt })).status, 409);
    const invalid = await request('lesson-replay/events', { ...batch, events: [{ ...events[0], id: 'outside-original-lesson', occurredAt: new Date().toISOString() }] });
    assert.notEqual(invalid.status, 200, 'invalid data must not be acknowledged and deleted from the client');
    assert.equal(readReplay().events.length, savedCount);
    const lostStart = { studentId, clientSessionId: crypto.randomUUID(), recovery: true,
      occurrenceKey: occurrence.key, createdAt: capturedAt };
    const restoredDraft = await ok('lesson-replay/session', lostStart);
    assert.equal(restoredDraft.occurrenceKey, occurrence.key);
    assert.equal(receipts.byClient(lostStart.clientSessionId, { id: teacherId, role: 'teacher' }).id, restoredDraft.sessionId);
    assert.equal((await ok('lesson-replay/session', lostStart)).sessionId, restoredDraft.sessionId);
    await ok('lesson-replay/events', { ...batch, sessionId: restoredDraft.sessionId,
      events: [{ ...events[1], id: 'draft-before-first-server-request', payload: { code: 'print("draft recovered")' } }] });
    assert.ok(readReplay().events.some((event) => event.id === 'draft-before-first-server-request'));
    assert.equal((await request('lesson-replay/session', { ...lostStart, clientSessionId: crypto.randomUUID(), createdAt: capturedAt - 24 * 60 * 60 * 1000 })).status, 409);
    await t.test('large lessons can use the full capacity and cannot block other lessons', async () => {
      const largeBatch = { sessionId: largeSession.id, recovery: true, durable: true,
        events: [{ ...events[1], id: 'below-hard-limit', payload: { code: 'print("still fits")' } }] };
      await ok('lesson-replay/events', largeBatch);
      const overflow = await request('lesson-replay/events', { ...largeBatch,
        events: Array.from({ length: 48 }, (_, index) => ({ ...events[1], id: `overflow-${index}`,
          payload: { code: `${index}\n${'y'.repeat(79_990)}` } })) });
      assert.equal(overflow.status, 413);
      const retainedEvents = eventLog.read(largeOccurrence.key);
      assert.ok(retainedEvents.some((event) => event.id === 'below-hard-limit'));
      assert.ok(retainedEvents.every((event) => !event.id.startsWith('overflow-')), 'a rejected batch cannot replace previously saved history');
      await ok('lesson-replay/events', { ...batch,
        events: [{ ...events[1], id: 'other-lesson-after-capacity', payload: { code: 'print("independent lesson")' } }] });
    });
  } finally {
    await stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
