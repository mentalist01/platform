import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('SMS review: private previews, explicit credit/link, retries, late pushes, stale data and projection recovery', { timeout: 90000 }, async () => {
  const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-actions-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const read = name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'));
  const raw = name => fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8');
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const at = `${day(0)}T10:40:00Z`;
  write('teachers', [{ id: 'owner', code: 'sms-actions-owner', name: 'Owner' }, { id: 'other', code: 'sms-actions-other', name: 'Other' }]);
  write('students', [{ id: 'stepan', teacherId: 'owner', name: 'Степан', code: 'sms-actions-student' },
    { id: 'untouched', teacherId: 'owner', name: 'Other pupil', code: 'sms-actions-untouched' },
    { id: 'foreign', teacherId: 'other', name: 'Foreign pupil', code: 'sms-actions-foreign' }]);
  write('tests', {}); write('teacher-calendar-marks', {});
  write('teacher-finances', { owner: { studentProfiles: { stepan: { lessonPrice: 2000 }, untouched: { lessonPrice: 2000 } } } });
  write('progress', Object.fromEntries(['stepan', 'untouched', 'foreign'].map(studentId => [studentId, {
    schedule: [-2, -1, 0, 1, 2, 3, 4, 5].map((offset, index) => ({ id: `${studentId}-lesson-${index}`, studentId,
      date: day(offset), time: '13:00', durationMinutes: 60 })), homeworks: [], progress: {}, solvedByTask: {}, solvedEvents: [], mocks: [],
  }])));
  write('payment-sender-links', { owner: { links: { александрс: { studentId: 'stepan', senderName: 'Александр С', senderKey: 'александрс' } } },
    other: { links: { александрс: { studentId: 'foreign', senderName: 'Александр С', senderKey: 'александрс' } } } });
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
  const base = `http://127.0.0.1:${port}`;
  let child, logs = '';
  const start = async () => {
    child = spawn(process.execPath, ['server/index.js'], { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
      DISABLE_STARTUP_XP_REBALANCE: '1', COLLAB_PERSISTENCE: '0', MACRODROID_PAYMENT_SECRET: '',
    } });
    child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      assert.equal(child.exitCode, null, logs);
      try { if ((await fetch(`${base}/api/availability`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(logs);
  };
  const stop = async () => { if (child && child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; } };
  const request = async (route, token, body) => {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  const ok = async (...args) => { const r = await request(...args); assert.ok(r.status >= 200 && r.status < 300, JSON.stringify(r) + '\n' + logs); return r.body; };
  try {
    await start();
    const token = (await ok('/api/login', '', { code: 'sms-actions-owner' })).token;
    const other = (await ok('/api/login', '', { code: 'sms-actions-other' })).token;
    const student = (await ok('/api/login', '', { code: 'sms-actions-student' })).token;
    const secret = (await ok('/api/teacher-payment-connection', token, {})).connection.secret;
    const preview = await ok('/api/student-payment-balances', token);
    await ok('/api/student-payment-balances/enable', token, { previewToken: preview.previewToken });
    const untouched = JSON.stringify(read('teacher-finances').owner.studentPaymentBalances.accounts.untouched);
    const wallet = () => read('teacher-finances').owner.studentPaymentBalances.accounts.stepan;
    const received = () => wallet().entries.reduce((sum, entry) => sum + entry.creditCents, 0) / 100;
    const snapshot = () => ['teacher-finances', 'teacher-calendar-marks', 'payment-notifications'].map(raw);
    const payment = (id, amount = 6000) => ({ secret, id, title: 'T-Bank', text: `Пополнение, счет RUB. ${amount} ₽. Александр С. Доступно ${10000 + amount + id.length} ₽`, receivedAt: at });
    const sms = async (id, amount) => (await ok('/api/payment-notifications/tbank/sms', '', payment(id, amount))).notification;
    const route = id => `/api/payment-notifications/${encodeURIComponent(id)}/review`;
    const first = await sms('first');
    assert.equal(received(), 0);
    // Older SMS rows have no explicit marker. The trusted historical reason preserves the action.
    const legacy = read('payment-notifications'); delete legacy.items[0].reviewSource; write('payment-notifications', legacy);
    const before = snapshot();
    const review = await request(route(first.id), token);
    assert.equal(review.status, 200); assert.equal(review.cache, 'no-store');
    assert.equal(review.body.notification.reviewSource, 'sms');
    assert.equal(review.body.candidates.length, 0); assert.equal(review.body.student.studentName, 'Степан');
    assert.deepEqual(snapshot(), before, 'opening review must not write finance, marks or notifications');
    assert.ok([401, 403].includes((await request(route(first.id))).status));
    assert.equal((await request(route(first.id), student)).status, 403);
    assert.equal((await request(route(first.id), other)).status, 404);
    assert.equal((await request(`${route(first.id)}?teacherId=other`, token)).status, 403);
    assert.equal((await request(route(first.id), token, { mode: 'new' })).status, 400);
    assert.deepEqual(snapshot(), before);
    const confirm = { mode: 'new', confirmed: true, previewToken: review.body.previewToken, amount: 999999,
      studentId: 'foreign' }; // Amount and target come exclusively from the saved SMS.
    assert.equal((await request(route(first.id), other, confirm)).status, 404);
    assert.equal((await request(route(first.id), student, confirm)).status, 403);
    assert.equal((await request(route(first.id), token, { ...confirm, teacherId: 'other' })).status, 403);
    const malformed = await fetch(base + route(first.id), { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
    }, body: '{"confirmed":true' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(snapshot(), before);
    const concurrent = await Promise.all([ok(route(first.id), token, confirm), ok(route(first.id), token, confirm)]);
    assert.equal(received(), 6000);
    assert.equal(concurrent[0].notification.status, 'applied');
    assert.equal(concurrent[0].notification.markKeys.length, 3);
    assert.equal(concurrent[1].alreadyResolved, true);
    assert.equal(concurrent[1].receivedAmount, 0);
    assert.equal(wallet().entries.filter(entry => entry.reviewNotificationId === first.id).length, 1);
    assert.equal((await ok(route(first.id), token)).alreadyResolved, true);
    assert.equal((await request(route(first.id), token, { mode: 'link', confirmed: true, receiptEntryId: 'invalid' })).status, 409);
    // Same economic payment, a bank push delayed by a day, must not create new money.
    const push = (await ok('/api/payment-notifications/tbank', '', { ...payment('delayed-push'), receivedAt: `${day(1)}T10:40:00Z` })).notification;
    assert.equal(push.status, 'pending'); assert.equal(received(), 6000);
    const manual = wallet().entries.find(entry => entry.receiptId === `manual:sms:${first.id}`);
    await ok('/api/student-payment-balances/stepan/confirm', token, { notificationId: push.id, manualEntryId: manual.id });
    assert.equal(received(), 6000);
    assert.equal(read('payment-notifications').items.find(entry => entry.id === push.id).status, 'duplicate');
    const bank = (await ok('/api/payment-notifications/tbank', '', payment('second-bank', 2000))).notification;
    assert.equal(bank.status, 'applied'); assert.equal(received(), 8000);
    assert.equal((await request(route(bank.id), token)).status, 400);
    const linkedSms = await sms('second-sms', 2000);
    const linkPreview = await ok(route(linkedSms.id), token);
    assert.equal(linkPreview.candidates.length, 1);
    const linkBefore = received(), marksBefore = raw('teacher-calendar-marks');
    assert.equal((await request(route(linkedSms.id), token, { mode: 'new', confirmed: true, previewToken: linkPreview.previewToken })).body.code, 'sms_review_existing_receipt');
    assert.equal((await request(route(linkedSms.id), token, { mode: 'link', confirmed: true, previewToken: linkPreview.previewToken, receiptEntryId: manual.id })).status, 400);
    const linked = await ok(route(linkedSms.id), token, { mode: 'link', confirmed: true, previewToken: linkPreview.previewToken, receiptEntryId: linkPreview.candidates[0].entryId });
    assert.equal(linked.notification.status, 'duplicate'); assert.equal(received(), linkBefore);
    assert.equal(raw('teacher-calendar-marks'), marksBefore);
    const staleSms = await sms('stale-sms-record', 1000);
    const stale = await ok(route(staleSms.id), token);
    await ok('/api/student-payment-balances/stepan/receipts', token, { idempotencyKey: 'external-manual-receipt', amount: 1000, receivedAt: at });
    const staleBefore = received();
    assert.equal((await request(route(staleSms.id), token, { mode: 'new', confirmed: true, confirmedSeparate: true, previewToken: stale.previewToken })).body.code, 'sms_review_stale');
    assert.equal(received(), staleBefore);
    const refreshed = await ok(route(staleSms.id), token);
    await ok(route(staleSms.id), token, { mode: 'new', confirmed: true, confirmedSeparate: true, previewToken: refreshed.previewToken });
    assert.equal(received(), staleBefore + 1000, 'only an explicit separate-payment confirmation can add another equal amount');
    // Simulate a lost notification projection after the wallet commit, then restart and retry.
    const brokenProjection = read('payment-notifications');
    const firstProjection = brokenProjection.items.find(entry => entry.id === first.id);
    Object.assign(firstProjection, { status: 'pending', reason: 'SMS от банка: требуется ручная проверка.', reviewedAt: '', markKeys: [] });
    write('payment-notifications', brokenProjection);
    const recoveryBefore = received(), receiptsBefore = wallet().entries.length;
    await stop(); await start();
    const recovery = await ok(route(first.id), token);
    assert.equal(recovery.alreadyResolved, false); assert.equal(recovery.recovery.mode, 'new');
    const repaired = await ok(route(first.id), token, confirm);
    assert.equal(repaired.notification.status, 'applied'); assert.equal(repaired.alreadyResolved, true);
    assert.equal(received(), recoveryBefore); assert.equal(wallet().entries.length, receiptsBefore);
    assert.equal(JSON.stringify(read('teacher-finances').owner.studentPaymentBalances.accounts.untouched), untouched);
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('sms-actions-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
