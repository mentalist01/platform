import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '..');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => (error ? reject(error) : resolve(port)));
  });
});

const waitForServer = async (baseUrl, child, getLogs) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before startup.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The socket is expected to refuse connections while the server boots.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start in time.\n${getLogs()}`);
};

const stopServer = async (child) => {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const jsonRequest = async (baseUrl, pathname, options = {}) => {
  const method = options.method || 'GET';
  const headers = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (Object.prototype.hasOwnProperty.call(options, 'body')) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(Object.prototype.hasOwnProperty.call(options, 'body')
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const rawBody = await response.text();
  const expectedStatus = options.status ?? 200;
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${pathname} returned ${response.status}.\n${rawBody}`
  );
  return rawBody ? JSON.parse(rawBody) : null;
};

const login = async (baseUrl, code) => (
  jsonRequest(baseUrl, '/api/login', {
    method: 'POST',
    body: { code },
  })
);

const waitForValue = async (probe, message, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
};

const openWebSocket = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.once('open', () => resolve(ws));
  ws.once('error', reject);
});

const closeWebSocket = (ws) => new Promise((resolve) => {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    resolve();
    return;
  }
  ws.once('close', resolve);
  ws.close();
});

test('voice channels isolate signaling, switch safely and preserve all 20 students', { timeout: 90_000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-voice-channels-'));
  const dataDir = path.join(tempRoot, 'data');
  fs.mkdirSync(dataDir);
  const now = new Date(Date.now() - 60_000).toISOString();
  const seed = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  seed('teachers.json', [{ id: 'teacher-a', name: 'Teacher A', code: '110001', createdAt: now }, { id: 'teacher-b', name: 'Teacher B', code: '110002', createdAt: now }]);
  seed('students.json', Array.from({ length: 21 }, (_, i) => ({
    id: `student-${i + 1}`, name: `Student ${i + 1}`, nickname: `Nickname ${i + 1}`, teacherId: 'teacher-a',
    code: String(110101 + i), createdAt: now, deletedAt: null,
  })));
  seed('progress.json', {});
  seed('tests.json', {});
  seed('mock-exams.json', []);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceDir,
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: path.join(tempRoot, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'backups'),
      COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1', LEARNING_GROUP_RTC_ENABLED: '1',
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const sockets = [];
  const open = async (token) => {
    const ws = await openWebSocket(`ws://127.0.0.1:${port}/rtc?_auth=${encodeURIComponent(token)}`);
    sockets.push(ws);
    const inbox = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
    return {
      ws, inbox,
      send: (value) => ws.send(JSON.stringify(value)),
      take: (type) => waitForValue(() => {
        const index = inbox.findIndex((message) => message.type === type);
        return index < 0 ? null : inbox.splice(index, 1)[0];
      }, `Missing ${type}`),
    };
  };
  try {
    await waitForServer(baseUrl, child, () => logs);
    const teacher = await login(baseUrl, '110001');
    const otherTeacher = await login(baseUrl, '110002');
    const first = await login(baseUrl, '110101');
    const second = await login(baseUrl, '110102');
    const outsider = await login(baseUrl, '110121');
    const request = (pathname, options = {}) => jsonRequest(baseUrl, pathname, { token: teacher.token, ...options });
    const { group } = await request('/api/learning-groups', { method: 'POST', status: 201, body: { name: 'Практика', maxStudents: 20 } });
    const root = `/api/learning-groups/${group.id}`;
    for (let index = 1; index <= 20; index += 1) {
      await request(`${root}/members`, { method: 'POST', body: { studentId: `student-${index}` } });
    }
    await request(`${root}/start`, { method: 'POST', body: {} });
    const { lesson } = await request(`${root}/lessons`, { method: 'POST', status: 201, body: { startAt: now, durationMinutes: 60, topic: 'Таблицы' } });
    assert.equal(lesson.participantIds.length, 20);
    const url = `${root}/lessons/${lesson.id}/voice-channels`;
    const initial = await request(url);
    assert.equal(initial.channels.length, 21);
    assert.equal(initial.canJoin, true);
    assert.equal(initial.lessonStatus, 'scheduled');
    assert.equal(initial.canStartLesson, true);
    assert.equal((await request(url, { token: first.token })).canStartLesson, false);
    assert.equal(initial.channels[0].name, 'Общий канал');
    assert.equal(initial.channels[1].name, 'Student 1');
    const renameUrl = `${url}/${initial.channels[1].id}`;
    await request(renameUrl, { method: 'PATCH', token: first.token, status: 403, body: { name: 'No' } });
    await request(renameUrl, { method: 'PATCH', token: otherTeacher.token, status: 403, body: { name: 'No' } });
    await request(renameUrl, { method: 'PATCH', status: 400, body: { name: '  ' } });
    await request(`${url}/unknown`, { method: 'PATCH', status: 404, body: { name: 'No' } });
    await request(renameUrl, { method: 'PATCH', status: 409, body: { name: 'Общий канал' } });
    const renamed = await request(renameUrl, { method: 'PATCH', body: { name: 'Анна — практика' } });
    assert.equal(renamed.channel.roomId, initial.channels[1].roomId);
    assert.equal((await request(url, { token: first.token })).channels[1].name, 'Анна — практика');
    await request(url, { token: outsider.token, status: 403 });
    await request(url, { token: first.token, method: 'POST', status: 403, body: { name: 'Не разрешено' } });
    await request(url, { method: 'POST', status: 400, body: { name: '  ' } });
    await request(url, { method: 'POST', status: 201, body: { name: 'Работа в паре' } });
    await request(url, { method: 'POST', status: 409, body: { name: 'Работа в паре' } });
    await request(root, { method: 'PATCH', body: { name: 'Практика — обновлено' } });
    assert.equal((await request(url)).channels.at(-1).name, 'Работа в паре');
    const otherLesson = await request(`${root}/lessons`, { method: 'POST', status: 201, body: { startAt: now, durationMinutes: 60 } });
    const otherChannels = await request(`${root}/lessons/${otherLesson.lesson.id}/voice-channels`);
    assert.equal(otherChannels.channels.at(-1).name, 'Работа в паре');
    assert.equal(otherChannels.channels[1].name, 'Анна — практика');
    await request(renameUrl, { method: 'PATCH', body: { reset: true } });
    assert.equal((await request(url)).channels[1].name, 'Student 1');
    assert.notEqual(otherChannels.channels.at(-1).roomId, (await request(url)).channels.at(-1).roomId);

    const a = await open(first.token);
    const b = await open(second.token);
    const t = await open(teacher.token);
    const x = await open(outsider.token);
    const general = initial.channels[0].roomId;
    const separate = initial.channels[1].roomId;
    a.send({ type: 'join', roomId: general });
    const joinedA = await a.take('joined');
    assert.equal(joinedA.peers.length, 0);
    b.send({ type: 'join', roomId: separate });
    assert.equal((await b.take('joined')).peers.length, 0);
    const eventInOtherChannel = await waitForValue(() => a.inbox.find(message => message.type === 'voice-channel-presence' && message.roomId === separate));
    assert.deepEqual(eventInOtherChannel.participants.map(peer => peer.userId), ['student-2']);
    assert.equal(x.inbox.some(message => message.type === 'voice-channel-presence'), false);
    t.send({ type: 'join', roomId: general });
    const joinedT = await t.take('joined');
    assert.deepEqual(joinedT.peers.map((peer) => peer.userId), ['student-1']);
    a.send({ type: 'signal', targetId: joinedT.selfId, signal: { description: { type: 'offer', sdp: 'within-channel' } } });
    assert.equal((await t.take('signal')).signal.description.sdp, 'within-channel');
    b.send({ type: 'signal', targetId: joinedT.selfId, signal: { description: { type: 'offer', sdp: 'cross-channel' } } });
    await b.take('error');
    assert.equal(t.inbox.some((message) => message.type === 'signal'), false);
    x.send({ type: 'join', roomId: separate });
    await x.take('error');
    b.send({ type: 'join', roomId: `${general}:channel:custom-does-not-exist` });
    await b.take('error');

    t.send({ type: 'join', roomId: separate });
    assert.deepEqual((await t.take('joined')).peers.map((peer) => peer.userId), ['student-2']);
    assert.equal((await a.take('peer-left')).peerId, joinedT.selfId);
    const livePresence = await waitForValue(() => a.inbox.findLast(message => message.type === 'voice-channel-presence' && message.roomId === separate && message.participants.length === 2));
    assert.deepEqual(livePresence.participants.map(peer => peer.userId).sort(), ['student-2', 'teacher-a']);
    const presence = await request(url, { token: first.token });
    assert.deepEqual(presence.channels[0].participants.map((peer) => peer.userId), ['student-1']);
    assert.deepEqual(presence.channels[1].participants.map((peer) => peer.userId).sort(), ['student-2', 'teacher-a']);

    const t2 = await open(teacher.token);
    t2.send({ type: 'join', roomId: general });
    await t2.take('joined');
    await t.take('session-ended');
    assert.equal((await request(url)).channels[1].participants.length, 1);
    await request(`${url}/gather`, { token: first.token, method: 'POST', status: 403, body: {} });
    await request(`${url}/distribute`, { token: first.token, method: 'POST', status: 403, body: {} });
    const distributed = await request(`${url}/distribute`, { method: 'POST', body: {} });
    assert.equal(distributed.movedCount, 2);
    const moveA = await a.take('channel-move');
    const moveB = await b.take('channel-move');
    assert.equal(moveA.channelId, initial.channels[1].id);
    assert.equal(moveB.channelId, initial.channels[2].id);
    assert.equal((await request(url)).channels[0].participants.length, 1); // teacher stays
    a.send({ type: 'signal', targetId: joinedT.selfId, signal: { description: { type: 'offer', sdp: 'after-move' } } });
    await a.take('error'); // no old-room signaling while the browser switches
    a.send({ type: 'join', roomId: initial.channels[1].roomId }); await a.take('joined');
    b.send({ type: 'join', roomId: initial.channels[2].roomId }); await b.take('joined');
    const gathered = await request(`${url}/gather`, { method: 'POST', body: {} });
    assert.equal(gathered.movedCount, 2);
    assert.equal((await a.take('channel-move')).channelId, 'general');
    assert.equal((await b.take('channel-move')).channelId, 'general');
    a.send({ type: 'join', roomId: general }); await a.take('joined');
    b.send({ type: 'join', roomId: general }); await b.take('joined');
    assert.equal((await request(`${url}/gather`, { method: 'POST', body: {} })).movedCount, 0);
    b.send({ type: 'leave' });
    await b.take('left');
    assert.equal((await request(url)).channels[1].participants.length, 0);

    b.send({ type: 'join', roomId: separate });
    await b.take('joined');
    await request(`${root}/members/student-2`, { method: 'DELETE' });
    await b.take('session-ended');
    b.send({ type: 'join', roomId: separate });
    await b.take('error');

    const futureLesson = await request(`${root}/lessons`, { method: 'POST', status: 201, body: { startAt: new Date(Date.now() + 60 * 60_000).toISOString(), durationMinutes: 60 } });
    const futureChannels = await request(`${root}/lessons/${futureLesson.lesson.id}/voice-channels`);
    assert.equal(futureChannels.canJoin, true);
    assert.equal(futureChannels.lessonStatus, 'scheduled');
    assert.equal(futureChannels.canStartLesson, false);
    assert.equal((await request(`${root}/lessons/${futureLesson.lesson.id}/voice-channels`, { token: first.token })).canJoin, true);
    t.send({ type: 'join', roomId: futureChannels.channels[0].roomId });
    await t.take('joined');
    const earlyStudent = await open(first.token);
    earlyStudent.send({ type: 'join', roomId: futureChannels.channels[0].roomId });
    await earlyStudent.take('joined');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'learning-lesson-sessions.json'), 'utf8'))
      .find(entry => entry.id === futureLesson.lesson.id).status, 'scheduled');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'learning-attendance.json'), 'utf8'))
      .some(entry => entry.sessionId === futureLesson.lesson.id
        && (entry.firstJoinedAt || entry.activeConnectionIds?.length || entry.presentSeconds)), false);
    const futureUrl = `${root}/lessons/${futureLesson.lesson.id}/voice-channels`;
    assert.equal((await request(`${futureUrl}/distribute`, { method: 'POST', body: {} })).movedCount, 1);
    await earlyStudent.take('channel-move');
    earlyStudent.send({ type: 'join', roomId: futureChannels.channels[1].roomId });
    await earlyStudent.take('joined');
    await request(`${root}/lessons/${futureLesson.lesson.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
    await earlyStudent.take('session-ended');
    await t.take('session-ended');
    assert.equal((await request(futureUrl)).canJoin, false);

    await request(`${root}/lessons/${lesson.id}`, { method: 'PATCH', body: { status: 'completed' } });
    await a.take('session-ended');
    await t2.take('session-ended');
    const closed = await request(url);
    assert.equal(closed.canJoin, false);
    assert.equal(closed.channels.every((channel) => channel.participants.length === 0), true);
    a.send({ type: 'join', roomId: separate });
    await a.take('error');
  } finally {
    await Promise.all(sockets.map(closeWebSocket));
    await stopServer(child);
    const resolved = path.resolve(tempRoot);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
