import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { IndividualLessonPaceStore } from './individualLessonPace.js';

test('real individual RTC with recording disabled: completion, reconnection, surveys, teacher history and restart', { timeout: process.env.PACE_QA_SERVE === '1' ? 3600_000 : 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-individual-pace-api-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  let now = Date.parse('2026-10-07T10:00:00Z');
  const clock = path.join(root, 'clock.txt');
  const advance = ms => { now += ms; fs.writeFileSync(clock, String(now)); };
  advance(0);
  const clockModule = path.join(root, 'clock.mjs');
  fs.writeFileSync(clockModule, `import fs from 'node:fs';
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [Date.now()])); }
  static now() { return Number(fs.readFileSync(process.env.PACE_TEST_CLOCK, 'utf8')); }
};`);
  const hash = code => `scrypt$pace-test$${crypto.scryptSync(code, 'pace-test', 64).toString('base64')}`;
  write('teachers', ['a', 'b'].map(id => ({ id: `teacher-${id}`, name: id, codeHash: hash(`teacher-${id}-code`) })));
  write('students', ['a', 'b', 'short', 'absent', 'obs', 'failed', 'telemost'].map(id => ({ id, teacherId: id === 'b' ? 'teacher-b' : 'teacher-a', name: id, code: `${id}-code`, grade: '11' })));
  write('tests', {}); write('progress', { absent: { schedule: [{ id: 'calendar-only', date: '2026-10-06', time: '12:00', durationMinutes: 60 }] },
    telemost: { schedule: [{ id: 'telemost-session', date: '2026-10-07', time: '13:00', durationMinutes: 60 }] } });
  const store = new IndividualLessonPaceStore(path.join(dataDir, 'individual-lesson-pace.json'), { now: () => now - 3600_000 });
  const occurrence = { key: 'b|2026-10-07|12:00|60', studentId: 'b', dayKey: '2026-10-07', time: '12:00', startMs: now - 3600_000 };
  store.observeLesson('teacher-b', occurrence, now - 3600_000, now - 60_000);
  const obsOccurrence = { ...occurrence, key: 'obs|2026-10-07|12:00|60', studentId: 'obs' };
  write('desktop-recordings', { teachers: {}, devices: {}, jobs: {
    take1: { id: 'take1', teacherId: 'teacher-a', occurrence: obsOccurrence, status: 'saved', desired: 'stop', startedAt: now - 3600_000, stoppedAt: now - 120_000, updatedAt: now },
    take2: { id: 'take2', teacherId: 'teacher-a', occurrence: obsOccurrence, status: 'ready', desired: 'stop', startedAt: now - 1200_000, stoppedAt: now - 60_000, updatedAt: now },
    failed: { id: 'failed', teacherId: 'teacher-a', occurrence: { ...obsOccurrence, key: 'failed:lesson', studentId: 'failed' }, status: 'error', desired: 'stop', startedAt: now - 3600_000, stoppedAt: now - 60_000, updatedAt: now },
  } });
  const port = await new Promise(resolve => { const probe = net.createServer(); probe.listen(process.env.PACE_QA_SERVE === '1' ? 55793 : 0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  let child, logs = '';
  const start = () => {
    child = spawn(process.execPath, ['--import', pathToFileURL(clockModule).href, 'server/index.js'], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PACE_TEST_CLOCK: clock, LEGACY_LESSON_RECORDING_ENABLED: '1', PLATFORM_DATA_DIR: dataDir,
        ...(process.env.PACE_QA_SERVE === '1' ? { CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5599' } : {}),
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  };
  const request = async (route, token = '', method = 'GET', body, expected = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method,
      headers: { Authorization: token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await response.json(); assert.equal(response.status, expected, JSON.stringify(json)); return json;
  };
  const ready = async () => {
    for (let i = 0; i < 200; i++) {
      assert.equal(child.exitCode, null, logs);
      try { await request('/api/client-build-version'); return; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(logs);
  };
  const stop = async () => { if (child?.exitCode === null) { const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended; } };
  const sockets = [];
  const join = async (token, studentId) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/rtc?_auth=${encodeURIComponent(token.slice(7))}`);
    sockets.push(ws);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Join timeout')), 4000);
      ws.on('message', raw => { const data = JSON.parse(String(raw)); if (data.type === 'joined') { clearTimeout(timer); resolve(); } });
      ws.send(JSON.stringify({ type: 'join', roomId: `rtc:teacher-a:${studentId}` }));
    });
    return ws;
  };
  const leave = async ws => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Leave timeout')), 4000);
    ws.on('message', raw => { if (JSON.parse(String(raw)).type === 'left') { clearTimeout(timer); resolve(); } });
    ws.send(JSON.stringify({ type: 'leave', endRecording: true }));
  });
  const pending = token => request('/api/learning-lesson-feedback/pending', token);
  try {
    start(); await ready();
    const login = async code => `Bearer ${(await request('/api/login', '', 'POST', { code })).token}`;
    const teacher = await login('teacher-a-code'), otherTeacher = await login('teacher-b-code');
    const a = await login('a-code'), b = await login('b-code'), short = await login('short-code'), absent = await login('absent-code');
    assert.equal((await pending(absent)).lesson, null, 'calendar-only missed lesson has no survey');
    const obs = await login('obs-code'), failed = await login('failed-code'), telemost = await login('telemost-code');
    assert.equal((await pending(obs)).lesson.kind, 'individual', 'finished OBS metadata is enough before upload completes');
    assert.equal((await request('/api/lesson-pace/students/obs', teacher)).lessons.length, 1, 'recovery recording fragments share one survey');
    assert.equal((await pending(failed)).lesson, null, 'failed recording startup alone does not prove a conducted lesson');
    const foreign = (await pending(b)).lesson;
    assert.equal(foreign.kind, 'individual');
    await request(`/api/individual-lessons/${encodeURIComponent(foreign.id)}/pace`, a, 'PUT', { value: 50 }, 403);
    await request('/api/lesson-pace/students/b', teacher, 'GET', undefined, 404);
    await request('/api/lesson-pace/students', a, 'GET', undefined, 403);
    assert.equal((await request('/api/lesson-pace/students', otherTeacher)).students.length, 1);

    const teacherWs = await join(teacher, 'a'), studentWs = await join(a, 'a');
    for (let i = 0; i < 50; i++) {
      if (Object.values(JSON.parse(fs.readFileSync(store.file)).lessons).some(row => row.studentId === 'a')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(Object.values(JSON.parse(fs.readFileSync(store.file)).lessons).some(row => row.studentId === 'a'), 'real call is tracked without OBS');
    advance(120_000); assert.equal((await pending(a)).lesson, null, 'survey stays hidden during call');
    await leave(studentWs); assert.equal((await pending(a)).lesson, null);
    advance(120_000); const resumed = await join(a, 'a');
    assert.equal((await pending(a)).lesson, null, 'reconnection cancels pending disconnect');
    advance(60_000); await leave(teacherWs);
    const lesson = (await pending(a)).lesson;
    assert.equal(lesson.kind, 'individual');
    const unchanged = fs.readFileSync(path.join(dataDir, 'progress.json'));
    await request(`/api/individual-lessons/${encodeURIComponent(lesson.id)}/pace`, a, 'PUT', { value: 20, studentId: 'b' });
    assert.equal((await pending(a)).lesson, null);
    const history = await request('/api/lesson-pace/students/a', teacher);
    assert.equal(history.lessons[0].feedback.value, 20);
    assert.equal(history.lessons[0].kind, 'individual');
    assert.equal((await request('/api/lesson-pace/students', teacher)).students.find(row => row.studentId === 'a').latest.feedback.value, 20);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'progress.json')), unchanged, 'Pace answers never change homework or learning progress');
    assert.deepEqual((await request('/api/lesson-pace/students', otherTeacher)).students.map(row => row.studentId), ['b']);
    await leave(resumed);

    const activity = (await request('/api/telemost/activate', teacher, 'POST', { studentId: 'telemost' })).activity;
    assert.ok(activity.active); advance(60_000); assert.equal((await pending(telemost)).lesson, null);
    await request('/api/lesson-replay/lesson/finish', teacher, 'POST', { studentId: 'telemost', occurrenceKey: activity.occurrenceKey });
    assert.equal((await pending(telemost)).lesson.kind, 'individual', 'explicit Telemost finish requests feedback without OBS');

    const shortTeacher = await join(teacher, 'short'); await join(short, 'short');
    await new Promise(resolve => setTimeout(resolve, 150)); advance(20_000); await leave(shortTeacher);
    advance(10 * 60_000); assert.equal((await pending(short)).lesson, null, 'short microphone test does not prompt later');
    const feedbackBytes = fs.readFileSync(path.join(dataDir, 'lesson-pace.json'));
    sockets.forEach(ws => ws.terminate()); await stop(); start(); await ready();
    assert.equal((await pending(a)).lesson, null, 'saved answer survives real server restart');
    assert.equal((await request('/api/lesson-pace/students/a', teacher)).lessons[0].feedback.value, 20);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'lesson-pace.json')), feedbackBytes, 'read-only teacher routes never modify answers');
    if (process.env.PACE_QA_SERVE === '1') {
      console.log(JSON.stringify({ base: `http://127.0.0.1:${port}`, root, clock }));
      await new Promise(() => {});
    }
  } finally {
    sockets.forEach(ws => ws.terminate()); await stop();
    if (process.env.PACE_QA_SERVE !== '1') fs.rmSync(root, { recursive: true, force: true });
  }
});
