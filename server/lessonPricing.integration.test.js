import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '..');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});

const waitForServer = async (baseUrl, child, getLogs) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before startup.\n${getLogs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The test server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start in time.\n${getLogs()}`);
};

const stopServer = async (child) => {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const buildCodeHash = (code) => {
  const salt = Buffer.from('lesson-pricing-integration-salt').toString('base64');
  const hash = crypto.scryptSync(code, salt, 64).toString('base64');
  return `scrypt$${salt}$${hash}`;
};

const jsonRequest = async (baseUrl, pathname, { token = '', method = 'GET', body } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: token } : {}),
      ...(typeof body === 'undefined' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(typeof body === 'undefined' ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${pathname} returned ${response.status}: ${text}`);
  }
  return payload;
};

test('duration billing: calendar, debt, manual payment, undo, historical prices, and access control', { timeout: 60_000 }, async () => {
  const teacherId = 'price-teacher';
  const studentId = 'price-student';
  const now = new Date();
  const past = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Keep both past lessons in a complete month, even on the first day of a month.
  past.setUTCDate(0);
  const pastDay = past.toISOString().slice(0, 10);
  past.setUTCDate(past.getUTCDate() - 1);
  const pastDay2 = past.toISOString().slice(0, 10);
  const future = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 5));
  const dates = [5, 12, 19].map((day) => { future.setUTCDate(day); return future.toISOString().slice(0, 10); });
  const month = dates[0].slice(0, 7);
  const pastMonth = pastDay.slice(0, 7);
  const createdAt = '2025-01-01T00:00:00.000Z';
  const schedule = [
    { id: 'past-hour', date: pastDay, durationMinutes: 60 },
    { id: 'past-long', date: pastDay2, durationMinutes: 90 },
    ...dates.map((date, index) => ({ id: `future-${index}`, date, durationMinutes: index ? 90 : 60 })),
  ].map((entry) => ({ ...entry, studentId, time: '12:00', subject: 'Python', createdAt }));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-pricing-'));
  const dataDir = path.join(tempRoot, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, data) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(data));
  write('teachers.json', [{ id: teacherId, name: 'Teacher Price', codeHash: buildCodeHash('price-teacher-login'), createdAt }]);
  write('students.json', [{ id: studentId, teacherId, name: 'Student Price', code: 'price-student-login', createdAt, grade: '11', studyStatus: 'active' }]);
  write('tests.json', {});
  write('progress.json', { [studentId]: { schedule, progress: {}, homeworks: [], solvedByTask: {}, solvedEvents: [], mocks: [] } });
  write('teacher-finances.json', { [teacherId]: {
    studentProfiles: { [studentId]: { pricingMode: 'perHour', lessonPrice: 2000 } },
    months: { [month]: { students: { [studentId]: { pricingMode: 'perHour', lessonPrice: 2000 } } } },
  } });
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', TZ: 'Europe/Moscow', PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow',
      PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(tempRoot, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'backups'),
      COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', STUDENT_SCHEDULE_PAYMENT_TRACKING_START_DAY_KEY: '2025-01-01' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  try {
    await waitForServer(baseUrl, child, () => logs);
    const session = await jsonRequest(baseUrl, '/api/login', { method: 'POST', body: { code: 'price-teacher-login' } });
    const token = `Bearer ${session.token}`;
    const finance = (selected = month) => jsonRequest(baseUrl, `/api/teacher-finance?month=${selected}`, { token });
    const setPrice = (pricingMode, lessonPrice) => jsonRequest(baseUrl, `/api/teacher-finance/students/${studentId}`, { token, method: 'PATCH', body: { month, pricingMode, lessonPrice } });
    const pay = (index, paid) => jsonRequest(baseUrl, '/api/teacher-lesson-payment', { token, method: 'POST', body: { occurrence: schedule[index], paid } });
    let result = await finance();
    assert.equal(result.calendarPlan.total.revenue, 8000, '60 + 90 + 90 minutes at 2000/hour');
    assert.equal(result.students[0].metrics.plannedRevenue, 8000);
    result = await finance(pastMonth);
    assert.equal(result.calendarPlan.total.revenue, 5000);
    assert.equal(result.students[0].metrics.outstanding, 5000, 'past debt comes from both scheduled durations');
    const payment = await pay(3, true);
    assert.equal(payment.amount, 3000);
    await pay(3, true);
    assert.equal((await finance()).students[0].record.paidAmount, 3000, 'idempotent retry');
    result = await setPrice('per90Minutes', 2700);
    assert.equal(result.calendarPlan.total.revenue, 7500, '1800 + prepaid 3000 + new 2700');
    assert.equal(result.calendarPlan.actual.revenue, 3000);
    result = await finance(pastMonth);
    assert.equal(result.calendarPlan.total.revenue, 5000, 'past prices do not change');
    const undo = await pay(3, false);
    assert.equal(undo.amount, 3000, 'undo uses the original payment, not the new rate');
    await pay(3, false);
    result = await finance();
    assert.equal(result.students[0].record.paidAmount, 0);
    assert.equal(result.calendarPlan.actual.revenue, 0);
    assert.equal(result.calendarPlan.total.revenue, 7200);
    assert.equal((await pay(3, true)).amount, 2700);
    await setPrice('perLesson', 2000);
    assert.equal((await pay(4, true)).amount, 2000, 'fixed price ignores 90-minute duration');
    assert.equal((await pay(3, false)).amount, 2700);

    const studentSession = await jsonRequest(baseUrl, '/api/login', { method: 'POST', body: { code: 'price-student-login' } });
    const denied = await fetch(`${baseUrl}/api/teacher-lesson-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentSession.token}` }, body: JSON.stringify({ teacherId, occurrence: schedule[2], paid: true }) });
    assert.equal(denied.status, 403, 'students cannot change payments');
    await assert.rejects(() => jsonRequest(baseUrl, '/api/teacher-lesson-payment', { token, method: 'POST', body: { occurrence: { ...schedule[2], id: 'invented' }, paid: true } }), /404/);
  } finally {
    await stopServer(child);
    const resolved = path.resolve(tempRoot);
    if (resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && path.basename(resolved).startsWith('lesson-pricing-')) fs.rmSync(resolved, { recursive: true, force: true });
  }
});
