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
      // The socket is expected to refuse connections while the server boots.
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
  const salt = Buffer.from('google-calendar-homework-sync-test-salt').toString('base64');
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

const buildGoogleStudentScheduleId = ({ teacherId, studentId, externalEventId, date, time }) => {
  const stableId = crypto
    .createHash('sha1')
    .update(`${teacherId}:${studentId}:${externalEventId}:${date}:${time}`)
    .digest('hex')
    .slice(0, 18);
  return `google-student-${stableId}`;
};

const buildStoredGoogleLesson = ({ teacherId, studentId, studentName, externalEventId, date }) => ({
  id: buildGoogleStudentScheduleId({
    teacherId,
    studentId,
    externalEventId,
    date,
    time: '20:00',
  }),
  date,
  day: 'Понедельник',
  weekdayKey: 'monday',
  weekdayOrder: 1,
  excludedDates: [],
  time: '20:00',
  durationMinutes: 60,
  subject: 'Занятие',
  note: '',
  boardLink: '',
  lessonLink: '',
  source: 'google-calendar',
  isGoogleCalendarSync: true,
  externalCalendarProvider: 'Google Calendar',
  externalEventId,
  externalCalendarName: 'Integration calendar',
  googleCalendarTitle: studentName,
  createdAt: `${date}T17:00:00.000Z`,
  updatedAt: `${date}T17:00:00.000Z`,
});

const shiftDayKey = (dayKey, days) => {
  const date = new Date(`${dayKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const toIcalUtc = (dayKey, hour) => (
  `${dayKey.replaceAll('-', '')}T${String(hour).padStart(2, '0')}0000Z`
);

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

test('homework read and teacher refresh cascade deleted Google lessons into day plans', {
  timeout: 40_000,
}, async () => {
  const teacherId = 'teacher-a';
  const studentId = 'student-a';
  const secondStudentId = 'student-b';
  const todayKey = new Date().toISOString().slice(0, 10);
  const removedLessonDay = shiftDayKey(todayKey, 2);
  const followingLessonDay = shiftDayKey(removedLessonDay, 7);
  const issuedDay = shiftDayKey(removedLessonDay, -5);
  const nextEventId = `student-a-${followingLessonDay}@example.test`;
  const secondRemovedEventId = `student-b-${removedLessonDay}@example.test`;
  const secondNextEventId = `student-b-${followingLessonDay}@example.test`;
  const followingLesson = buildStoredGoogleLesson({
    teacherId,
    studentId,
    studentName: 'Student A',
    externalEventId: nextEventId,
    date: followingLessonDay,
  });
  const secondRemovedLesson = buildStoredGoogleLesson({
    teacherId,
    studentId: secondStudentId,
    studentName: 'Student B',
    externalEventId: secondRemovedEventId,
    date: removedLessonDay,
  });
  const secondFollowingLesson = buildStoredGoogleLesson({
    teacherId,
    studentId: secondStudentId,
    studentName: 'Student B',
    externalEventId: secondNextEventId,
    date: followingLessonDay,
  });
  const homework = {
    id: 'homework-august',
    issuedAt: `${issuedDay}T17:00:00.000Z`,
    updatedAt: `${issuedDay}T17:00:00.000Z`,
    dueAt: `${removedLessonDay}T17:00:00.000Z`,
    dueAtMode: 'next-lesson',
    daysToComplete: 5,
    homeWork: 'Задание 1\nЗадание 2',
    lessonLink: '',
    boardLink: '',
    taskNumber: null,
    levelId: null,
    targetQuestions: [],
    goals: [],
    checklistItems: [
      { id: 'check-1', text: 'Задание 1', completedAt: null },
      { id: 'check-2', text: 'Задание 2', completedAt: null },
    ],
    dayPlan: {
      version: 1,
      sourceHomeworkId: 'homework-august',
      enabled: true,
      calendarOffsetMinutes: 180,
      issuedDay,
      dueDay: removedLessonDay,
      selectedWeekdays: [1, 2, 3, 4, 5, 6, 7],
      requestedSessionCount: 3,
      manualLayout: null,
      dayPlan: [],
    },
  };
  const nextLessonSnapshot = {
    ...homework,
    dayPlan: { ...homework.dayPlan },
  };
  const secondHomework = {
    ...homework,
    id: 'homework-august-second',
    checklistItems: homework.checklistItems.map((item) => ({
      ...item,
      id: `${item.id}-second`,
    })),
    dayPlan: {
      ...homework.dayPlan,
      sourceHomeworkId: 'homework-august-second',
    },
  };
  const secondNextLessonSnapshot = {
    ...secondHomework,
    dayPlan: { ...secondHomework.dayPlan },
  };
  const fakeIcal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ivan EGE//Google calendar homework integration test//EN',
    'X-WR-CALNAME:Integration calendar',
    'BEGIN:VEVENT',
    `UID:${nextEventId}`,
    `DTSTAMP:${toIcalUtc(todayKey, 10)}`,
    `DTSTART:${toIcalUtc(followingLessonDay, 17)}`,
    `DTEND:${toIcalUtc(followingLessonDay, 18)}`,
    'SUMMARY:Student A',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:${secondNextEventId}`,
    `DTSTAMP:${toIcalUtc(todayKey, 10)}`,
    `DTSTART:${toIcalUtc(followingLessonDay, 17)}`,
    `DTEND:${toIcalUtc(followingLessonDay, 18)}`,
    'SUMMARY:Student B',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-google-homework-sync-'));
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
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
      id: teacherId,
      name: 'Teacher A',
      codeHash: buildCodeHash('teacher-a-code'),
      createdAt: now,
    }]));
    fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
      id: studentId,
      name: 'Student A',
      teacherId,
      code: 'student-a-code',
      grade: '11',
      createdAt: now,
      deletedAt: null,
      studyStatus: 'active',
    }, {
      id: secondStudentId,
      name: 'Student B',
      teacherId,
      code: 'student-b-code',
      grade: '11',
      createdAt: now,
      deletedAt: null,
      studyStatus: 'active',
    }]));
    fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(dataDir, 'teacher-calendar-sync.json'), JSON.stringify({
      [teacherId]: {
        enabled: true,
        icalUrl: fakeCalendar.url,
        updatedAt: now,
        lastFetchedAt: '',
        lastError: '',
        calendarName: '',
      },
    }));
    fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
      [studentId]: {
        progress: {},
        notes: '',
        mocks: [],
        // Production can already contain the reconciled lesson schedule while
        // the homework deadline is still stuck on the removed occurrence.
        schedule: [followingLesson],
        solvedByTask: {},
        solvedEvents: [],
        nextLesson: nextLessonSnapshot,
        homeworks: [homework],
      },
      [secondStudentId]: {
        progress: {},
        notes: '',
        mocks: [],
        schedule: [secondRemovedLesson, secondFollowingLesson],
        solvedByTask: {},
        solvedEvents: [],
        nextLesson: secondNextLessonSnapshot,
        homeworks: [secondHomework],
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

    const authorization = await login(baseUrl, 'teacher-a-code');
    const homeworkResponse = await fetch(
      `${baseUrl}/api/student-next-lesson?studentId=${encodeURIComponent(studentId)}`,
      { headers: { Authorization: authorization } }
    );
    await assertStatus(homeworkResponse, 200);
    const homeworkResult = await homeworkResponse.json();
    assert.equal(homeworkResult.latest.dueAt, `${followingLessonDay}T17:00:00.000Z`);
    assert.equal(homeworkResult.latest.dayPlan.dueDay, followingLessonDay);

    const afterHomeworkRead = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'));
    assert.deepEqual(afterHomeworkRead[studentId].schedule.map((entry) => entry.date), [followingLessonDay]);
    assert.equal(afterHomeworkRead[studentId].homeworks[0].dueAt, `${followingLessonDay}T17:00:00.000Z`);

    const refreshResponse = await fetch(`${baseUrl}/api/teacher-calendar-sync/refresh`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teacherId }),
    });
    await assertStatus(refreshResponse, 200);
    const refreshResult = await refreshResponse.json();
    assert.equal(refreshResult.importedCount, 2);
    assert.equal(refreshResult.updatedStudentCount, 1);

    const teacherScheduleResponse = await fetch(`${baseUrl}/api/teacher-schedule`, {
      headers: { Authorization: authorization },
    });
    await assertStatus(teacherScheduleResponse, 200);
    const teacherSchedule = await teacherScheduleResponse.json();
    assert.deepEqual(teacherSchedule
      .filter((entry) => entry?.source === 'google-ical')
      .map((entry) => `${entry.subject}:${entry.date}T${entry.time}`)
      .sort(), [
        `Student A:${followingLessonDay}T20:00`,
        `Student B:${followingLessonDay}T20:00`,
      ]);

    const persistedDb = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'));
    const persistedStudent = persistedDb[studentId];
    assert.deepEqual(
      persistedStudent.schedule.map((entry) => entry.date),
      [followingLessonDay],
      'teacher calendar refresh must remove the cancelled occurrence from the stored student schedule'
    );
    assert.equal(persistedStudent.homeworks[0].dueAt, `${followingLessonDay}T17:00:00.000Z`);
    assert.equal(persistedStudent.homeworks[0].dayPlan.dueDay, followingLessonDay);
    assert.equal(persistedStudent.nextLesson.dueAt, `${followingLessonDay}T17:00:00.000Z`);
    assert.equal(persistedStudent.nextLesson.dayPlan.dueDay, followingLessonDay);
    const secondPersistedStudent = persistedDb[secondStudentId];
    assert.deepEqual(secondPersistedStudent.schedule.map((entry) => entry.date), [followingLessonDay]);
    assert.equal(secondPersistedStudent.homeworks[0].dueAt, `${followingLessonDay}T17:00:00.000Z`);
    assert.equal(secondPersistedStudent.homeworks[0].dayPlan.dueDay, followingLessonDay);
    assert.equal(secondPersistedStudent.nextLesson.dueAt, `${followingLessonDay}T17:00:00.000Z`);
    assert.equal(secondPersistedStudent.nextLesson.dayPlan.dueDay, followingLessonDay);
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
