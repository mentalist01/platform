import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

import {
  addLearningGroupMember,
  createLearningGroup,
  createLearningLessonSession,
  startLearningGroup,
} from './learningGroups.js';

const workspaceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address()?.port;
    probe.close((error) => error ? reject(error) : resolve(port));
  });
});

const requestJson = async (baseUrl, pathname, { token = '', method = 'GET', body, status = 200 } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${pathname}: ${text}`);
  return text ? JSON.parse(text) : null;
};

const openSocket = (url) => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const closeSocket = (socket) => new Promise((resolve) => {
  if (!socket || socket.readyState === WebSocket.CLOSED) return resolve();
  socket.once('close', resolve);
  socket.close();
});

test('private boards, code and answer chat isolate students; legacy recording is disabled', { timeout: 30_000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-private-collab-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  const now = new Date().toISOString();
  const teacher = { id: 'teacher-a', name: 'Иван', code: '710001', createdAt: now };
  const students = [
    { id: 'student-a', name: 'Анна', teacherId: teacher.id, code: '710101', grade: '11', createdAt: now, deletedAt: null },
    { id: 'student-b', name: 'Илья', teacherId: teacher.id, code: '710102', grade: '11', createdAt: now, deletedAt: null },
  ];
  let group = createLearningGroup({ name: 'Тестовая группа', maxStudents: 3 }, { id: 'group-a', teacherId: teacher.id, now });
  group = addLearningGroupMember(group, students[0], { actorId: teacher.id, now });
  group = addLearningGroupMember(group, students[1], { actorId: teacher.id, now });
  group = startLearningGroup(group, { now });
  const lesson = createLearningLessonSession(group, {
    startAt: new Date(Date.now() - 60_000).toISOString(),
    durationMinutes: 60,
    topic: 'Тест приватности',
  }, { id: 'lesson-a', now });
  lesson.status = 'active';

  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  write('teachers.json', [teacher]);
  write('students.json', students);
  write('progress.json', Object.fromEntries(students.map((student) => [student.id, { schedule: [], homeworks: [], mockAttempts: {} }])));
  write('tests.json', {});
  write('mock-exams.json', []);
  write('learning-groups.json', [group]);
  write('learning-lesson-sessions.json', [lesson]);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      LEGACY_LESSON_RECORDING_ENABLED: '0',
      PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: uploadsDir,
      COLLAB_PERSISTENCE: '0',
      DISABLE_STARTUP_XP_REBALANCE: '1',
      LEARNING_GROUPS_ENABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${baseUrl}/api/client-build-version`)).ok) break;
      } catch { /* server is still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(child.exitCode, null, logs);
    const teacherLogin = await requestJson(baseUrl, '/api/login', { method: 'POST', body: { code: teacher.code } });
    const annaLogin = await requestJson(baseUrl, '/api/login', { method: 'POST', body: { code: students[0].code } });
    const ilyaLogin = await requestJson(baseUrl, '/api/login', { method: 'POST', body: { code: students[1].code } });

    const settings = await requestJson(baseUrl, '/api/desktop-recording/settings', { token: teacherLogin.token });
    assert.equal(settings.legacyRecordingEnabled, false);
    for (const route of ['session', 'events', 'snapshot', 'audio/prepare', 'audio/upload/old', 'audio/complete', 'finish', 'switch']) {
      const result = await requestJson(baseUrl, `/api/lesson-replay/${route}`, {
        token: teacherLogin.token, method: 'POST', body: {}, status: 410,
      });
      assert.equal(result.code, 'LEGACY_RECORDING_DISABLED');
    }

    const socketBase = baseUrl.replace(/^http/, 'ws');
    for (const kind of ['collab', 'board']) {
    const room = (studentId) => encodeURIComponent(`${kind}-lesson-${lesson.id}~student~${studentId}`);
    const teacherAnna = await openSocket(`${socketBase}/collab/${room('student-a')}?_auth=${teacherLogin.token}`);
    const teacherIlya = await openSocket(`${socketBase}/collab/${room('student-b')}?_auth=${teacherLogin.token}`);
    const annaOwn = await openSocket(`${socketBase}/collab/${room('student-a')}?_auth=${annaLogin.token}`);
    await assert.rejects(openSocket(`${socketBase}/collab/${room('student-b')}?_auth=${annaLogin.token}`), /403/);
    await assert.rejects(openSocket(`${socketBase}/collab/${room('student-a')}?_auth=${ilyaLogin.token}`), /403/);
    await Promise.all([closeSocket(teacherAnna), closeSocket(teacherIlya), closeSocket(annaOwn)]);
    }

    const connections = [];
    const connectBoard = async (studentId, token) => {
      const doc = new Y.Doc();
      const room = `board-lesson-${lesson.id}${studentId ? `~student~${studentId}` : ''}`;
      const provider = new WebsocketProvider(`${socketBase}/collab`, room, doc, {
        WebSocketPolyfill: WebSocket, params: { _auth: token }, disableBc: true,
      });
      connections.push({ provider, doc });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Board sync timed out')), 5000);
        provider.on('sync', (synced) => { if (synced) { clearTimeout(timeout); resolve(); } });
      });
      return doc.getArray('items');
    };
    try {
      const annaTeacherBoard = await connectBoard('student-a', teacherLogin.token);
      annaTeacherBoard.push([{ id: 'stroke-a', type: 'stroke', points: [{ x: 1, y: 2 }] }]);
      const deadline = Date.now() + 5000;
      const annaBoard = await connectBoard('student-a', annaLogin.token);
      while (!annaBoard.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(annaBoard.get(0)?.id, 'stroke-a');
      const ilyaBoard = await connectBoard('student-b', ilyaLogin.token);
      const commonBoard = await connectBoard('', teacherLogin.token);
      assert.equal(ilyaBoard.length, 0);
      assert.equal(commonBoard.length, 0);
      const reopened = await connectBoard('student-a', teacherLogin.token);
      assert.equal(reopened.get(0)?.id, 'stroke-a', 'Tab switches preserve private board data');
    } finally {
      for (const { provider, doc } of connections) { provider.destroy(); doc.destroy(); }
    }

    const chatPath = `/api/learning-groups/${group.id}/lessons/${lesson.id}/answer-chat`;
    await requestJson(baseUrl, chatPath, { token: teacherLogin.token, method: 'POST', status: 201, body: { text: 'Пишите ответ' } });
    await requestJson(baseUrl, chatPath, { token: annaLogin.token, method: 'POST', status: 201, body: { text: '42' } });
    await requestJson(baseUrl, chatPath, { token: ilyaLogin.token, method: 'POST', status: 201, body: { text: '43' } });
    const annaChat = await requestJson(baseUrl, chatPath, { token: annaLogin.token });
    const ilyaChat = await requestJson(baseUrl, chatPath, { token: ilyaLogin.token });
    const teacherChat = await requestJson(baseUrl, chatPath, { token: teacherLogin.token });
    assert.deepEqual(annaChat.messages.map(({ text }) => text), ['Пишите ответ', '42']);
    assert.deepEqual(ilyaChat.messages.map(({ text }) => text), ['Пишите ответ', '43']);
    assert.deepEqual(teacherChat.messages.map(({ text }) => text), ['Пишите ответ', '42', '43']);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
