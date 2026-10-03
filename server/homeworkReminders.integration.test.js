import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { HomeworkReminderStore } from './homeworkReminders.js';

test('real teacher API scopes reminders, persists answers and detects individual/group homework and calls', { timeout: 45_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-homework-integration-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const now = Date.now();
  const hash = code => `scrypt$reminder-test$${crypto.scryptSync(code, 'reminder-test', 64).toString('base64')}`;
  write('teachers', ['a', 'b'].map(id => ({ id: `teacher-${id}`, name: id, codeHash: hash(`teacher-${id}-code`), createdAt: new Date(now).toISOString() })));
  write('students', ['a', 'group', 'b', 'call'].map(id => ({ id, teacherId: id === 'b' ? 'teacher-b' : 'teacher-a', name: id, code: `${id}-code`, grade: '11', createdAt: new Date(now).toISOString() })));
  write('tests', {});
  write('progress', { a: { homeworks: [{ id: 'old', issuedAt: new Date(now - 7200_000).toISOString(), homeWork: 'Старая домашка' }] } });
  write('learning-groups', [{ id: 'group', teacherId: 'teacher-a', name: 'Группа 2', startedAt: new Date(now - 86_400_000).toISOString(), members: ['a', 'group'].map(studentId => ({ studentId, status: 'active' })) }]);
  const store = new HomeworkReminderStore(path.join(dataDir, 'homework-reminders.json'), { now: () => now - 7200_000 });
  const occurrence = (id, extra = {}) => ({ key: `${id}:lesson`, studentId: id, dayKey: '2026-10-03', time: '13:00', ...extra });
  for (const [teacherId, target] of [
    ['teacher-a', occurrence('a')], ['teacher-b', occurrence('b')],
    ['teacher-a', occurrence('', { key: 'group:lesson', groupId: 'group', lessonId: 'group-lesson', participantIds: ['a', 'group'] })],
  ]) store.observeLesson(teacherId, target, now - 3600_000, now - 180_000);
  const port = await new Promise(resolve => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(() => resolve(value)); }); });
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  const sockets = [];
  const request = (url, token = '', method = 'GET', body) => fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { Authorization: token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async (response, status = 200) => { const payload = await response.json(); assert.equal(response.status, status, JSON.stringify(payload)); return payload; };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150 && child.exitCode === null; attempt++) {
      try { if ((await request('/api/client-build-version')).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const login = async code => `Bearer ${(await json(await request('/api/login', '', 'POST', { code }))).token}`;
    const teacher = await login('teacher-a-code'); const other = await login('teacher-b-code'); const student = await login('a-code');
    const list = token => request('/api/teacher-homework-reminders', token).then(json).then(payload => payload.reminders);
    assert.equal((await request('/api/teacher-homework-reminders', student)).status, 403);
    const pending = await list(teacher);
    assert.equal(pending.length, 2);
    assert.equal(pending.find(entry => entry.groupId).name, 'Группа 2');
    assert.equal((await list(other)).length, 1);
    const individual = pending.find(entry => entry.studentId === 'a');
    assert.equal((await request(`/api/teacher-homework-reminders/${individual.id}/dismiss`, other, 'POST')).status, 404);
    await json(await request('/api/student-next-lesson', teacher, 'PATCH', { studentId: 'a', homeWork: 'Решить новую задачу', daysToComplete: 7 }));
    assert.equal((await list(teacher)).length, 1);
    await json(await request('/api/learning-groups/group/assignments', teacher, 'POST', { title: 'Новая домашка', content: 'Решить задачи', recipientMode: 'all' }), 201);
    assert.deepEqual(await list(teacher), []);
    const ownOther = (await list(other))[0];
    await json(await request(`/api/teacher-homework-reminders/${ownOther.id}/dismiss`, other, 'POST'));
    assert.deepEqual(await list(other), []);
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'homework-reminders.json')));
    assert.ok(saved.lessons[ownOther.id].dismissedAt);
    // This call is tracked even when neither OBS nor legacy replay recording is enabled.
    const pupil = await login('call-code');
    for (const token of [teacher, pupil]) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/rtc?_auth=${encodeURIComponent(token.slice(7))}`);
      sockets.push(ws);
      await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
      const joined = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('RTC join timeout')), 4000);
        ws.on('message', data => { const message = JSON.parse(String(data)); if (message.type === 'joined') { clearTimeout(timer); resolve(); } });
      });
      ws.send(JSON.stringify({ type: 'join', roomId: 'rtc:teacher-a:call' })); await joined;
    }
    let tracked = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const savedCalls = JSON.parse(fs.readFileSync(path.join(dataDir, 'homework-reminders.json')));
      if (Object.values(savedCalls.lessons).some(entry => entry.studentId === 'call' && entry.teacherId === 'teacher-a')) { tracked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(tracked, `Call tracking unavailable: ${logs}`);
    assert.deepEqual(await list(teacher), [], 'ongoing call does not produce a reminder');
  } finally {
    sockets.forEach(ws => ws.terminate());
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    if (path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(root, { recursive: true, force: true });
  }
});
