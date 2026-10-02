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
const until = async (probe, label, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await probe(); if (value) return value; await delay(25); }
  throw new Error(`Timed out: ${typeof label === 'function' ? label() : label}`);
};
const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
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
  return { ws, take, send: (data) => ws.send(JSON.stringify(data)) };
};
const rejectedUpgrade = (url, status = 401) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.once('unexpected-response', (_req, response) => {
    response.resume(); ws.terminate();
    try { assert.equal(response.statusCode, status); resolve(); } catch (e) { reject(e); }
  });
  ws.once('open', () => { ws.terminate(); reject(new Error('Unauthorized socket opened')); });
  ws.on('error', () => {});
});

test('anonymous host creates and controls a 20-person meeting without receiving platform access', { timeout: 60_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-public-api-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{ id: 'teacher', name: 'Иван', code: '110001' }]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), '[]');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], { cwd: workspace,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
      COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', PUBLIC_MEETINGS_ENABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (raw) => { logs += raw; }); child.stderr.on('data', (raw) => { logs += raw; });
  const clients = [];
  t.after(async () => {
    clients.forEach((c) => c.ws.terminate());
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
  const studentsBefore = fs.readFileSync(path.join(dataDir, 'students.json'), 'utf8');
  const request = async (url, { token, body, status = 200 } = {}) => {
    const response = await fetch(`${base}${url}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json(); assert.equal(response.status, status, `${url}: ${JSON.stringify(value)}`); return value;
  };
  assert.equal((await request('/api/public-meetings/config')).enabled, true);
  await request('/api/public-meetings', { body: { name: ' ' }, status: 400 });
  const host = await request('/api/public-meetings', { body: { name: 'Маша', title: 'Друзья' }, status: 201 });
  const second = await request('/api/public-meetings', { body: { name: 'Миша' }, status: 201 });
  assert.equal(host.user.role, 'meeting-host');
  const info = await request(`/api/guest-meetings/${host.meeting.id}`);
  assert.equal(Object.hasOwn(info.meeting, 'hostId'), false);
  assert.equal(Object.hasOwn(info.meeting, 'token'), false);
  for (const endpoint of ['/api/session', '/api/students', '/api/teacher-meetings']) await request(endpoint, { token: host.token, status: 401 });
  const teacher = await request('/api/login', { body: { code: '110001' } });
  assert.deepEqual((await request('/api/teacher-meetings', { token: teacher.token })).meetings, []);
  const controlUrl = `/api/public-meetings/${host.meeting.id}/control`;
  await request(controlUrl, { body: { action: 'close', token: host.token, role: 'meeting-host' }, status: 403 });
  await request(controlUrl, { token: second.token, body: { action: 'close' }, status: 403 });
  await request(controlUrl, { token: teacher.token, body: { action: 'close' }, status: 403 });
  await request(`/api/teacher-meetings/${host.meeting.id}/control`, { token: teacher.token, body: { action: 'close' }, status: 403 });
  const wsBase = base.replace('http:', 'ws:');
  await rejectedUpgrade(`${wsBase}/rtc?_auth=${host.token}`);
  await rejectedUpgrade(`${wsBase}/notifications?_meetingAuth=${host.token}`);
  await rejectedUpgrade(`${wsBase}/collab/board?_meetingAuth=${host.token}`);
  const open = async (identity) => {
    const client = await connect(`${wsBase}/rtc?_meetingAuth=${identity.token}`); clients.push(client); return client;
  };
  const hostClient = await open(host);
  hostClient.send({ type: 'join', roomId: second.meeting.roomId }); await hostClient.take('error');
  hostClient.send({ type: 'join', roomId: 'rtc:teacher:student' }); await hostClient.take('error');
  hostClient.send({ type: 'watch-code-sync', roomId: host.meeting.roomId }); await hostClient.take('error');
  const guest = await request(`/api/guest-meetings/${host.meeting.id}/join`, { body: { name: 'Аня', role: 'meeting-host' } });
  assert.equal(guest.user.role, 'guest');
  await request(controlUrl, { token: guest.token, body: { action: 'close' }, status: 403 });
  const first = await open(guest); first.send({ type: 'join', roomId: host.meeting.roomId }); const firstJoined = await first.take('joined');
  for (let i = 1; i < 19; i++) {
    const identity = await request(`/api/guest-meetings/${host.meeting.id}/join`, { body: { name: `Друг ${i}` } });
    const client = await open(identity); client.send({ type: 'join', roomId: host.meeting.roomId }); await client.take('joined');
  }
  const overflowIdentity = await request(`/api/guest-meetings/${host.meeting.id}/join`, { body: { name: 'Лишний' } });
  const overflow = await open(overflowIdentity); overflow.send({ type: 'join', roomId: host.meeting.roomId });
  assert.match((await overflow.take('error')).error, /20/);
  hostClient.send({ type: 'join', roomId: host.meeting.roomId }); const joinedHost = await hostClient.take('joined');
  assert.equal(joinedHost.peers.length, 19);
  assert.equal((await request(`/api/guest-meetings/${host.meeting.id}/presence`, { token: host.token })).participants.length, 20);
  hostClient.send({ type: 'signal', targetId: firstJoined.selfId, signal: { type: 'candidate', candidate: { candidate: 'test' } } });
  assert.equal((await first.take('signal')).fromId, joinedHost.selfId);
  const replacement = await open(host); replacement.send({ type: 'join', roomId: host.meeting.roomId });
  assert.equal((await replacement.take('joined')).peers.length, 19); await hostClient.take('session-ended');
  const pending = [];
  for (let i = 0; i < 3; i++) pending.push(await open(host));
  await rejectedUpgrade(`${wsBase}/rtc?_meetingAuth=${host.token}`, 429);
  pending.forEach((client) => client.ws.terminate());
  await request(controlUrl, { token: host.token, body: { action: 'mute', guestId: guest.user.id } }); await first.take('host-mute');
  await request(controlUrl, { token: host.token, body: { action: 'lock' } });
  await request(`/api/guest-meetings/${host.meeting.id}/join`, { body: { name: 'Поздний' }, status: 403 });
  assert.equal((await request(`/api/guest-meetings/${host.meeting.id}/join`, { body: { resumeToken: host.token } })).user.role, 'meeting-host');
  await request(controlUrl, { token: host.token, body: { action: 'unlock' } });
  await request(controlUrl, { token: host.token, body: { action: 'remove', guestId: guest.user.id } }); await first.take('session-ended');
  await rejectedUpgrade(`${wsBase}/rtc?_meetingAuth=${guest.token}`);
  await request(controlUrl, { token: host.token, body: { action: 'close' } });
  await replacement.take('session-ended'); await overflow.take('session-ended');
  await request(`/api/guest-meetings/${host.meeting.id}`, { status: 410 });
  await rejectedUpgrade(`${wsBase}/rtc?_meetingAuth=${host.token}`);
  assert.equal(fs.readFileSync(path.join(dataDir, 'students.json'), 'utf8'), studentsBefore);
  assert.equal(fs.existsSync(path.join(dataDir, 'learning-attendance.json')), false);
  // Bounded creation is enforced even for clients that repeatedly close their rooms.
  for (let i = 0; i < 7; i++) {
    const created = await request('/api/public-meetings', { body: { name: 'Проверка лимита' }, status: 201 });
    await request(`/api/public-meetings/${created.meeting.id}/control`, { token: created.token, body: { action: 'close' } });
  }
  await request('/api/public-meetings', { body: { name: 'Слишком много' }, status: 429 });
});
