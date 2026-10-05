import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const hash = code => `scrypt$fixture$${crypto.scryptSync(code, 'fixture', 64).toString('base64')}`;
test('admin payer setup, monthly T-bank receipt, duplicate, review and student isolation', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-auto-payment-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  write('teachers.json', [{ id: 'owner', name: 'Владелец', codeHash: hash('owner-code') }, { id: 'teacher', name: 'Учитель', codeHash: hash('teacher-code') }]);
  write('students.json', [{ id: 'student', name: 'Ученик', nickname: 'STUDENT77', teacherId: 'owner', codeHash: hash('student-code') }]);
  write('progress.json', {});
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  let child, logs = '';
  const request = async (route, token, method = 'GET', body, expected = 200) => {
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-tbank-secret': 'fixture-secret' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await res.json(); assert.equal(res.status, expected, JSON.stringify(json)); return json;
  };
  try {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', PAYMENT_NOTIFICATION_SECRET: 'fixture-secret', MACRODROID_PAYMENT_SECRET: '', TBANK_PAYMENT_NOTIFICATION_SECRET: '', PAYMENT_NOTIFICATION_TEACHER_ID: 'owner' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
    for (let i = 0; i < 200; i++) { assert.equal(child.exitCode, null, logs); try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 199) throw new Error(logs); }
    const admin = (await request('/api/login', '', 'POST', { code: 'admin-7264' })).token;
    const owner = (await request('/api/login', '', 'POST', { code: 'owner-code' })).token;
    const teacher = (await request('/api/login', '', 'POST', { code: 'teacher-code' })).token;
    await request('/api/teacher-subscription', teacher, 'PATCH', { teacherId: 'teacher', monthlyFee: 3000, payerName: 'Петр П.' }, 403);
    const setup = await request('/api/teacher-subscription', admin, 'PATCH', { teacherId: 'teacher', monthlyFee: 3000, dueDay: 31, payerName: 'Пётр П.' });
    assert.equal(setup.payerName, 'Пётр П.'); assert.equal(setup.autoPaymentEnabled, true);
    await request('/api/teacher-subscription', admin, 'PATCH', { teacherId: 'owner', monthlyFee: 3000, payerName: 'Петр П.' }, 409);
    const month = setup.month;
    const receipt = { id: 'platform-payment', teacherId: 'owner', title: 'Т-Банк', text: 'Пополнение. +3000 ₽ от Петр П.', receivedAt: new Date().toISOString() };
    const wrong = await request('/api/payment-notifications/tbank', '', 'POST', { ...receipt, id: 'wrong-amount', amount: 2999 }, 202);
    assert.equal(wrong.notification.paymentTarget, 'teacher-platform'); assert.equal(wrong.notification.status, 'pending');
    const ok = await request('/api/payment-notifications/tbank', '', 'POST', receipt);
    assert.equal(ok.notification.paymentTarget, 'teacher-platform'); assert.equal(ok.notification.paymentMonth, month);
    const status = await request('/api/teacher-subscription?teacherId=teacher', admin);
    assert.equal(status.status, 'paid'); assert.equal(status.paidAmount, 3000); assert.equal(status.paymentSource, 'tbank');
    const duplicate = await request('/api/payment-notifications/tbank', '', 'POST', receipt);
    assert.equal(duplicate.notification.status, 'duplicate');
    const studentNotifications = await request('/api/payment-notifications?teacherId=owner', owner);
    assert.equal(studentNotifications.notifications.length, 0);
    const studentReceipt = await request('/api/payment-notifications/tbank', '', 'POST', { ...receipt, id: 'student-payment', text: 'Пополнение. +2000 ₽ от Ирина С. STUDENT77', amount: 2000 }, 202);
    assert.equal(studentReceipt.notification.paymentTarget, 'student');
    await request('/api/payment-sender-links', owner, 'PATCH', { senderName: 'Петр П.', studentId: 'student' });
    const collision = await request('/api/payment-notifications/tbank', '', 'POST', { ...receipt, id: 'collision', receivedAt: `${month}-15T10:00:00Z` }, 202);
    assert.match(collision.notification.reason, /нескольких/);
    await request('/api/teacher-subscription/payment?teacherId=teacher', admin, 'DELETE');
    write('payment-notifications.json', { items: [] });
    assert.equal((await request('/api/payment-notifications/tbank', '', 'POST', receipt)).notification.status, 'duplicate');
    assert.notEqual((await request('/api/teacher-subscription?teacherId=teacher', admin)).status, 'paid');
    await request('/api/teacher-subscription/notifications', teacher, 'GET', undefined, 403);
    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'teacher-subscriptions.json')));
    assert.equal(persisted.teacher.autoReceipts['platform-payment'].month, month);
  } finally {
    if (child && child.exitCode === null) { const done = new Promise(r => child.once('exit', r)); child.kill(); await done; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
