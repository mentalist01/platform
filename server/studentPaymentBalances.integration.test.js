import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = code => { const salt = 'student-wallet-test'; return `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`; };
const shift = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const mark = (teacher, student, event) => `${teacher}:${event.id}:${event.date}:${student}:${event.time}:paid`;
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });

test('wallet API: migration, isolation, receipts, duplicates, manual review, undo, cancellation, and restart', { timeout: 90000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'student-wallet-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, data) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(data));
  const read = name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`)));
  const createdAt = '2025-01-01T00:00:00.000Z';
  const past = shift(-4), next = shift(-2), future = shift(2);
  const romanOld = shift(-11), romanMoved = shift(-6), romanNext = shift(-1);
  const romanGoogleId = date => `google-ical-${crypto.createHash('sha1').update(`owner:roman-series:${date}T14:00:00.000Z`).digest('hex').slice(0, 18)}`;
  const romanMark = date => `owner:${romanGoogleId(date)}:${date}:roman:17:00:paid`;
  const stamp = date => `${date.replaceAll('-', '')}T140000Z`;
  let calendarFailed = false;
  const ical = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:roman-series', `DTSTART:${stamp(romanOld)}`,
    `DTEND:${stamp(romanOld).replace('140000', '150000')}`, 'RRULE:FREQ=WEEKLY;COUNT=1', 'SUMMARY:Roman', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:roman-series', `RECURRENCE-ID:${stamp(romanOld)}`, `DTSTART:${stamp(romanMoved)}`,
    `DTEND:${stamp(romanMoved).replace('140000', '150000')}`, 'SUMMARY:Roman', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  const calendar = http.createServer((_req, res) => { res.writeHead(calendarFailed ? 503 : 200, { 'Content-Type': 'text/calendar' }); res.end(calendarFailed ? 'Unavailable' : ical); });
  await new Promise(resolve => calendar.listen(0, '127.0.0.1', resolve));
  const calendarUrl = `http://127.0.0.1:${calendar.address().port}/calendar.ics`;
  const lessons = [past, next, future, shift(4)].map((date, index) => ({ id: `lesson-${index}`, studentId: 'student-owner', date, time: '18:00', durationMinutes: 60, subject: 'Python', createdAt }));
  write('teachers', ['owner', 'second'].map(id => ({ id, name: id, codeHash: hash(`wallet-${id}-login`), createdAt })));
  write('students', [...['owner', 'second'].map(id => ({ id: `student-${id}`, teacherId: id, name: 'Dima', code: `wallet-student-${id}`, grade: '11', createdAt, studyStatus: 'active' })), { id: 'roman', teacherId: 'owner', name: 'Roman', code: 'wallet-roman-login', grade: '11', createdAt }]);
  write('tests', {});
  write('progress', { 'student-owner': { schedule: lessons, progress: {}, homeworks: [], solvedByTask: {}, solvedEvents: [], mocks: [] }, 'student-second': { schedule: [{ ...lessons[0], studentId: 'student-second', id: 'second-lesson' }], progress: {}, homeworks: [], solvedByTask: {}, solvedEvents: [], mocks: [] } });
  const progress = read('progress');
  progress.roman = { schedule: [{ id: 'roman-next', studentId: 'roman', date: romanNext, time: '17:00', durationMinutes: 60, createdAt }], homeworks: [], progress: {}, solvedByTask: {}, solvedEvents: [], mocks: [] };
  write('progress', progress);
  write('teacher-finances', { owner: { studentProfiles: { 'student-owner': { lessonPrice: 2000 }, roman: { lessonPrice: 2000 } }, months: { [past.slice(0, 7)]: { students: { 'student-owner': { paidAmount: 2000, lessonPrice: 2000 }, roman: { paidAmount: 4000, lessonPrice: 2000 } } } } }, second: { studentProfiles: { 'student-second': { lessonPrice: 2000 } } } });
  write('teacher-calendar-marks', { owner: { [mark('owner', 'student-owner', lessons[0])]: createdAt, [romanMark(romanOld)]: createdAt, [romanMark(romanMoved)]: createdAt } });
  write('teacher-calendar-sync', { owner: { enabled: true, icalUrl: calendarUrl, updatedAt: createdAt } });
  write('payment-sender-links', Object.fromEntries(['owner', 'second'].map(id => [id, { links: { иванп: { senderName: 'Иван П', senderKey: 'иванп', studentId: `student-${id}`, createdAt, updatedAt: createdAt } } }])));
  const conflictLessons = [past, next].map((date, i) => ({ id: `conflict-${i}`, studentId: 'conflict', date, time: '19:00', durationMinutes: 60, createdAt }));
  write('students', [...read('students'), { id: 'conflict', teacherId: 'owner', name: 'Legacy', code: 'wallet-conflict-login', createdAt }]);
  write('progress', { ...read('progress'), conflict: { schedule: conflictLessons, progress: {}, homeworks: [], solvedByTask: {}, solvedEvents: [], mocks: [] } });
  const conflictFinance = read('teacher-finances'); conflictFinance.owner.studentProfiles.conflict = { lessonPrice: 2000 }; write('teacher-finances', conflictFinance);
  const conflictMarks = read('teacher-calendar-marks'); conflictMarks.owner[mark('owner', 'conflict', conflictLessons[0])] = createdAt; write('teacher-calendar-marks', conflictMarks);
  const links = read('payment-sender-links'); links.owner.links.legacy = { senderName: 'Legacy', senderKey: 'legacy', studentId: 'conflict', createdAt, updatedAt: createdAt }; write('payment-sender-links', links);
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  let child, logs = '';
  const start = async () => {
    child = spawn(process.execPath, ['server/index.js'], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, PORT: String(port), NODE_ENV: 'test', TZ: 'Europe/Moscow', PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow', PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1',
      STUDENT_SCHEDULE_PAYMENT_TRACKING_START_DAY_KEY: '2025-01-01', MACRODROID_PAYMENT_SECRET: '',
    } });
    child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(base + '/api/client-build-version')).ok) return; } catch { /* Wait for startup. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(logs);
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve)); child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
  };
  const request = async (route, { token, body, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const ok = async (route, args) => { const result = await request(route, args); assert.ok(result.status >= 200 && result.status < 300, `${route}: ${JSON.stringify(result)}`); return result.body; };
  try {
    await start();
    const token = (await ok('/api/login', { body: { code: 'wallet-owner-login' } })).token;
    const secondToken = (await ok('/api/login', { body: { code: 'wallet-second-login' } })).token;
    const studentToken = (await ok('/api/login', { body: { code: 'wallet-student-owner' } })).token;
    assert.equal((await request('/api/student-payment-balances', { token: studentToken })).status, 403);
    assert.equal((await request('/api/student-payment-balances?teacherId=second', { token })).status, 403);
    const before = fs.readFileSync(path.join(dataDir, 'teacher-finances.json'), 'utf8');
    let data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.enabled, false); assert.equal(data.preview, true);
    assert.equal(data.students[0].received, 2000); assert.equal(data.students[0].allocated, 2000);
    assert.equal(fs.readFileSync(path.join(dataDir, 'teacher-finances.json'), 'utf8'), before, 'preview is read-only');
    assert.equal((await request('/api/student-payment-balances/enable', { token, body: { previewToken: 'stale' } })).status, 409);
    data = await ok('/api/student-payment-balances/enable', { token, body: { previewToken: data.previewToken } });
    assert.equal(data.enabled, true); assert.equal(data.students[0].received, 2000);
    assert.ok(data.conflicts.some(row => row.studentId === 'conflict'), 'unverified legacy totals are not migrated');
    const roman = data.students.find(row => row.studentId === 'roman');
    assert.equal(roman.received, 4000); assert.equal(roman.allocated, 4000); assert.equal(roman.issues.length, 0);
    assert.equal(data.marks[romanMark(romanOld)], undefined, 'obsolete moved occurrence no longer spends money');
    assert.ok(data.marks[`owner:roman-next:${romanNext}:roman:17:00:paid`], 'released duplicate pays the next debt');
    assert.ok(fs.readdirSync(dataDir).some(name => name.startsWith('student-balances-before-owner-')));
    const secondSnapshot = JSON.stringify(read('teacher-finances').second);
    const secondPreview = await ok('/api/student-payment-balances', { token: secondToken });
    await ok('/api/student-payment-balances/enable', { token: secondToken, body: { previewToken: secondPreview.previewToken } });
    const secret = (await ok('/api/teacher-payment-connection', { token, body: {} })).connection.secret;
    const secondSecret = (await ok('/api/teacher-payment-connection', { token: secondToken, body: {} })).connection.secret;
    const legacyPayment = await ok('/api/payment-notifications/tbank', { body: { id: 'legacy-after-migration', secret, title: 'Т-Банк', text: 'Пополнение на 2000 ₽, счет RUB. Legacy. Доступно 500 000 ₽', receivedAt: new Date().toISOString() } });
    assert.equal(legacyPayment.notification.status, 'applied', 'excluded student keeps legacy bank processing');
    const legacyKey = legacyPayment.notification.markKeys[0];
    const legacyAllocation = Object.values(read('teacher-finances').owner.paymentAllocations).find(row => row.currentMarkKey === legacyKey);
    assert.ok(legacyAllocation);
    await ok('/api/teacher-calendar-marks', { token, method: 'PATCH', body: { unset: [legacyKey] } });
    assert.equal(read('teacher-finances').owner.paymentAllocations[legacyAllocation.originMarkKey]?.status, 'refunded', 'legacy manual undo still invalidates allocation');
    const hook = (id, amount, key = secret) => ok('/api/payment-notifications/tbank', { body: { id, secret: key, title: 'Т-Банк', text: `Пополнение на ${amount} ₽, счет RUB. Иван П. Доступно 500 000 ₽`, receivedAt: new Date().toISOString() } });
    const repeated = await Promise.all([hook('one-transfer', 2000), hook('one-transfer', 2000)]);
    assert.ok(repeated.some(r => r.notification.status === 'applied'));
    data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.students[0].received, 4000); assert.equal(data.students[0].allocated, 4000);
    assert.ok(data.marks[mark('owner', 'student-owner', lessons[1])], 'past debt precedes future lesson');
    assert.equal((await ok('/api/student-payment-balances', { token: secondToken })).students[0].received, 0, 'other teacher unchanged');
    await hook('one-transfer', 2000, secondSecret);
    assert.equal((await ok('/api/student-payment-balances', { token: secondToken })).students[0].received, 2000, 'same sender and transfer ID isolated by teacher');
    assert.notEqual(JSON.stringify(read('teacher-finances').second), secondSnapshot);
    const receiptRoute = '/api/student-payment-balances/student-owner/receipts';
    const manual = { idempotencyKey: 'manual-4000-test', amount: 4000, senderName: 'Иван П', receivedAt: new Date().toISOString() };
    await ok(receiptRoute, { token, body: manual });
    data = await ok(receiptRoute, { token, body: manual });
    assert.equal(data.students[0].received, 8000);
    assert.equal((await request(receiptRoute, { token, body: { ...manual, idempotencyKey: 'another-manual-test' } })).status, 409, 'manual duplicate requires explicit confirmation');
    const pending = await hook('manual-bank-transfer', 4000);
    assert.equal(pending.notification.status, 'pending');
    data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.students[0].received, 8000);
    const review = data.students[0].pending[0];
    data = await ok('/api/student-payment-balances/student-owner/confirm', { token, body: { notificationId: review.id, manualEntryId: review.manualReceiptIds[0] } });
    assert.equal(data.students[0].received, 8000); assert.equal(data.students[0].pending.length, 0);
    await hook('manual-bank-transfer', 4000);
    assert.equal((await ok('/api/student-payment-balances', { token })).students[0].received, 8000);
    const paidKey = mark('owner', 'student-owner', lessons[0]);
    await ok('/api/teacher-lesson-payment', { token, body: { occurrence: lessons[0], paid: false } });
    data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.marks[paidKey], undefined); assert.equal(data.students[0].available, 2000);
    await ok('/api/teacher-lesson-payment', { token, body: { occurrence: lessons[0], paid: true } });
    assert.equal((await request('/api/teacher-calendar-marks', { token, method: 'PATCH', body: { set: { 'owner:invented:2026-10-01:student-owner:18:00:paid': createdAt } } })).status, 409);
    await ok('/api/teacher-calendar-cancellations', { token, method: 'PATCH', body: { occurrence: lessons[2], cancelled: true } });
    data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.marks[mark('owner', 'student-owner', lessons[2])], undefined);
    assert.equal(data.students[0].received, 8000); assert.equal(data.students[0].available, 2000);
    assert.equal((await request(receiptRoute, { token: secondToken, body: { ...manual, idempotencyKey: 'cross-teacher' } })).status, 403);
    await ok(receiptRoute, { token, body: { ...manual, amount: 160000, idempotencyKey: 'annual-prepayment' } });
    data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.students[0].received, 168000); assert.equal(data.students[0].available, 162000);
    const movedLocal = { ...lessons[1], date: shift(8), time: '17:00' };
    await ok(`/api/student-schedule/${lessons[1].id}`, { token, method: 'PUT', body: movedLocal });
    data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.marks[mark('owner', 'student-owner', lessons[1])], undefined);
    assert.ok(data.marks[mark('owner', 'student-owner', movedLocal)], 'local edit carries the paid allocation');
    assert.equal(data.students[0].available, 162000);
    await ok(`/api/student-schedule/${lessons[3].id}?studentId=student-owner`, { token, method: 'DELETE' });
    data = await ok('/api/student-payment-balances', { token });
    assert.equal(data.marks[mark('owner', 'student-owner', lessons[3])], undefined);
    assert.equal(data.students[0].available, 164000, 'explicit local deletion returns money');
    await stop(); await start();
    const newToken = (await ok('/api/login', { body: { code: 'wallet-owner-login' } })).token;
    data = await ok('/api/student-payment-balances', { token: newToken });
    assert.equal(data.students[0].received, 168000, 'journal survives restart');
    calendarFailed = true;
    await ok('/api/teacher-calendar-sync', { token: newToken, method: 'PATCH', body: { icalUrl: calendarUrl, enabled: true } });
    const deferred = await ok('/api/student-payment-balances', { token: newToken });
    assert.equal(deferred.students[0].received, 168000);
    assert.equal(deferred.students[0].allocated, data.students[0].allocated, 'calendar outage does not free reserved funds');
    assert.equal(deferred.students.find(row => row.studentId === 'roman').allocated, 4000);
    assert.ok(deferred.students[0].issues.some(issue => !issue.markKey));
    const activeFinance = read('teacher-finances');
    const pausedFinance = structuredClone(activeFinance); pausedFinance.owner.studentProfiles['student-owner'].pricingMode = 'monthly'; write('teacher-finances', pausedFinance);
    assert.equal((await hook('paused-wallet-transfer', 2100)).notification.status, 'pending', 'paused wallet never falls back to a second accounting system');
    assert.equal((await request(receiptRoute, { token: newToken, body: { ...manual, idempotencyKey: 'paused-manual-receipt' } })).status, 409);
    assert.equal(read('teacher-finances').owner.studentPaymentBalances.accounts['student-owner'].entries.length, activeFinance.owner.studentPaymentBalances.accounts['student-owner'].entries.length);
    write('teacher-finances', activeFinance);
    const valid = read('teacher-finances');
    const corrupt = structuredClone(valid); corrupt.owner.studentPaymentBalances.version = 99; write('teacher-finances', corrupt);
    assert.equal((await request('/api/student-payment-balances', { token: newToken })).status, 503);
    assert.equal(read('teacher-finances').owner.studentPaymentBalances.version, 99, 'corruption is not reset');
    write('teacher-finances', valid);
  } finally {
    await stop();
    calendar.closeAllConnections(); await new Promise(resolve => calendar.close(resolve));
    if (root.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && path.basename(root).startsWith('student-wallet-')) fs.rmSync(root, { recursive: true, force: true });
  }
});
