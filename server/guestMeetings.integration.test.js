import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const until = async (probe, label, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await probe(); if (value) return value; await delay(25); }
  throw new Error(`Timed out: ${typeof label === 'function' ? label() : label}`);
};
const connect = async (url) => {
  const ws = new WebSocket(url);
  const messages = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const take = (type) => until(() => {
    const index = messages.findIndex((m) => m.type === type);
    return index >= 0 ? messages.splice(index, 1)[0] : null;
  }, type);
  await take('ready');
  return { ws, messages, take, send: (data) => ws.send(JSON.stringify(data)) };
};
const rejectedUpgrade = (url, expectedStatus) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.once('unexpected-response', (_req, response) => {
    response.resume(); ws.terminate();
    try { assert.equal(response.statusCode, expectedStatus); resolve(); } catch (e) { reject(e); }
  });
  ws.once('open', () => { ws.terminate(); reject(new Error('Unauthorized socket opened')); });
  ws.on('error', () => {});
});

test('real server supports 20 isolated RTC participants, host moderation and no student side effects', { timeout: 60_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-guest-api-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const teachers = [{ id: 'host', name: 'Иван', code: '110001' }, { id: 'other', name: 'Другой учитель', code: '220001' }];
  const students = [{ id: 'student', teacherId: 'host', name: 'Ученик', code: '110101', grade: '11', deletedAt: null }];
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify(teachers));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify(students));
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({ student: { schedule: [], homeworks: [], mockAttempts: {} } }));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], { cwd: workspace,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
      COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1', LEARNING_GROUP_RTC_ENABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (raw) => { logs += raw; }); child.stderr.on('data', (raw) => { logs += raw; });
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.ws.terminate());
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill();
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  await until(async () => {
    if (child.exitCode !== null) throw new Error(logs);
    try { return (await fetch(`${base}/api/client-build-version`)).ok; } catch { return false; }
  }, () => `server startup ${logs}`, 25000);
  const request = async (url, { token, body, status = 200 } = {}) => {
    const response = await fetch(`${base}${url}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    assert.equal(response.status, status, `${url}: ${JSON.stringify(value)}`);
    return value;
  };
  const host = await request('/api/login', { body: { code: '110001' } });
  const other = await request('/api/login', { body: { code: '220001' } });
  const student = await request('/api/login', { body: { code: '110101' } });
  const progressBefore = fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8');
  const studentsBefore = fs.readFileSync(path.join(dataDir, 'students.json'), 'utf8');
  await request('/api/teacher-meetings', { token: student.token, body: { title: 'Forbidden' }, status: 403 });
  const { meeting } = await request('/api/teacher-meetings', { token: host.token, body: { title: 'Пробный урок' }, status: 201 });
  const { meeting: different } = await request('/api/teacher-meetings', { token: other.token, body: {}, status: 201 });
  const info = await request(`/api/guest-meetings/${meeting.id}`);
  assert.equal(info.meeting.title, 'Пробный урок');
  assert.deepEqual(Object.keys(info), ['meeting']);
  assert.equal(Object.hasOwn(info.meeting, 'teacherId'), false);
  const guest = await request(`/api/guest-meetings/${meeting.id}/join`, { body: { name: 'Александр' } });
  await request('/api/session', { token: guest.token, status: 401 });
  await request('/api/students', { token: guest.token, status: 401 });
  await request('/api/teacher-meetings', { token: guest.token, status: 401 });
  await request(`/api/guest-meetings/${different.id}/presence`, { token: guest.token, status: 403 });
  await request(`/api/teacher-meetings/${meeting.id}/control`, { token: other.token, body: { action: 'close' }, status: 403 });
  const wsBase = base.replace('http:', 'ws:');
  await rejectedUpgrade(`${wsBase}/rtc?_auth=${guest.token}`, 401);
  await rejectedUpgrade(`${wsBase}/rtc?_meetingAuth=&_auth=${host.token}`, 401);
  await rejectedUpgrade(`${wsBase}/notifications?_auth=${guest.token}&_meetingAuth=${guest.token}`, 401);
  await rejectedUpgrade(`${wsBase}/collab/board?room=board:host:student&_auth=${guest.token}`, 401);
  const otherClient = await connect(`${wsBase}/rtc?_auth=${other.token}`); clients.push(otherClient);
  otherClient.send({ type: 'join', roomId: meeting.roomId }); await otherClient.take('error');
  otherClient.send({ type: 'join', roomId: different.roomId }); const joinedOther = await otherClient.take('joined');
  const openGuest = async (identity) => {
    const client = await connect(`${base.replace('http:', 'ws:')}/rtc?_meetingAuth=${identity.token}`);
    clients.push(client); return client;
  };
  const first = await openGuest(guest);
  first.send({ type: 'join', roomId: different.roomId }); await first.take('error');
  first.send({ type: 'join', roomId: 'rtc:host:student' }); await first.take('error');
  first.send({ type: 'watch-code-sync', roomId: 'rtc:host:student' }); await first.take('error');
  first.send({ type: 'join', roomId: meeting.roomId }); const joinedFirst = await first.take('joined');
  first.send({ type: 'signal', targetId: joinedOther.selfId, signal: { type: 'candidate', candidate: { candidate: 'isolated' } } });
  await first.take('error');
  for (let i = 1; i < 19; i++) {
    const identity = await request(`/api/guest-meetings/${meeting.id}/join`, { body: { name: `Гость ${i + 1}` } });
    const client = await openGuest(identity); client.send({ type: 'join', roomId: meeting.roomId });
    const joined = await client.take('joined'); assert.equal(joined.peers.length, i);
  }
  const overflowIdentity = await request(`/api/guest-meetings/${meeting.id}/join`, { body: { name: 'Лишний' } });
  const overflow = await openGuest(overflowIdentity); overflow.send({ type: 'join', roomId: meeting.roomId });
  assert.match((await overflow.take('error')).error, /20/);
  const hostClient = await connect(`${base.replace('http:', 'ws:')}/rtc?_auth=${host.token}`); clients.push(hostClient);
  hostClient.send({ type: 'join', roomId: meeting.roomId }); const joinedHost = await hostClient.take('joined');
  assert.equal(joinedHost.peers.length, 19);
  assert.equal((await request(`/api/guest-meetings/${meeting.id}/presence`, { token: host.token })).participants.length, 20);
  first.send({ type: 'signal', targetId: joinedHost.selfId, signal: { type: 'candidate', candidate: { candidate: 'test' } } });
  const signal = await hostClient.take('signal'); assert.equal(signal.fromId, joinedFirst.selfId);
  await request(`/api/teacher-meetings/${meeting.id}/control`, { token: host.token, body: { action: 'mute', guestId: guest.user.id } });
  await first.take('host-mute');
  // Reconnecting the same guest replaces their previous tab even when the room is full.
  const replacement = await openGuest(guest); replacement.send({ type: 'join', roomId: meeting.roomId });
  assert.equal((await replacement.take('joined')).peers.length, 19);
  await first.take('session-ended');
  await request(`/api/teacher-meetings/${meeting.id}/control`, { token: host.token, body: { action: 'lock' } });
  await request(`/api/guest-meetings/${meeting.id}/join`, { body: { name: 'Новый' }, status: 403 });
  assert.equal((await request(`/api/guest-meetings/${meeting.id}/join`, { body: { resumeToken: guest.token } })).user.id, guest.user.id);
  await request(`/api/teacher-meetings/${meeting.id}/control`, { token: host.token, body: { action: 'remove', guestId: guest.user.id } });
  await replacement.take('session-ended');
  await request(`/api/guest-meetings/${meeting.id}/join`, { body: { resumeToken: guest.token }, status: 403 });
  await request(`/api/guest-meetings/${meeting.id}/presence`, { token: guest.token, status: 403 });
  await rejectedUpgrade(`${wsBase}/rtc?_meetingAuth=${guest.token}`, 401);
  await request(`/api/teacher-meetings/${meeting.id}/control`, { token: host.token, body: { action: 'close' } });
  await hostClient.take('session-ended');
  await overflow.take('session-ended');
  await request(`/api/guest-meetings/${meeting.id}`, { status: 410 });
  await request(`/api/guest-meetings/${meeting.id}/join`, { body: { name: 'Поздний гость' }, status: 410 });
  assert.equal(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'), progressBefore);
  assert.equal(fs.readFileSync(path.join(dataDir, 'students.json'), 'utf8'), studentsBefore);
  assert.equal(fs.existsSync(path.join(dataDir, 'learning-attendance.json')), false);
});
