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


test('cross-group listeners receive media only and do not join billing or attendance', { timeout: 60000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'group-library-'));
  const dataDir = path.join(tempRoot, 'data'); fs.mkdirSync(dataDir);
  const seed = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const now = new Date(Date.now() - 60000).toISOString();
  seed('teachers.json', [{ id: 't', name: 'Teacher', code: '110001' }, { id: 'other', name: 'Other', code: '110002' }]);
  seed('students.json', Array.from({ length: 7 }, (_, i) => ({ id: 's' + (i + 1), name: 'Student ' + (i + 1), teacherId: i === 6 ? 'other' : 't', code: String(110101 + i), createdAt: now })));
  seed('progress.json', {});
  const port = await getFreePort(), baseUrl = 'http://127.0.0.1:' + port;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], { cwd: workspaceDir, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(tempRoot, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1', LEARNING_GROUP_RTC_ENABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  const sockets = [];
  const open = async token => {
    const ws = await openWebSocket('ws://127.0.0.1:' + port + '/rtc?_auth=' + encodeURIComponent(token)); sockets.push(ws);
    const inbox = []; ws.on('message', raw => inbox.push(JSON.parse(String(raw))));
    return { ws, inbox, send: value => ws.send(JSON.stringify(value)), take: type => waitForValue(() => { const i = inbox.findIndex(message => message.type === type); return i < 0 ? null : inbox.splice(i, 1)[0]; }, 'Missing ' + type) };
  };
  try {
    await waitForServer(baseUrl, child, () => logs);
    const teacher = await login(baseUrl, '110001'), observer = await login(baseUrl, '110101'), regular = await login(baseUrl, '110104'), other = await login(baseUrl, '110107');
    const request = (url, options = {}) => jsonRequest(baseUrl, url, { token: teacher.token, ...options });
    const makeGroup = async (name, ids) => { const { group } = await request('/api/learning-groups', { method: 'POST', status: 201, body: { name } }); for (const id of ids) await request('/api/learning-groups/' + group.id + '/members', { method: 'POST', body: { studentId: id } }); await request('/api/learning-groups/' + group.id + '/start', { method: 'POST', body: {} }); return group; };
    const own = await makeGroup('Группа 2', ['s1', 's2', 's3']), foreign = await makeGroup('Другая группа', ['s4', 's5', 's6']);
    const root = '/api/learning-groups/' + foreign.id;
    const { lesson } = await request(root + '/lessons', { method: 'POST', status: 201, body: { startAt: now, durationMinutes: 60, topic: 'Графы' } });
    const channels = await request(root + '/lessons/' + lesson.id + '/voice-channels');
    const room = lesson.rtcRoomId;
    const a = await open(observer.token), t = await open(teacher.token), r = await open(regular.token), stranger = await open(other.token);
    a.send({ type: 'join', roomId: room }); await a.take('error'); // not live yet
    t.send({ type: 'join', roomId: room }); const jt = await t.take('joined');
    r.send({ type: 'join', roomId: room }); const jr = await r.take('joined'); assert.equal(jr.listenOnly, false);
    const library = await request('/api/student-group-library', { token: observer.token });
    assert.equal(library.allowed, true); assert.equal(library.lessons.some(entry => entry.id === lesson.id && entry.canListen), true);
    assert.equal(JSON.stringify(library).includes('participantIds'), false);
    await request(root + '/lessons/' + lesson.id + '/replay', { token: observer.token, status: 403 });
    await request(root + '/lessons/' + lesson.id + '/voice-channels', { token: observer.token, status: 403 });
    a.send({ type: 'join', roomId: channels.channels[1].roomId }); await a.take('error');
    stranger.send({ type: 'join', roomId: room }); await stranger.take('error');
    a.send({ type: 'join', roomId: room, listenOnly: false }); const ja = await a.take('joined'); assert.equal(ja.listenOnly, true);
    const bad = { description: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\n' } };
    a.send({ type: 'signal', roomId: room, targetId: jt.selfId, signal: bad }); await a.take('error');
    await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(t.inbox.some(message => message.type === 'signal' && message.fromId === ja.selfId), false);
    const good = { description: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n' } };
    a.send({ type: 'signal', roomId: room, targetId: jt.selfId, signal: good }); assert.equal((await t.take('signal')).peer.listenOnly, true);
    r.send({ type: 'signal', roomId: room, targetId: ja.selfId, signal: bad }); assert.equal((await a.take('signal')).peer.listenOnly, false);
    a.send({ type: 'presence-state', isScreenSharing: true }); await a.take('error');
    a.send({ type: 'watch-code-sync', roomId: room }); await a.take('error');
    await request(root + '/lessons/' + lesson.id + '/voice-channels/distribute', { method: 'POST', body: {} });
    assert.equal(a.inbox.some(message => message.type === 'channel-move'), false);
    await r.take('channel-move');
    const attendance = await request(root + '/lessons/' + lesson.id + '/attendance');
    assert.equal(JSON.stringify(attendance).includes('"studentId":"s1"'), false);
    const snapshot = JSON.parse(fs.readFileSync(path.join(dataDir, 'learning-groups.json')));
    assert.equal(snapshot.find(group => group.id === foreign.id).members.some(member => member.studentId === 's1'), false);
    await request(root + '/lessons/' + lesson.id, { method: 'PATCH', body: { status: 'completed' } });
    await a.take('session-ended');
    a.send({ type: 'join', roomId: room }); await a.take('error');
    assert.equal((await request('/api/student-group-library', { token: other.token })).allowed, false);
    const { lesson: nextLesson } = await request(root + '/lessons', { method: 'POST', status: 201, body: { startAt: new Date().toISOString(), durationMinutes: 60, topic: 'Логика' } });
    t.send({ type: 'join', roomId: nextLesson.rtcRoomId }); await t.take('joined');
    a.send({ type: 'join', roomId: nextLesson.rtcRoomId }); assert.equal((await a.take('joined')).listenOnly, true);
    await request('/api/learning-groups/' + own.id + '/members/s1', { method: 'DELETE' });
    a.send({ type: 'signal', roomId: nextLesson.rtcRoomId, targetId: jt.selfId, signal: good });
    await a.take('session-ended');
    assert.equal((await request('/api/student-group-library', { token: observer.token })).allowed, false);
    a.send({ type: 'join', roomId: nextLesson.rtcRoomId }); await a.take('error');
  } finally { await Promise.all(sockets.map(closeWebSocket)); await stopServer(child); fs.rmSync(tempRoot, { recursive: true, force: true }); }
});
