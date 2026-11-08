import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { subscriptionDay } from './teacherSubscriptionPolicy.js';

test('overdue access revokes sessions, verified-code login shows payment, payment restores login', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-subscription-access-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const hash = code => `scrypt$fixture$${crypto.scryptSync(code, 'fixture', 64).toString('base64')}`;
  const month = subscriptionDay().slice(0, 7);
  const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1);
  const previous = date.toISOString().slice(0, 7);
  const payments = { [month]: { amount: 2000 }, [previous]: { amount: 2000 } };
  write('teachers.json', [{ id: 'teacher', name: 'Проверка оплаты', codeHash: hash('paid-teacher-code') }]);
  write('students.json', []); write('progress.json', {});
  write('teacher-subscriptions.json', { teacher: { monthlyFee: 2000, billingStartMonth: previous, payments } });
  const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  let child, logs = '';
  const request = async (route, token, method = 'GET', body, expected = 200) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = await response.json(); assert.equal(response.status, expected, JSON.stringify(json));
    return { json, response };
  };
  try {
    child = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', ADMIN_ACCESS_CODE: 'admin-7264' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', c => { logs += c; }); child.stderr.on('data', c => { logs += c; });
    for (let i = 0; i < 200; i++) { assert.equal(child.exitCode, null, logs); try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 199) throw Error(logs); }
    const admin = (await request('/api/login', '', 'POST', { code: 'admin-7264' })).json.token;
    const teacher = (await request('/api/login', '', 'POST', { code: 'paid-teacher-code' })).json.token;
    await request('/api/session', teacher);
    await request(`/api/teacher-subscription/payment?teacherId=teacher&month=${previous}`, admin, 'DELETE');
    const blocked = await request('/api/session', teacher, 'GET', undefined, 402);
    assert.equal(blocked.json.code, 'TEACHER_SUBSCRIPTION_REQUIRED');
    assert.equal(blocked.json.subscription.month, previous);
    assert.match(blocked.response.headers.get('set-cookie'), /Max-Age=0|1970/i);
    await request('/api/session', teacher, 'GET', undefined, 401);
    const loginBlocked = await request('/api/login', '', 'POST', { code: 'paid-teacher-code' }, 402);
    assert.equal(loginBlocked.json.subscription.remaining, 2000); assert.equal(loginBlocked.json.token, undefined);
    await request('/api/login', '', 'POST', { code: 'wrong-code' }, 401);
    await request('/api/teacher-subscription/payment', admin, 'POST', { teacherId: 'teacher', month: previous, amount: 2000 });
    const restored = await request('/api/login', '', 'POST', { code: 'paid-teacher-code' });
    assert.equal(restored.json.subscription.accessAllowed, true);
    await request('/api/session', restored.json.token);
    // Revocation survives server persistence; the stale session is not reusable.
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth-sessions.json'), 'utf8'));
    assert.ok(!JSON.stringify(saved).includes(teacher));
  } finally {
    if (child && child.exitCode === null) { const done = new Promise(r => child.once('exit', r)); child.kill(); await done; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
