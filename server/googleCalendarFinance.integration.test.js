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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '..');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => (error ? reject(error) : resolve(port)));
  });
});

const waitForServer = async (baseUrl, child, getLogs) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before startup.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The test server can refuse connections while Express is starting.
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

const stopHttpServer = async (server) => {
  if (!server?.listening) return;
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};

const assertStatus = async (response, expectedStatus) => {
  if (response.status === expectedStatus) return;
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
};

const buildCodeHash = (code) => {
  const salt = Buffer.from('google-calendar-finance-range-test-salt').toString('base64');
  const hash = crypto.scryptSync(code, salt, 64).toString('base64');
  return `scrypt$${salt}$${hash}`;
};

const login = async (baseUrl, code) => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  await assertStatus(response, 200);
  const session = await response.json();
  return `Bearer ${session.token}`;
};

const toIcalUtc = (dayKey, hour) => (
  `${dayKey.replaceAll('-', '')}T${String(hour).padStart(2, '0')}0000Z`
);

const shiftUtcDayKey = (dayKey, dayOffset) => {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
};

const startFakeIcalServer = async (icalBody) => {
  const server = http.createServer((req, res) => {
    if (req.url !== '/calendar.ics') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(icalBody);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    server,
    url: `http://127.0.0.1:${port}/calendar.ics`,
  };
};

test('finance loads Google Calendar through the end of a selected distant month', {
  timeout: 40_000,
}, async () => {
  const teacherId = 'teacher-finance-range';
  const studentId = 'student-finance-range';
  const legacyStudentId = 'student-finance-legacy';
  const now = new Date();
  const selectedMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 1));
  const selectedMonth = selectedMonthDate.toISOString().slice(0, 7);
  const selectedYear = selectedMonthDate.getUTCFullYear();
  const selectedMonthIndex = selectedMonthDate.getUTCMonth();
  const selectedMonthLastDay = new Date(Date.UTC(selectedYear, selectedMonthIndex + 1, 0))
    .toISOString()
    .slice(0, 10);
  const legacyCancelledDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    10
  )).toISOString().slice(0, 10);
  assert.ok(
    Date.parse(`${selectedMonthLastDay}T17:00:00.000Z`) > Date.now() + (120 * 24 * 60 * 60 * 1000),
    'the regression event must be beyond the default Google Calendar horizon'
  );

  const fakeIcal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ivan EGE//Google calendar finance range integration test//EN',
    'X-WR-CALNAME:Finance range calendar',
    'BEGIN:VEVENT',
    'UID:far-finance@example.test',
    `DTSTAMP:${toIcalUtc(now.toISOString().slice(0, 10), 10)}`,
    `DTSTART:${toIcalUtc(selectedMonthLastDay, 17)}`,
    `DTEND:${toIcalUtc(selectedMonthLastDay, 18)}`,
    'SUMMARY:Student Finance',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:legacy-paid-cancelled@example.test',
    `DTSTAMP:${toIcalUtc(now.toISOString().slice(0, 10), 10)}`,
    `DTSTART:${toIcalUtc(legacyCancelledDay, 17)}`,
    `DTEND:${toIcalUtc(legacyCancelledDay, 18)}`,
    'SUMMARY:Legacy Student',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-google-finance-range-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  let child = null;
  let calendarServer = null;
  let serverLogs = '';
  try {
    const fakeCalendar = await startFakeIcalServer(fakeIcal);
    calendarServer = fakeCalendar.server;
    const nowIso = now.toISOString();
    fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
      id: teacherId,
      name: 'Teacher Finance',
      codeHash: buildCodeHash('teacher-finance-range-code'),
      createdAt: nowIso,
    }]));
    fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([
      {
        id: studentId,
        name: 'Student Finance',
        teacherId,
        code: 'student-finance-range-code',
        grade: '11',
        createdAt: nowIso,
        deletedAt: null,
        studyStatus: 'active',
      },
      {
        id: legacyStudentId,
        name: 'Legacy Student',
        teacherId,
        code: 'student-finance-legacy-code',
        grade: '11',
        createdAt: nowIso,
        deletedAt: null,
        studyStatus: 'active',
      },
    ]));
    fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
      [studentId]: {
        progress: {},
        notes: '',
        mocks: [],
        schedule: [],
        solvedByTask: {},
        solvedEvents: [],
        nextLesson: null,
        homeworks: [],
      },
      [legacyStudentId]: {
        progress: {},
        notes: '',
        mocks: [],
        schedule: [],
        solvedByTask: {},
        solvedEvents: [],
        nextLesson: null,
        homeworks: [],
      },
    }));
    fs.writeFileSync(path.join(dataDir, 'teacher-calendar-sync.json'), JSON.stringify({
      [teacherId]: {
        enabled: true,
        icalUrl: fakeCalendar.url,
        updatedAt: nowIso,
        lastFetchedAt: '',
        lastError: '',
        calendarName: '',
      },
    }));
    fs.writeFileSync(path.join(dataDir, 'teacher-finances.json'), JSON.stringify({
      [teacherId]: {
        studentProfiles: {
          [studentId]: {
            pricingMode: 'perLesson',
            lessonPrice: 2000,
            commissionAmount: 0,
            monthlyRate: 0,
            plannedLessons: 0,
            paymentDay: null,
            note: '',
          },
          [legacyStudentId]: {
            pricingMode: 'perLesson',
            lessonPrice: 2000,
            commissionAmount: 0,
            monthlyRate: 0,
            plannedLessons: 0,
            paymentDay: null,
            note: '',
          },
        },
        months: {},
        lessonLedger: {},
      },
    }));

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        TZ: 'Europe/Moscow',
        PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow',
        PLATFORM_DATA_DIR: dataDir,
        PLATFORM_UPLOADS_DIR: uploadsDir,
        PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'json-backups'),
        COLLAB_PERSISTENCE: '0',
        DISABLE_STARTUP_XP_REBALANCE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    child.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    await waitForServer(baseUrl, child, () => serverLogs);

    const authorization = await login(baseUrl, 'teacher-finance-range-code');
    const warmCacheResponse = await fetch(`${baseUrl}/api/teacher-schedule`, {
      headers: { Authorization: authorization },
    });
    await assertStatus(warmCacheResponse, 200);
    const warmSchedule = await warmCacheResponse.json();
    const legacyEntry = warmSchedule.find((entry) => (
      entry.externalEventId === 'legacy-paid-cancelled@example.test'
    ));
    assert.ok(legacyEntry, 'nearby legacy Google event must be available for migration');
    assert.notEqual(legacyEntry.id, legacyEntry.externalEventId);
    const legacyScope = `student:${legacyStudentId}`;
    const cancellationMarkKey = [
      'calendar-cancelled',
      encodeURIComponent(teacherId),
      encodeURIComponent(legacyEntry.externalEventId),
      legacyEntry.date,
      encodeURIComponent(legacyScope),
      legacyEntry.time,
    ].join('|');
    const legacyPaidMarkKey = [
      teacherId,
      legacyEntry.id,
      legacyEntry.date,
      legacyStudentId,
      legacyEntry.time,
      'paid',
    ].join(':');
    fs.writeFileSync(path.join(dataDir, 'teacher-calendar-marks.json'), JSON.stringify({
      [teacherId]: {
        [cancellationMarkKey]: nowIso,
        [legacyPaidMarkKey]: nowIso,
      },
    }));

    const financeResponse = await fetch(
      `${baseUrl}/api/teacher-finance?month=${encodeURIComponent(selectedMonth)}`,
      { headers: { Authorization: authorization } }
    );
    await assertStatus(financeResponse, 200);
    const finance = await financeResponse.json();
    assert.equal(finance.month, selectedMonth);
    assert.equal(finance.calendarPlan.month, selectedMonth);
    assert.equal(finance.calendarPlan.remaining.lessonCount, 1);
    assert.equal(finance.calendarPlan.remaining.revenue, 2000);
    assert.equal(finance.calendarPlan.remaining.workingDayCount, 1);
    assert.equal(finance.calendarPlan.total.lessonCount, 1);
    assert.equal(finance.summary.availableCredit, 2000);
    assert.equal(
      finance.students.find((entry) => entry.id === legacyStudentId).availableCredit,
      2000
    );
    const storedMarks = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'teacher-calendar-marks.json'), 'utf8')
    );
    assert.ok(storedMarks[teacherId][cancellationMarkKey]);
    assert.equal(storedMarks[teacherId][legacyPaidMarkKey], undefined);
    const storedFinance = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'teacher-finances.json'), 'utf8')
    );
    assert.equal(storedFinance[teacherId].paymentAllocationMigrationVersion, 1);
    const allocations = Object.values(storedFinance[teacherId].paymentAllocations || {});
    assert.equal(allocations.length, 1);
    assert.equal(allocations[0].status, 'credit');
    assert.equal(allocations[0].sourceEntryId, legacyEntry.id);
    assert.equal(allocations[0].amount, 2000);
  } finally {
    await stopServer(child);
    await stopHttpServer(calendarServer);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});

test('former namesake keeps historical Google events matched by exact nickname', {
  timeout: 40_000,
}, async () => {
  const teacherId = 'teacher-calendar-namesakes';
  const currentStudentId = 'student-current-nikita';
  const formerStudentId = 'student-former-nikita';
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const formerLessonDay = shiftUtcDayKey(today, -14);
  const currentLessonDay = shiftUtcDayKey(today, 1);
  const formerCreatedAt = new Date(now.getTime() - (120 * 24 * 60 * 60 * 1000)).toISOString();

  const fakeIcal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ivan EGE//Google calendar namesake integration test//EN',
    'X-WR-CALNAME:Namesake calendar',
    'BEGIN:VEVENT',
    'UID:former-nikita@example.test',
    `DTSTAMP:${toIcalUtc(today, 10)}`,
    `DTSTART:${toIcalUtc(formerLessonDay, 16)}`,
    `DTEND:${toIcalUtc(formerLessonDay, 17)}`,
    'SUMMARY:Никита 2000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:current-nikita@example.test',
    `DTSTAMP:${toIcalUtc(today, 10)}`,
    `DTSTART:${toIcalUtc(currentLessonDay, 16)}`,
    `DTEND:${toIcalUtc(currentLessonDay, 17)}`,
    'SUMMARY:Никита1 пробное (мама Оксана)',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-google-namesakes-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  let child = null;
  let calendarServer = null;
  let serverLogs = '';
  try {
    const fakeCalendar = await startFakeIcalServer(fakeIcal);
    calendarServer = fakeCalendar.server;
    const nowIso = now.toISOString();
    fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
      id: teacherId,
      name: 'Teacher Namesakes',
      codeHash: buildCodeHash('teacher-calendar-namesakes-code'),
      createdAt: formerCreatedAt,
    }]));
    fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([
      {
        id: currentStudentId,
        name: 'Никита',
        nickname: 'Никита1',
        teacherId,
        code: 'student-current-nikita-code',
        grade: 11,
        studyStatus: 'active',
        createdAt: nowIso,
        deletedAt: null,
      },
      {
        id: formerStudentId,
        name: 'Никита',
        nickname: 'Никита 2000',
        teacherId,
        code: 'student-former-nikita-code',
        grade: 'graduate',
        studyStatus: 'inactive',
        createdAt: formerCreatedAt,
        deletedAt: null,
      },
    ]));
    fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
      [currentStudentId]: {
        progress: {},
        notes: '',
        mocks: [],
        schedule: [],
        solvedByTask: {},
        solvedEvents: [],
        nextLesson: null,
        homeworks: [],
      },
      [formerStudentId]: {
        progress: {},
        notes: '',
        mocks: [],
        schedule: [],
        solvedByTask: {},
        solvedEvents: [],
        nextLesson: null,
        homeworks: [],
      },
    }));
    fs.writeFileSync(path.join(dataDir, 'teacher-calendar-sync.json'), JSON.stringify({
      [teacherId]: {
        enabled: true,
        icalUrl: fakeCalendar.url,
        updatedAt: nowIso,
        lastFetchedAt: '',
        lastError: '',
        calendarName: '',
      },
    }));
    fs.writeFileSync(path.join(dataDir, 'teacher-finances.json'), JSON.stringify({}));

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        TZ: 'Europe/Moscow',
        PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow',
        PLATFORM_DATA_DIR: dataDir,
        PLATFORM_UPLOADS_DIR: uploadsDir,
        PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'json-backups'),
        COLLAB_PERSISTENCE: '0',
        DISABLE_STARTUP_XP_REBALANCE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    child.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    await waitForServer(baseUrl, child, () => serverLogs);

    const authorization = await login(baseUrl, 'teacher-calendar-namesakes-code');
    const scheduleResponse = await fetch(`${baseUrl}/api/teacher-schedule`, {
      headers: { Authorization: authorization },
    });
    await assertStatus(scheduleResponse, 200);
    const schedule = await scheduleResponse.json();
    const formerEntry = schedule.find((entry) => entry.externalEventId === 'former-nikita@example.test');
    const currentEntry = schedule.find((entry) => entry.externalEventId === 'current-nikita@example.test');
    assert.equal(formerEntry?.studentId, formerStudentId);
    assert.equal(currentEntry?.studentId, currentStudentId);

    const currentStudentScheduleResponse = await fetch(
      `${baseUrl}/api/student-schedule?studentId=${encodeURIComponent(currentStudentId)}`,
      { headers: { Authorization: authorization } }
    );
    await assertStatus(currentStudentScheduleResponse, 200);
    const currentStudentSchedule = await currentStudentScheduleResponse.json();
    assert.equal(
      currentStudentSchedule.some((entry) => entry.subject === 'Никита 2000'),
      false,
    );
  } finally {
    await stopServer(child);
    await stopHttpServer(calendarServer);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});
