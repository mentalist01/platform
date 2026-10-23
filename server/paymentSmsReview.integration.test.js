import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('bank SMS are isolated review records, never money or platform payments, and never suppress a real push', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-sms-review-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const read = name => fs.existsSync(path.join(data, `${name}.json`)) ? fs.readFileSync(path.join(data, `${name}.json`), 'utf8') : null;
  const financeSnapshot = () => ['teacher-finances', 'teacher-calendar-marks', 'teacher-subscriptions', 'progress'].map(read);
  const day = new Date().toISOString().slice(0, 10);
  write('teachers', [{ id: 'owner', name: 'Первый', code: '191901' }, { id: 'other', name: 'Второй', code: '191902' }]);
  write('students', ['owner', 'other'].map(teacherId => ({ id: `s-${teacherId}`, teacherId, name: 'Ученица', code: `sms-${teacherId}` })));
  write('teacher-finances', Object.fromEntries(['owner', 'other'].map(id => [id, { studentProfiles: { [`s-${id}`]: { lessonPrice: 2000 } } }])));
  write('teacher-calendar-marks', {}); write('tests', {});
  write('progress', Object.fromEntries(['owner', 'other'].map(id => [`s-${id}`, { schedule: [{ id: `lesson-${id}`, studentId: `s-${id}`, date: day, time: '16:00', durationMinutes: 60 }], homeworks: [], progress: {}, solvedByTask: {}, solvedEvents: [], mocks: [] }])));
  write('payment-sender-links', Object.fromEntries(['owner', 'other'].map(id => [id, { links: { ольгас: { senderName: 'Ольга С', senderKey: 'ольгас', studentId: `s-${id}` } } }])));
  write('teacher-subscriptions', {});
  const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const value = socket.address().port; socket.close(() => resolve(value)); }); });
  const base = `http://127.0.0.1:${port}`;
  let child, logs = '';
  const request = async (route, { token, body } = {}) => {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  try {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', MACRODROID_PAYMENT_SECRET: '', PAYMENT_NOTIFICATION_TEACHER_ID: 'owner',
    } });
    child.stdout.on('data', value => { logs += value; }); child.stderr.on('data', value => { logs += value; });
    const until = Date.now() + 20000;
    while (Date.now() < until) { try { if ((await fetch(base + '/api/availability')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(child.exitCode, null, logs);
    const owner = (await request('/api/login', { body: { code: '191901' } })).body.token;
    const other = (await request('/api/login', { body: { code: '191902' } })).body.token;
    const secret = (await request('/api/teacher-payment-connection', { token: owner, body: {} })).body.connection.secret;
    const otherSecret = (await request('/api/teacher-payment-connection', { token: other, body: {} })).body.connection.secret;
    const preview = (await request('/api/student-payment-balances', { token: owner })).body;
    assert.equal((await request('/api/student-payment-balances/enable', { token: owner, body: { previewToken: preview.previewToken } })).status, 200);
    const payload = { id: 'same-economic-event', source: 'automate', secret, title: 'T-Bank', text: 'Пополнение, счет RUB. 2000 ₽. Ольга С. Доступно 42049,87 ₽', receivedAt: `${day}T15:11:00+03:00`, reviewOnly: false, status: 'applied' };
    const before = financeSnapshot();
    assert.equal((await request('/api/payment-notifications/tbank/sms', { body: { ...payload, secret: 'invalid' } })).status, 401);
    const sms = await request('/api/payment-notifications/tbank/sms', { body: payload });
    assert.equal(sms.status, 202); assert.equal(sms.body.notification.status, 'pending');
    assert.equal(sms.body.notification.amount, 2000); assert.equal(sms.body.notification.senderName, 'Ольга С');
    assert.equal(sms.body.notification.studentId, 's-owner'); assert.equal(sms.body.notification.receiverTeacherId, 'owner');
    assert.deepEqual(sms.body.notification.markKeys, []); assert.match(sms.body.notification.reason, /SMS.*Деньги не зачислены/);
    assert.deepEqual(financeSnapshot(), before, 'SMS must not touch wallets, legacy marks, platform subscriptions or progress');
    const repeated = await request('/api/payment-notifications/tbank/sms', { body: payload });
    assert.equal(repeated.body.notification.status, 'duplicate'); assert.deepEqual(financeSnapshot(), before);
    const foreign = await request('/api/payment-notifications/tbank/sms', { body: { ...payload, secret: otherSecret } });
    assert.equal(foreign.body.notification.status, 'pending'); assert.equal(foreign.body.notification.studentId, 's-other');
    assert.equal((await request('/api/payment-notifications', { token: owner })).body.notifications.length, 1);
    assert.equal((await request('/api/payment-notifications', { token: other })).body.notifications.length, 1);
    assert.deepEqual(financeSnapshot(), before, 'legacy account SMS are also read-only');
    const push = await request('/api/payment-notifications/tbank', { body: payload });
    assert.equal(push.body.notification.status, 'applied', JSON.stringify(push));
    assert.notEqual(push.body.notification.id, sms.body.notification.id);
    assert.equal((await request('/api/student-payment-balances', { token: owner })).body.students[0].received, 2000);
    const paid = financeSnapshot();
    const afterPush = await request('/api/payment-notifications/tbank/sms', { body: { ...payload, id: 'sms-after-push' } });
    assert.equal(afterPush.body.notification.status, 'duplicate'); assert.deepEqual(financeSnapshot(), paid);
    const unknown = await request('/api/payment-notifications/tbank/sms', { body: { ...payload, id: 'unknown', text: 'Пополнение, счет RUB. 500 ₽. Неизвестный П. Доступно 5000 ₽' } });
    assert.equal(unknown.body.notification.status, 'pending'); assert.equal(unknown.body.notification.studentId, ''); assert.deepEqual(financeSnapshot(), paid);
    const outgoing = await request('/api/payment-notifications/tbank/sms', { body: { ...payload, id: 'outgoing', text: 'Покупка 500 ₽' } });
    assert.equal(outgoing.body.notification.status, 'ignored'); assert.deepEqual(financeSnapshot(), paid);
    const admin = (await request('/api/login', { body: { code: 'admin-7264' } })).body.token;
    const setupResponse = await fetch(base + '/api/teacher-subscription', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` }, body: JSON.stringify({ teacherId: 'other', monthlyFee: 3000, payerName: 'Пётр П.' }) });
    assert.equal(setupResponse.status, 200);
    const platformBefore = financeSnapshot();
    const platformPayload = { ...payload, id: 'platform-sms', text: 'Пополнение. +3000 ₽ от Петр П.' };
    const platformSms = await request('/api/payment-notifications/tbank/sms', { body: platformPayload });
    assert.equal(platformSms.body.notification.status, 'pending'); assert.equal(platformSms.body.notification.paymentTarget, 'student');
    assert.deepEqual(financeSnapshot(), platformBefore, 'SMS must not pay a matched platform subscription');
    const platformPush = await request('/api/payment-notifications/tbank', { body: platformPayload });
    assert.equal(platformPush.body.notification.status, 'applied'); assert.equal(platformPush.body.notification.paymentTarget, 'teacher-platform');
  } finally {
    if (child && child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; }
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('payment-sms-review-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
