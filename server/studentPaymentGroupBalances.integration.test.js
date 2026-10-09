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
const hash = code => { const salt = 'group-wallet-test'; return `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`; };
const day = days => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date(Date.now() + days * 86400000));
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });

// Also used by local UI verification; every store is isolated from real money.
export async function createGroupWalletFixture({ port: requestedPort } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-wallet-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const read = name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`)));
  const createdAt = '2025-01-01T00:00:00.000Z';
  write('teachers', [{ id: 'owner', name: 'Учитель для проверки', codeHash: hash('group-wallet-teacher'), createdAt },
    { id: 'second', name: 'Другой учитель', codeHash: hash('group-wallet-second'), createdAt }]);
  const ids = ['egor', 'anna', 'monthly', 'subscription'];
  write('students', ids.map(id => ({ id, teacherId: 'owner', name: { egor: 'Егор', anna: 'Анна', monthly: 'Месячный тариф', subscription: 'Абонемент' }[id],
    code: `group-wallet-${id}`, grade: '11', studyStatus: 'active', createdAt })));
  write('tests', {}); write('mock-exams', []);
  write('progress', Object.fromEntries(ids.map(id => [id, { schedule: [], homeworks: [], progress: {}, solvedByTask: {}, solvedEvents: [], mocks: [] }])));
  write('learning-groups', [{ id: 'group', teacherId: 'owner', name: 'Группа 2', status: 'active', startedAt: createdAt, createdAt,
    pricePerLesson: 1000, members: ids.map(studentId => ({ studentId, status: 'active', joinedAt: createdAt })) }]);
  const lessons = [['past', -2], ['future', 2]].map(([id, offset]) => ({ id, groupId: 'group', teacherId: 'owner', participantIds: ids,
    startAt: `${day(offset)}T20:00:00+03:00`, durationMinutes: 60, topic: `Занятие ${id}`, source: 'availability-plan', scheduleEntryId: `seed:${id}`,
    status: offset < 0 ? 'completed' : 'scheduled', createdAt, updatedAt: createdAt, ...(offset < 0 ? { completedAt: `${day(offset)}T21:00:00+03:00` } : {}) }));
  write('learning-lesson-sessions', lessons);
  write('learning-subscriptions', { version: 1, tariffs: {}, blocks: [{ id: 'block', teacherId: 'owner', studentId: 'subscription', groupId: 'group',
    tariff: { id: 'group-main', kind: 'group', price: 9600, lessonCount: 8 }, startsAt: `${day(-3)}T00:00:00+03:00`, accessUntil: `${day(40)}T23:59:59+03:00`,
    createdAt, lessonIds: ['past', 'future'], payment: null, consultations: [], cancelledAt: '' }] });
  const date = day(-2);
  const rawMark = `owner:learning-group-session-past:${date}:egor:20:00:paid`;
  const canonicalMark = `owner:learning-group-session-past:egor:${date}:egor:20:00:paid`;
  write('teacher-calendar-marks', { owner: { [rawMark]: createdAt, [canonicalMark]: createdAt } });
  // A retained old monthly rate must not disable a current per-lesson tariff.
  write('teacher-finances', { owner: { studentProfiles: { egor: { lessonPrice: 900, pricingMode: 'perLesson', monthlyRate: 8000 }, monthly: { pricingMode: 'monthly', monthlyRate: 8000 } },
    months: { [date.slice(0, 7)]: { students: { egor: { lessonPrice: 900, paidAmount: 900 } } } } } });
  write('payment-sender-links', { owner: { links: { аннап: { senderName: 'Анна П', senderKey: 'аннап', studentId: 'anna', createdAt, updatedAt: createdAt } } } });
  const port = requestedPort || await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: {
    ...process.env, PORT: String(port), NODE_ENV: 'test', TZ: 'Europe/Moscow', PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow', PLATFORM_DATA_DIR: dataDir,
    PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1',
    STUDENT_SCHEDULE_PAYMENT_TRACKING_START_DAY_KEY: '2025-01-01', MACRODROID_PAYMENT_SECRET: '', LEARNING_GROUPS_ENABLED: '1', LEARNING_GROUP_RTC_ENABLED: '0',
  } });
  let logs = '';
  child.stdout.on('data', value => { logs += value; }); child.stderr.on('data', value => { logs += value; });
  const stop = async ({ keep = false } = {}) => {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve)); child.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
    }
    if (!keep && root.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && path.basename(root).startsWith('group-wallet-')) fs.rmSync(root, { recursive: true, force: true });
  };
  const request = async (route, { token, body, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const ok = async (route, args) => { const result = await request(route, args); assert.ok(result.status >= 200 && result.status < 300, `${route}: ${JSON.stringify(result)}`); return result.body; };
  try {
    const until = Date.now() + 20000;
    while (true) {
      if (child.exitCode !== null || Date.now() > until) throw new Error(logs);
      try { if ((await fetch(base + '/api/client-build-version')).ok) break; } catch { /* Wait for startup. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return { base, root, dataDir, child, lessons, canonicalMark, rawMark, write, read, request, ok, stop };
  } catch (error) { await stop(); throw error; }
}

if (process.env.GROUP_WALLET_UI_FIXTURE !== '1') test('pupil calendar reads the paid group-plan alias when the same booking is imported from Google', { timeout: 60000 }, async () => {
  const f = await createGroupWalletFixture();
  try {
    const date = f.lessons[0].startAt.slice(0, 10);
    const progress = f.read('progress');
    progress.egor.schedule = [{ id: 'google-student-egor', studentId: 'egor', groupId: 'group', isLearningGroupEvent: true,
      participantIds: ['egor', 'anna'], date, time: '20:00', durationMinutes: 60,
      source: 'google-calendar', externalEventId: 'event-past', lessonId: 'past', createdAt: '2025-01-01T00:00:00Z' }];
    f.write('progress', progress);
    const marksBefore = f.read('teacher-calendar-marks');
    const teacher = (await f.ok('/api/login', { body: { code: 'group-wallet-teacher' } })).token;
    await f.ok('/api/teacher-schedule', { token: teacher }); // Normalize the legacy fixture before the comparison.
    const egor = (await f.ok('/api/login', { body: { code: 'group-wallet-egor' } })).token;
    const anna = (await f.ok('/api/login', { body: { code: 'group-wallet-anna' } })).token;
    await f.ok('/api/student-schedule', { token: egor });
    const financeBefore = f.read('teacher-finances');
    const rows = await f.ok('/api/student-schedule', { token: egor });
    const booking = rows.find(row => row.date === date && row.groupId === 'group');
    assert.ok(booking); assert.equal(booking.id, 'google-student-egor');
    assert.equal(booking.payment.statesByDate[date].paid, true);
    assert.equal(booking.payment.statesByDate[date].status, 'paid');
    assert.ok([f.rawMark, f.canonicalMark].includes(booking.payment.statesByDate[date].paidMarkKey));
    const otherRows = await f.ok('/api/student-schedule', { token: anna });
    assert.equal(otherRows.find(row => row.date === date && row.groupId === 'group').payment.statesByDate[date].paid, false);
    const calendar = await f.ok('/api/teacher-schedule', { token: teacher });
    assert.equal(calendar.find(row => row.lessonId === 'past').memberPaymentStatuses.find(row => row.studentId === 'egor').paid, true);
    assert.deepEqual(f.read('teacher-calendar-marks'), marksBefore);
    assert.deepEqual(f.read('teacher-finances'), financeBefore, 'viewing a paid alias creates no new payment or price change');
  } finally { await f.stop(); }
});

if (process.env.GROUP_WALLET_UI_FIXTURE !== '1') test('group pricing preserves completed quotes and prepayments while repricing unpaid future lessons', { timeout: 60000 }, async () => {
  const f = await createGroupWalletFixture();
  const { ok, read, write } = f;
  try {
    const pastDay = f.lessons.find(lesson => lesson.id === 'past').startAt.slice(0, 10);
    const month = pastDay.slice(0, 7);
    const pastKey = id => `${id}:${pastDay}:20:00:60`;
    const finance = read('teacher-finances');
    finance.owner.studentProfiles.anna = { lessonPrice: 900, pricingMode: 'perLesson' };
    finance.owner.months[month].students.egor.paidAmount = 1000;
    finance.owner.months[month].students.anna = { lessonPrice: 900, pricingMode: 'perLesson', paidAmount: 0 };
    finance.owner.lessonLedger = Object.fromEntries(['egor', 'anna'].map(studentId => [pastKey(studentId), {
      studentId, dayKey: pastDay, time: '20:00', durationMinutes: 60, lessonPrice: 1000,
      paid: studentId === 'egor', sourceEntryId: `learning-group-session-past:${studentId}`,
      sourceSignature: `${studentId}:${pastDay}:20:00:60`, recordedAt: f.lessons[0].completedAt,
    }]));
    write('teacher-finances', finance);
    const token = (await ok('/api/login', { body: { code: 'group-wallet-teacher' } })).token;
    const loadFinance = () => ok(`/api/teacher-finance?month=${month}`, { token });
    const future = (await ok('/api/teacher-schedule', { token })).find(lesson => lesson.lessonId === 'future');
    assert.ok(future);
    const futurePrices = async () => (await ok('/api/teacher-schedule', { token }))
      .find(lesson => lesson.lessonId === 'future').memberPaymentStatuses;
    const price = (statuses, id) => statuses.find(status => status.studentId === id).lessonPrice;

    await loadFinance();
    let persisted = read('teacher-finances').owner;
    assert.equal(persisted.lessonLedger[pastKey('egor')].lessonPrice, 1000, 'paid completed group price remains historical');
    assert.equal(persisted.lessonLedger[pastKey('anna')].lessonPrice, 1000, 'unpaid completed group debt retains its quote');
    assert.equal(persisted.months[month].students.egor.paidAmount, 1000);
    assert.equal(price(await futurePrices(), 'anna'), 900, 'future unpaid lesson uses the personal group rate');
    await ok('/api/teacher-lesson-payment', { token, body: { occurrence: { ...future, studentId: 'egor' }, paid: true } });
    const beforeTariff = read('teacher-finances').owner;
    const beforeMarks = read('teacher-calendar-marks');
    const cash = entry => Object.fromEntries(Object.entries(entry.months).map(([key, value]) => [key,
      Object.fromEntries(Object.entries(value.students).map(([id, record]) => [id, record.paidAmount])),
    ]));
    const oldCash = cash(beforeTariff);
    const oldAllocations = beforeTariff.paymentAllocations;
    for (const studentId of ['anna', 'egor']) {
      await ok(`/api/teacher-finance/students/${studentId}`, { token, method: 'PATCH',
        body: { month, pricingMode: 'perLesson', lessonPrice: 1100 } });
    }
    for (let attempt = 0; attempt < 2; attempt += 1) await loadFinance();
    persisted = read('teacher-finances').owner;
    assert.equal(persisted.lessonLedger[pastKey('egor')].lessonPrice, 1000);
    assert.equal(persisted.lessonLedger[pastKey('anna')].lessonPrice, 1000);
    const statuses = await futurePrices();
    assert.equal(price(statuses, 'anna'), 1100, 'new rate changes the future unpaid group lesson');
    assert.equal(price(statuses, 'egor'), 900, 'future prepayment retains the rate used for its payment');
    const futureDay = f.lessons.find(lesson => lesson.id === 'future').startAt.slice(0, 10);
    assert.ok(!Object.values(persisted.lessonLedger).some(lesson => lesson.dayKey === futureDay),
      'finance reads only materialize completed lessons, so unpaid future rates are not frozen');
    assert.deepEqual(cash(persisted), oldCash, 'tariff edits and repeated finance reads do not modify received cash');
    assert.deepEqual(persisted.paymentAllocations, oldAllocations, 'tariff edits do not modify payment allocations');
    assert.deepEqual(read('teacher-calendar-marks'), beforeMarks, 'tariff edits do not modify payment marks');
    assert.equal(persisted.studentPaymentBalances, null, 'pricing reads do not enable or migrate wallets');

    // An explicit correction of an erroneous historical quote is retained too;
    // neither the current 1100 rate nor subsequent reads undo the corrected 900.
    const correctedFinance = read('teacher-finances');
    for (const studentId of ['egor', 'anna']) correctedFinance.owner.lessonLedger[pastKey(studentId)].lessonPrice = 900;
    write('teacher-finances', correctedFinance);
    for (let attempt = 0; attempt < 2; attempt += 1) await loadFinance();
    persisted = read('teacher-finances').owner;
    assert.equal(persisted.lessonLedger[pastKey('egor')].lessonPrice, 900, 'corrected paid historical price remains 900');
    assert.equal(persisted.lessonLedger[pastKey('anna')].lessonPrice, 900, 'corrected unpaid historical price remains 900');
    assert.equal(price(await futurePrices(), 'anna'), 1100, 'historical correction leaves the current future rate unchanged');
    assert.deepEqual(cash(persisted), oldCash, 'quote correction does not rewrite received cash');
    assert.deepEqual(persisted.paymentAllocations, oldAllocations, 'quote correction does not rewrite payment allocations');
    assert.deepEqual(read('teacher-calendar-marks'), beforeMarks, 'quote correction does not rewrite payment marks');
  } finally { await f.stop(); }
});

if (process.env.GROUP_WALLET_UI_FIXTURE !== '1') test('group wallets preserve migration, individual rates, receipts, marks, moves and refunds', { timeout: 90000 }, async () => {
  const f = await createGroupWalletFixture();
  const { ok, request, read, canonicalMark, rawMark } = f;
  try {
    const token = (await ok('/api/login', { body: { code: 'group-wallet-teacher' } })).token;
    const studentToken = (await ok('/api/login', { body: { code: 'group-wallet-egor' } })).token;
    const secondToken = (await ok('/api/login', { body: { code: 'group-wallet-second' } })).token;
    const row = (data, id) => data.students.find(s => s.studentId === id);
    const load = () => ok('/api/student-payment-balances', { token });
    const before = JSON.stringify(read('teacher-finances'));
    let data = await load();
    assert.equal(JSON.stringify(read('teacher-finances')), before, 'preview cannot mutate legacy money');
    assert.equal(row(data, 'egor').received, 900); assert.equal(row(data, 'egor').allocated, 900);
    assert.equal(row(data, 'egor').paidLessons, 1, 'teacher and student aliases import one payment');
    assert.equal(row(data, 'anna').received, 0);
    assert.deepEqual(data.conflicts.map(r => r.studentId).sort(), ['monthly', 'subscription']);
    data = await ok('/api/student-payment-balances/enable', { token, body: { previewToken: data.previewToken } });
    assert.ok(data.marks[canonicalMark]); assert.equal(data.marks[rawMark], undefined);
    assert.equal(row(data, 'egor').received, 900); assert.equal(row(data, 'egor').allocated, 900);
    const receipt = (id, amount, key) => ok(`/api/student-payment-balances/${id}/receipts`, { token, body: { amount, idempotencyKey: key, receivedAt: new Date().toISOString() } });
    data = await receipt('egor', 900, 'egor-manual-900');
    assert.equal(row(data, 'egor').allocated, 1800); assert.equal(row(data, 'egor').paidLessons, 2);
    assert.equal(row(data, 'anna').allocated, 0, 'one member payment cannot pay another member');
    data = await receipt('anna', 1000, 'anna-manual-1000');
    assert.equal(row(data, 'anna').allocated, 1000); assert.equal(row(data, 'egor').received, 1800);
    const secret = (await ok('/api/teacher-payment-connection', { token, body: {} })).connection.secret;
    const bank = await ok('/api/payment-notifications/tbank', { body: { id: 'anna-bank-1100', secret, title: 'Т-Банк', text: 'Пополнение на 1100 ₽, счет RUB. Анна П. Доступно 500 000 ₽', receivedAt: new Date().toISOString() } });
    assert.equal(bank.notification.status, 'applied');
    data = await load(); assert.equal(row(data, 'anna').received, 2100); assert.equal(row(data, 'anna').allocated, 2000); assert.equal(row(data, 'anna').available, 100);
    const events = await ok('/api/teacher-schedule', { token });
    const future = events.find(e => e.lessonId === 'future');
    assert.ok(future);
    assert.equal(future.memberPaymentStatuses.find(r => r.studentId === 'egor').lessonPrice, 900);
    await ok('/api/teacher-lesson-payment', { token, body: { occurrence: { ...future, studentId: 'egor' }, paid: false } });
    data = await load(); assert.equal(row(data, 'egor').available, 900); assert.equal(row(data, 'anna').available, 100);
    await ok('/api/teacher-lesson-payment', { token, body: { occurrence: { ...future, studentId: 'egor' }, paid: true } });
    assert.equal(row(await load(), 'egor').available, 0);
    assert.equal((await request('/api/teacher-lesson-payment', { token: secondToken, body: { occurrence: { ...future, studentId: 'egor' }, paid: true } })).status, 403);
    assert.equal((await request('/api/student-payment-balances/egor/receipts', { token: studentToken, body: { amount: 900, idempotencyKey: 'student-forbidden' } })).status, 403);
    assert.equal((await request('/api/student-payment-balances/monthly/receipts', { token, body: { amount: 900, idempotencyKey: 'monthly-forbidden' } })).status, 409);
    assert.equal((await request('/api/student-payment-balances/subscription/receipts', { token, body: { amount: 900, idempotencyKey: 'subscription-forbidden' } })).status, 409);
    await ok('/api/teacher-calendar-cancellations', { token, method: 'PATCH', body: { occurrence: future, cancelled: true } });
    data = await load(); assert.equal(row(data, 'egor').available, 900); assert.equal(row(data, 'anna').available, 1100);
    assert.equal(row(data, 'egor').received, 1800); assert.equal(row(data, 'anna').received, 2100);
    const movedDay = day(6);
    await ok('/api/learning-groups/group/lessons/past', { token, method: 'PATCH', body: { startAt: `${movedDay}T19:00:00+03:00` } });
    data = await load();
    assert.equal(row(data, 'egor').allocated, 900); assert.equal(row(data, 'egor').available, 900);
    assert.equal(row(data, 'anna').allocated, 1000); assert.equal(row(data, 'anna').available, 1100);
    assert.equal(data.marks[canonicalMark], undefined);
    assert.ok(Object.keys(data.marks).some(k => k.includes(`${movedDay}:egor:19:00:paid`)), 'group move retains individual payment');
    assert.equal(row(data, 'egor').issues.length, 0);
    assert.equal(row(await load(), 'egor').paidLessons, 1, 'reconciliation repeats without creating charges');
    const cashTotal = id => Object.values(read('teacher-finances').owner.months).reduce((sum, m) => sum + (m.students[id]?.paidAmount || 0), 0);
    assert.equal(cashTotal('egor'), 1800); assert.equal(cashTotal('anna'), 2100);
    const adjustmentRoute = '/api/student-payment-balances/anna/adjustments';
    const adjust = body => ok(adjustmentRoute, { token, body });
    const base = { reason: 'Компенсация ученику', mode: 'add', amount: 200, expectedAvailable: 1100, idempotencyKey: 'anna-credit-adjustment' };
    assert.equal((await request(adjustmentRoute, { token: studentToken, body: base })).status, 403);
    assert.equal((await request(adjustmentRoute, { token: secondToken, body: base })).status, 403);
    for (const id of ['monthly', 'subscription']) {
      assert.equal((await request(`/api/student-payment-balances/${id}/adjustments`, { token,
        body: { ...base, expectedAvailable: 0, idempotencyKey: `${id}-no-correction` } })).status, 409);
    }
    assert.equal((await request(adjustmentRoute, { token, body: { ...base, reason: '' } })).status, 400);
    data = await adjust(base); assert.equal(row(data, 'anna').available, 1300); assert.equal(row(data, 'anna').received, 2100);
    data = await adjust(base); assert.equal(row(data, 'anna').available, 1300, 'idempotent correction retry');
    assert.equal((await request(adjustmentRoute, { token, body: { ...base, expectedAvailable: 1100, idempotencyKey: 'anna-stale-adjustment' } })).status, 409);
    assert.equal((await request(adjustmentRoute, { token, body: { ...base, mode: 'subtract', amount: 1400, expectedAvailable: 1300, idempotencyKey: 'anna-too-large-adjustment' } })).status, 409);
    data = await adjust({ ...base, mode: 'subtract', amount: 50, expectedAvailable: 1300, idempotencyKey: 'anna-subtract-adjustment' });
    assert.equal(row(data, 'anna').available, 1250);
    data = await adjust({ ...base, mode: 'set', amount: 1500, expectedAvailable: 1250, idempotencyKey: 'anna-set-adjustment' });
    assert.equal(row(data, 'anna').available, 1500); assert.equal(row(data, 'anna').received, 2100);
    assert.equal(cashTotal('anna'), 2050, 'subtract correction removes fifty free cash rubles; bonus credits never create cash income');
    assert.equal(row(data, 'egor').available, 900, 'correction is personal');
    assert.equal((await request('/api/teacher-calendar-marks', { token, method: 'PATCH', body: {
      set: { [`owner:invented:${movedDay}:egor:19:00:paid`]: new Date().toISOString() },
    } })).status, 409, 'group wallet paid marks cannot invent another payment');
    const nativeLesson = (await ok('/api/learning-groups/group/lessons', { token, body: {
      startAt: `${day(8)}T18:00:00+03:00`, durationMinutes: 60, topic: 'Прямое занятие группы', participantIds: ['egor', 'anna'],
    } })).lesson;
    data = await load();
    assert.equal(row(data, 'egor').allocated, 1800); assert.equal(row(data, 'anna').allocated, 2000);
    await ok(`/api/learning-groups/group/lessons/${nativeLesson.id}`, { token, method: 'PATCH', body: { status: 'cancelled' } });
    data = await load();
    assert.equal(row(data, 'egor').allocated, 900); assert.equal(row(data, 'egor').available, 900);
    assert.equal(row(data, 'anna').allocated, 1000); assert.equal(row(data, 'anna').available, 1500);
    assert.equal(row(data, 'egor').received, 1800); assert.equal(row(data, 'anna').received, 2100);
    assert.equal(cashTotal('anna'), 2050, 'native group cancellation returns allocation without changing cash correction');
  } finally { await f.stop(); }
});
