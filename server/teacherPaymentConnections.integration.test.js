import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const hash = code => { const salt = 'payment-key-test'; return `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`; };

test('webhooks isolate identical payers, prevent repeats, migrate safely, and never expose another teacher key', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-keys-integration-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const read = name => fs.existsSync(path.join(dataDir, `${name}.json`)) ? JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`))) : {};
  const today = new Date().toISOString().slice(0, 10);
  const createdAt = '2025-01-01T00:00:00.000Z';
  write('teachers', ['owner', 'second'].map(id => ({ id, name: id, codeHash: hash(`payment-${id}-login`), createdAt })));
  write('students', ['owner', 'second'].map(id => ({ id: `student-${id}`, teacherId: id, name: 'Dima', code: `student-${id}-login`, createdAt, grade: '11' })));
  write('tests', {});
  write('progress', Object.fromEntries(['owner', 'second'].map(id => [`student-${id}`, {
    progress: {}, homeworks: [], solvedByTask: {}, solvedEvents: [], mocks: [],
    schedule: [1, 2, 3].map(index => ({ id: `${id}-lesson-${index}`, studentId: `student-${id}`, date: today, time: `0${index}:00`, durationMinutes: 60, subject: 'Python', createdAt })),
  }])));
  write('teacher-finances', Object.fromEntries(['owner', 'second'].map(id => [id, { studentProfiles: { [`student-${id}`]: { lessonPrice: 2000 } } }])));
  write('payment-sender-links', Object.fromEntries(['owner', 'second'].map(id => [id, { links: { иванп: { senderName: 'Иван П', senderKey: 'иванп', studentId: `student-${id}`, createdAt, updatedAt: createdAt } } }])));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child, logs = '';
  const start = async () => {
    child = spawn(process.execPath, ['server/index.js'], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, PORT: String(port), NODE_ENV: 'test', TZ: 'Europe/Moscow', PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
      MACRODROID_PAYMENT_SECRET: 'legacy-payment-key', PAYMENT_NOTIFICATION_TEACHER_ID: 'owner',
      COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', STUDENT_SCHEDULE_PAYMENT_TRACKING_START_DAY_KEY: createdAt.slice(0, 10),
    } });
    child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(`${base}/api/availability`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Server startup failed: ${logs}`);
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
  };
  const request = async (route, { token, method = 'GET', body } = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  const hook = body => request('/api/payment-notifications/tbank', { method: 'POST', body });
  const payment = { title: 'Т-Банк', text: 'Пополнение на 2 000 ₽, счет RUB. Иван П. Доступно 12 000 ₽', receivedAt: new Date().toISOString() };
  const snapshot = () => JSON.stringify([read('teacher-finances'), read('teacher-calendar-marks'), read('payment-notifications')]);
  try {
    await start();
    const ownerToken = (await request('/api/login', { method: 'POST', body: { code: 'payment-owner-login' } })).body.token;
    const secondToken = (await request('/api/login', { method: 'POST', body: { code: 'payment-second-login' } })).body.token;
    const studentToken = (await request('/api/login', { method: 'POST', body: { code: 'student-owner-login' } })).body.token;
    assert.ok(ownerToken && secondToken && studentToken);
    assert.equal((await request('/api/teacher-payment-connection')).status, 401);
    assert.equal((await request('/api/teacher-payment-connection', { token: studentToken })).status, 403);
    assert.equal((await request('/api/teacher-payment-connection', { token: ownerToken })).body.connection.configured, false);
    assert.equal(fs.existsSync(path.join(dataDir, 'teacher-payment-connections.json')), false);
    const owner = (await request('/api/teacher-payment-connection', { token: ownerToken, method: 'POST', body: {} })).body.connection;
    const second = (await request('/api/teacher-payment-connection', { token: secondToken, method: 'POST', body: {} })).body.connection;
    assert.notEqual(owner.secret, second.secret);
    assert.equal((await request('/api/teacher-payment-connection?teacherId=second', { token: ownerToken })).status, 403);
    assert.equal((await request('/api/teacher-payment-connection', { token: ownerToken, method: 'POST', body: { teacherId: 'second', rotate: true } })).status, 403);
    const before = snapshot();
    assert.equal((await hook({ ...payment, secret: 'wrong' })).status, 401);
    assert.equal((await hook({ ...payment, secret: second.secret, teacherId: 'owner' })).status, 403);
    assert.equal((await hook({ ...payment, secret: 'legacy-payment-key', teacherId: 'second' })).status, 403);
    const dry = await hook({ secret: owner.secret, test: true });
    assert.equal(dry.status, 200); assert.equal(dry.body.teacherId, 'owner');
    assert.equal(snapshot(), before, 'dry runs and rejected requests preserve finances');
    assert.equal((await request('/api/teacher-payment-connection', { token: ownerToken })).body.connection.legacyActive, true);
    const legacy = await hook({ ...payment, secret: 'legacy-payment-key', id: 'same-bank-id' });
    assert.equal(legacy.body.notification.status, 'applied', JSON.stringify(legacy.body));
    assert.equal(legacy.body.notification.receiverTeacherId, 'owner');
    assert.equal(legacy.body.notification.authMode, 'legacy-key');
    assert.equal(legacy.body.notification.markKeys.length, 1);
    const migrationSnapshot = snapshot();
    const repeat = await hook({ ...payment, secret: owner.secret, id: 'same-bank-id' });
    assert.equal(repeat.body.notification.status, 'duplicate');
    assert.equal(snapshot(), migrationSnapshot, 'migration must not count legacy receipt twice');
    assert.equal((await hook({ ...payment, secret: 'legacy-payment-key' })).status, 401);
    const other = await hook({ ...payment, secret: second.secret, id: 'same-bank-id' });
    assert.equal(other.body.notification.status, 'applied');
    assert.equal(other.body.notification.studentId, 'student-second');
    assert.equal(other.body.notification.receiverTeacherId, 'second');
    assert.equal(other.body.notification.authMode, 'personal-key');
    assert.notEqual(other.body.notification.id, legacy.body.notification.id);
    const concurrentPayload = { ...payment, text: payment.text.replace('12 000', '14 000'), secret: second.secret, notificationId: 'concurrent-id' };
    const concurrent = await Promise.all([hook(concurrentPayload), hook(concurrentPayload)]);
    assert.deepEqual(concurrent.map(result => result.body.notification.status).sort(), ['applied', 'duplicate']);
    const ownerHistory = await request('/api/payment-notifications', { token: ownerToken });
    const secondHistory = await request('/api/payment-notifications', { token: secondToken });
    assert.ok(ownerHistory.cache.includes('no-store'));
    assert.equal(ownerHistory.body.notifications.length, 1);
    assert.equal(secondHistory.body.notifications.length, 2);
    assert.ok(secondHistory.body.notifications.every(entry => entry.receiverTeacherId === 'second'));
    const withoutFinance = snapshot();
    const testAction = await hook({ secret: owner.secret, title: '{not_title}', text: '{notification}' });
    assert.equal(testAction.status, 200); assert.equal(testAction.body.connection.status, 'connected');
    assert.equal(snapshot(), withoutFinance, 'placeholder tests create no fake payments');
    const rotated = (await request('/api/teacher-payment-connection', { token: secondToken, method: 'POST', body: { rotate: true } })).body.connection;
    assert.equal((await hook({ secret: second.secret, test: true })).status, 401);
    assert.equal((await hook({ secret: rotated.secret, test: true })).body.teacherId, 'second');
    await stop(); await start();
    assert.equal((await hook({ secret: 'legacy-payment-key', test: true })).status, 401);
    assert.equal((await hook({ secret: owner.secret, test: true })).status, 200);
    assert.equal(snapshot(), withoutFinance, 'server restart preserves financial records');
    fs.writeFileSync(path.join(dataDir, 'teacher-payment-connections.json'), '{broken');
    assert.equal((await hook({ secret: 'legacy-payment-key', test: true })).status, 503);
  } finally {
    await stop();
    if (process.env.PAYMENT_KEYS_KEEP_FIXTURE === '1') {
      fs.rmSync(path.join(dataDir, 'teacher-payment-connections.json'), { force: true });
      console.log(`PAYMENT_KEYS_FIXTURE=${root}`);
    } else fs.rmSync(root, { recursive: true, force: true });
  }
});
