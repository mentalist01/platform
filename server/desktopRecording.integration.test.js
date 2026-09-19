import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

test('real platform routes isolate devices and expose one group recording to its participants', { timeout: 60000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-platform-integration-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const now = Date.now(); const old = new Date(now - 86400000).toISOString();
  write('teachers', [{ id: 't1', name: 'Test teacher' }, { id: 't2', name: 'Other teacher' }]);
  write('students', ['s1', 's2', 'outside'].map(id => ({ id, name: id, teacherId: 't1', createdAt: old })));
  write('auth-sessions', ['t1', 't2', 's1', 's2', 'outside'].map(id => ({
    token: `fixture-${id}`, user: { id, name: id, role: id.startsWith('t') ? 'teacher' : 'student', teacherId: 't1' },
    createdAtMs: now, expiresAtMs: now + 3600000,
  })));
  write('learning-groups', [{ id: 'g1', name: 'Test group', teacherId: 't1', startedAt: old, createdAt: old,
    members: ['s1', 's2'].map(studentId => ({ studentId, joinedAt: old, status: 'active' })) }]);
  write('learning-lesson-sessions', [{ id: 'lesson1', groupId: 'g1', teacherId: 't1', participantIds: ['s1', 's2'],
    startAt: new Date(now - 61 * 60000).toISOString(), durationMinutes: 60, status: 'active', createdAt: old }]);
  const reserve = net.createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
      PLATFORM_COLLAB_DIR: path.join(root, 'collab'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), ADMIN_CODE: 'fixture-admin-only' },
  });
  let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    // This is the unique fixture directory created above, never platform data.
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request = async (route, { actor = 't1', body, method, token, status = 200 } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${route}`, { method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || `fixture-${actor}`}` },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
    const value = await r.json(); assert.equal(r.status, status, `${route}: ${JSON.stringify(value)}`); return value;
  };
  let started = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Fixture server exited: ${logs}`);
    try { await request('/session'); started = true; break; } catch { await delay(200); }
  }
  assert.ok(started, `Fixture server did not start: ${logs}`);
  await request('/desktop-recording/pair', { actor: 's1', body: {}, status: 403 });
  const { code } = await request('/desktop-recording/pair', { body: {} });
  const { token } = await request('/desktop-recorder/pair', { body: { code, name: 'Fixture PC' } });
  await request('/desktop-recorder/poll', { token, body: { ready: true } });
  await request('/session', { token, status: 401 });
  await request('/desktop-recording/settings', { method: 'PUT', body: { enabled: true } });
  const legacy = await request('/lesson-replay/session', { actor: 's1', body: { learningLessonId: 'lesson1' }, status: 409 });
  assert.equal(legacy.code, 'DESKTOP_RECORDING_ENABLED');
  await request('/desktop-recording/start', { actor: 't2', body: { learningLessonId: 'lesson1' }, status: 403 });
  const job = await request('/desktop-recording/start', { body: { learningLessonId: 'lesson1' } });
  assert.equal((await request('/desktop-recording/start', { body: { learningLessonId: 'lesson1' } })).id, job.id);
  await request(`/desktop-recorder/jobs/${job.id}`, { token, body: { status: 'recording' } });
  await request('/learning-groups/g1/lessons/lesson1', { method: 'PATCH', body: { status: 'completed' } });
  assert.equal((await request('/desktop-recorder/poll', { token, body: { ready: true } })).jobs[0].desired, 'stop');
  await request(`/desktop-recorder/jobs/${job.id}`, { token, body: { status: 'saved' } });
  const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Fixture_Key';
  await request(`/desktop-recorder/jobs/${job.id}`, { token, body: { status: 'ready', url } });
  for (const actor of ['s1', 's2']) {
    const history = await request(`/lesson-history?studentId=${actor}`, { actor });
    const lesson = history.items.find(item => item.lessonId === 'lesson1');
    assert.ok(lesson, `Missing group lesson for ${actor}: ${JSON.stringify(history)}`);
    const detail = await request(`/lesson-history/detail?studentId=${actor}&occurrenceKey=${encodeURIComponent(lesson.key)}`, { actor });
    assert.equal(detail.replay.provider, 'rutube'); assert.equal(detail.replay.available, true);
    assert.equal(detail.replay.video.url, url);
    await request(`/lesson-history/detail?studentId=${actor}&occurrenceKey=${encodeURIComponent(lesson.key)}`, { actor: 'outside', status: 404 });
  }
});
