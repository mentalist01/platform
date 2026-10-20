import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

test('an ongoing recorder follows Google start/end edits without browser heartbeats or a second file', { timeout: 75000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-calendar-live-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const now = Date.now(), oldStart = Math.floor((now - 30 * 60000) / 60000) * 60000, oldEnd = oldStart + 3600_000;
  let start = oldStart, end = oldEnd, calendarReads = 0;
  const icalDate = value => new Date(value).toISOString().replaceAll(/[-:]/g, '').replace('.000', '');
  const calendar = http.createServer((_req, res) => {
    calendarReads++; res.setHeader('Content-Type', 'text/calendar');
    res.end(['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:live-lesson', `DTSTAMP:${icalDate(now)}`,
      `DTSTART:${icalDate(start)}`, `DTEND:${icalDate(end)}`, 'SUMMARY:Student A', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n'));
  });
  calendar.listen(0, '127.0.0.1'); await once(calendar, 'listening');
  const createdAt = new Date(now - 86400000).toISOString();
  write('teachers', [{ id: 't', name: 'Teacher', createdAt }]);
  write('students', [{ id: 'p', name: 'Student A', teacherId: 't', createdAt, telemostUrl: 'https://telemost.yandex.ru/j/fixture' }]);
  write('auth-sessions', [{ token: 'fixture-teacher', user: { id: 't', name: 'Teacher', role: 'teacher' }, createdAtMs: now, expiresAtMs: now + 3600_000 }]);
  write('progress', { p: { schedule: [], homeworks: [] } }); write('tests', {}); write('mock-exams', []);
  write('teacher-calendar-sync', { t: { enabled: true, icalUrl: `http://127.0.0.1:${calendar.address().port}/calendar.ics`, updatedAt: createdAt } });
  const reserve = net.createServer().listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
      PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', bytes => { logs += bytes; }); child.stderr.on('data', bytes => { logs += bytes; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    calendar.closeAllConnections(); await new Promise(resolve => calendar.close(resolve));
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('recording-calendar-live-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const req = async (route, body, token = 'fixture-teacher', method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`http://127.0.0.1:${port}/api${route}`, { method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
    const result = await response.json(); assert.equal(response.status, 200, `${route}: ${JSON.stringify(result)}\n${logs.slice(-2000)}`); return result;
  };
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw Error(logs);
    try { await req('/session'); break; } catch { if (attempt === 149) throw Error(logs); await delay(100); }
  }
  const pair = await req('/desktop-recording/pair', {});
  const { token } = await req('/desktop-recorder/pair', { code: pair.code, name: 'Fixture' });
  await req('/desktop-recorder/poll', { ready: true }, token);
  await req('/desktop-recording/settings', { enabled: true }, 'fixture-teacher', 'PUT');
  await req('/telemost/activate', { studentId: 'p' });
  const original = await req('/desktop-recording/start', { studentId: 'p', audioMode: 'telemost' });
  assert.equal(original.cutoffAt, oldEnd);
  await req(`/desktop-recorder/jobs/${original.id}`, { status: 'recording' }, token);
  await req('/desktop-recorder/poll', { ready: true }, token);
  const readsBefore = calendarReads;
  // No platform start/refresh requests: device polling must fetch the changed
  // Google timetable itself instead of using the normal five-minute cache.
  start += 20 * 60000; end += 20 * 60000;
  await delay(30500);
  let polled = await req('/desktop-recorder/poll', { ready: true }, token);
  let job = polled.jobs.find(entry => entry.id === original.id);
  assert.equal(job.cutoffAt, end); assert.equal(job.occurrence.startMs, start);
  assert.equal(job.occurrence.key, original.occurrence.key); assert.equal(job.desired, 'record');
  assert.equal(polled.currentLesson.id, original.id);
  assert.ok(calendarReads > readsBefore, 'The active recorder revalidates the external calendar');
  const steadyReads = calendarReads;
  for (let attempt = 0; attempt < 3; attempt++) await req('/desktop-recorder/poll', { ready: true }, token);
  assert.equal(calendarReads, steadyReads, 'Fast local polls must not repeatedly download the calendar');
  assert.equal((await req('/desktop-recording/start', { studentId: 'p', audioMode: 'telemost' })).id, original.id);
  // A shorter edited lesson also applies as soon as the platform imports it.
  start = oldStart - 5 * 60000; end = oldEnd - 10 * 60000;
  await req('/teacher-calendar-sync/refresh', { force: true });
  polled = await req('/desktop-recorder/poll', { ready: true }, token); job = polled.jobs.find(entry => entry.id === original.id);
  assert.equal(job.cutoffAt, end); assert.equal(job.occurrence.startMs, start);
  assert.equal((await req('/desktop-recording/start', { studentId: 'p' })).id, original.id);
  const disk = JSON.parse(fs.readFileSync(path.join(data, 'desktop-recordings.json'), 'utf8'));
  assert.equal(Object.keys(disk.jobs).length, 1);
  await req('/desktop-recording/stop', { id: original.id, endRecording: true });
  assert.equal((await req('/desktop-recorder/poll', { ready: true }, token)).jobs.find(entry => entry.id === original.id).desired, 'stop');
});
