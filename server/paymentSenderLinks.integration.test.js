import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('payer collisions cannot replace another student and explicit manual review survives reloads without paying lessons', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-sender-conflict-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const read = name => JSON.parse(fs.readFileSync(path.join(data, `${name}.json`), 'utf8'));
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
  const createdAt = `${day}T00:00:00.000Z`;
  write('teachers', [{ id: 'owner', name: 'Первый', code: '191911' }, { id: 'other', name: 'Второй', code: '191912' }]);
  write('students', [
    { id: 'first', teacherId: 'owner', name: 'Миша', nickname: 'МишаКод', code: '191913' },
    { id: 'second', teacherId: 'owner', name: 'Саша', nickname: 'СашаКод', code: '191914' },
    { id: 'foreign', teacherId: 'other', name: 'Чужой', code: '191915' },
  ]);
  write('payment-sender-links', { owner: { links: { ольгак: { senderName: 'Ольга К', senderKey: 'ольгак', studentId: 'first', createdAt, updatedAt: createdAt } } } });
  write('teacher-finances', { owner: { studentProfiles: { first: { lessonPrice: 2000 }, second: { lessonPrice: 2000 } } } });
  write('teacher-calendar-marks', {});
  write('teacher-subscriptions', {});
  write('progress', Object.fromEntries(['first', 'second'].map(studentId => [studentId, {
    progress: {}, homeworks: [], solvedByTask: {}, solvedEvents: [], mocks: [],
    schedule: [{ id: `${studentId}-lesson`, studentId, date: day, time: '10:00', durationMinutes: 60, subject: 'Python', createdAt }],
  }])));
  write('payment-notifications', { items: [{ id: 'old-receipt', teacherId: 'owner', studentId: 'first', senderName: 'Ольга К', amount: 2000, status: 'applied', markKeys: ['old-mark'], receivedAt: createdAt, createdAt }] });
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  const base = `http://127.0.0.1:${port}`;
  let child, logs = '';
  const request = async (route, token, body, method = body ? 'PATCH' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };
  const start = async () => {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', MACRODROID_PAYMENT_SECRET: 'fixture-payer-secret', PAYMENT_NOTIFICATION_TEACHER_ID: 'owner' } });
    child.stdout.on('data', value => { logs += value; }); child.stderr.on('data', value => { logs += value; });
    const until = Date.now() + 20000;
    while (Date.now() < until) { try { if ((await fetch(base + '/api/availability')).ok) return; } catch {} if (child.exitCode !== null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error('Fixture startup timed out');
  };
  const stop = async () => { if (child && child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; } };
  const protectedSnapshot = () => JSON.stringify(['teacher-finances', 'teacher-calendar-marks', 'teacher-subscriptions', 'payment-notifications', 'progress'].map(read));
  try {
    await start();
    const owner = (await request('/api/login', '', { code: '191911' }, 'POST')).body.token;
    const other = (await request('/api/login', '', { code: '191912' }, 'POST')).body.token;
    const pupil = (await request('/api/login', '', { code: '191913' }, 'POST')).body.token;
    const change = (body, token = owner) => request('/api/payment-sender-links', token, body);
    await t.test('collisions and the student-name shortcut return 409 and leave all stored data untouched', async () => {
      const before = JSON.stringify(read('payment-sender-links')), money = protectedSnapshot();
      for (const senderName of ['Ольга К', '  ОЛЬГА  К. ', 'Ольга\u00a0К']) {
        const result = await change({ senderName, studentId: 'second' });
        assert.equal(result.status, 409); assert.equal(result.body.code, 'PAYMENT_SENDER_NAME_CONFLICT');
        assert.equal(result.body.conflict.studentId, 'first'); assert.equal(result.body.conflict.studentName, 'МишаКод');
      }
      assert.equal((await change({ senderName: 'Ольга К', studentName: 'Саша' })).status, 409);
      assert.equal(JSON.stringify(read('payment-sender-links')), before); assert.equal(protectedSnapshot(), money);
    });
    await t.test('same-student edits work; teachers have separate names and cannot view or change foreign links', async () => {
      assert.equal((await change({ senderName: 'Ольга К.', studentId: 'first' })).status, 200);
      assert.equal(read('payment-sender-links').owner.links.ольгак.createdAt, createdAt);
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'foreign' }, other)).status, 200);
      const foreignBefore = JSON.stringify(read('payment-sender-links').other);
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'foreign' })).status, 403);
      assert.equal((await change({ teacherId: 'other', senderName: 'Ольга К', studentId: 'foreign', manualReview: true })).status, 409);
      assert.equal(JSON.stringify(read('payment-sender-links').other), foreignBefore);
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'first' }, pupil)).status, 403);
      assert.equal((await request('/api/payment-sender-links')).status, 401);
      assert.ok((await request('/api/payment-sender-links', owner)).cache.includes('no-store'));
    });
    await t.test('two concurrent saves cannot claim the same new payer', async () => {
      const results = await Promise.all(['first', 'second'].map(studentId => change({ senderName: 'Марина П', studentId })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const winningId = results.find(result => result.status === 200).body.links.find(link => link.senderKey === 'маринап').studentId;
      assert.equal(read('payment-sender-links').owner.links.маринап.studentId, winningId);
    });
    await t.test('manual mode validates type and the expected binding; it never silently changes the student', async () => {
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'first', manualReview: 'true' })).status, 400);
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'second', manualReview: true })).status, 409);
      assert.equal((await change({ senderName: 'Нет Такого', studentId: 'first', manualReview: true })).status, 404);
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'first', manualReview: true, unset: true })).status, 400);
      const money = protectedSnapshot();
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'first', manualReview: true })).status, 200);
      assert.equal(protectedSnapshot(), money);
      assert.equal(read('payment-sender-links').owner.links.ольгак.studentId, 'first');
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'second' })).status, 409);
    });
    const hook = body => request('/api/payment-notifications/tbank', '', { secret: 'fixture-payer-secret', title: 'Т-Банк', receivedAt: `${day}T07:01:00Z`, ...body }, 'POST');
    await t.test('future payments wait for manual review even when a nickname is in the notification; no financial marks change', async () => {
      const money = JSON.stringify(['teacher-finances', 'teacher-calendar-marks', 'teacher-subscriptions', 'progress'].map(read));
      const result = await hook({ notificationId: 'manual-1', text: 'Пополнение +2 000 ₽ от Ольга К. МишаКод' });
      assert.equal(result.status, 202); assert.equal(result.body.notification.status, 'pending');
      assert.equal(result.body.notification.studentId, ''); assert.equal(result.body.notification.markKeys.length, 0);
      assert.match(result.body.notification.reason, /ручная проверка/);
      assert.equal(JSON.stringify(['teacher-finances', 'teacher-calendar-marks', 'teacher-subscriptions', 'progress'].map(read)), money);
      assert.equal(read('payment-notifications').items.find(row => row.id === 'old-receipt').status, 'applied');
      const repeated = await hook({ notificationId: 'manual-1', text: 'Пополнение +2 000 ₽ от Ольга К. МишаКод' });
      assert.equal(repeated.body.notification.id, result.body.notification.id);
      assert.equal(read('payment-notifications').items.filter(row => row.id === result.body.notification.id).length, 1);
    });
    await t.test('manual mode persists across restart and ordinary old-client saves; explicit resume restores existing allocation', async () => {
      await stop(); await start();
      assert.equal((await request('/api/payment-sender-links', owner)).body.links.find(link => link.senderKey === 'ольгак').manualReview, true);
      await change({ senderName: 'Ольга К', studentId: 'first' });
      assert.equal(read('payment-sender-links').owner.links.ольгак.manualReview, true);
      assert.equal((await change({ senderName: 'Ольга К', studentId: 'first', manualReview: false })).status, 200);
      const applied = await hook({ notificationId: 'automatic-2', text: 'Перевод +2 000 ₽ от Ольга К' });
      assert.equal(applied.body.notification.status, 'applied', applied.body.notification.reason); assert.equal(applied.body.notification.studentId, 'first');
      assert.equal(applied.body.notification.markKeys.length, 1);
      assert.equal(read('payment-notifications').items.find(row => row.id === 'old-receipt').status, 'applied');
    });
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('payment-sender-conflict-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
