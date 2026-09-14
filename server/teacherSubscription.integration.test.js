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
const codeHash = (code) => {
  const salt = 'teacher-subscription-integration-fixture';
  return `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`;
};
const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});
const stop = async (child) => {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
};

test('teacher subscription can be configured, paid, and enforced at login', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-teacher-subscription-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const now = new Date().toISOString();
  write('teachers.json', [
    { id: 'teacher-one', name: 'Первый', codeHash: codeHash('teacher-one-code'), createdAt: now },
    { id: 'teacher-two', name: 'Второй', codeHash: codeHash('teacher-two-code'), createdAt: now },
  ]);
  write('students.json', []);
  write('progress.json', {});
  write('teacher-subscriptions.json', {
    'teacher-one': { monthlyFee: 3000, dueDay: 1, payments: {} },
  });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  const request = async (route, token, method = 'GET', body, expected) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (typeof expected === 'number') assert.equal(response.status, expected, JSON.stringify(payload));
    return { response, payload };
  };
  try {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspace,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        PLATFORM_DATA_DIR: dataDir,
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
        PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
        COLLAB_PERSISTENCE: '0',
        DISABLE_STARTUP_XP_REBALANCE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { logs += chunk; });
    child.stderr.on('data', (chunk) => { logs += chunk; });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      assert.equal(child.exitCode, null, logs);
      try {
        if ((await fetch(`${baseUrl}/api/client-build-version`)).ok) break;
      } catch { /* booting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 199) throw new Error(logs);
    }

    const blockedLogin = await request('/api/login', '', 'POST', { code: 'teacher-one-code' });
    assert.equal(blockedLogin.response.status, 402, JSON.stringify(blockedLogin.payload));
    assert.equal(blockedLogin.payload.subscription.status, 'overdue');

    const adminLogin = await request('/api/login', '', 'POST', { code: 'admin-7264' }, 200);
    const adminToken = adminLogin.payload.token;
    const teacherTwoLogin = await request('/api/login', '', 'POST', { code: 'teacher-two-code' }, 200);
    await request('/api/teacher-subscription', adminToken, 'PATCH', {
      teacherId: 'teacher-two',
      monthlyFee: 2000,
      dueDay: 1,
    }, 200);
    const blockedSession = await request('/api/session', teacherTwoLogin.payload.token, 'GET', undefined, 200);
    assert.equal(blockedSession.payload.subscription.status, 'overdue');
    await request('/api/task-catalog', teacherTwoLogin.payload.token, 'GET', undefined, 402);
    await request('/api/teacher-subscription?teacherId=teacher-one', teacherTwoLogin.payload.token, 'GET', undefined, 200);

    const teachersBefore = await request('/api/teachers', adminToken, 'GET', undefined, 200);
    assert.equal(teachersBefore.payload.find((teacher) => teacher.id === 'teacher-one').subscription.status, 'overdue');

    await request('/api/teacher-subscription/payment', adminToken, 'POST', {
      teacherId: 'teacher-one',
      month: teachersBefore.payload.find((teacher) => teacher.id === 'teacher-one').subscription.month,
      amount: 3000,
    }, 200);
    const teacherLogin = await request('/api/login', '', 'POST', { code: 'teacher-one-code' }, 200);
    const session = await request('/api/session', teacherLogin.payload.token, 'GET', undefined, 200);
    assert.equal(session.payload.subscription.status, 'paid');
    assert.equal(session.payload.subscription.accessAllowed, true);

    await request('/api/teacher-subscription', adminToken, 'PATCH', {
      teacherId: 'teacher-two',
      monthlyFee: 0,
      dueDay: 1,
    }, 200);
    await request('/api/teachers/teacher-two/global-task-manager', adminToken, 'PATCH', {}, 200);
    const teachersAfter = await request('/api/teachers', adminToken, 'GET', undefined, 200);
    assert.equal(teachersAfter.payload.find((teacher) => teacher.id === 'teacher-two').canManageGlobalTaskContent, true);
    assert.equal(teachersAfter.payload.find((teacher) => teacher.id === 'teacher-one').canManageGlobalTaskContent, false);
    await request('/api/task-catalog?scope=global', teacherTwoLogin.payload.token, 'GET', undefined, 200);
    await request('/api/task-catalog?scope=global', teacherLogin.payload.token, 'GET', undefined, 403);
  } finally {
    await stop(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
