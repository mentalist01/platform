import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before startup.\n${getLogs()}`);
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

const jsonRequest = async (baseUrl, pathname, options = {}) => {
  const headers = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (Object.prototype.hasOwnProperty.call(options, 'body')) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    ...(Object.prototype.hasOwnProperty.call(options, 'body')
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const rawBody = await response.text();
  assert.equal(
    response.status,
    options.status ?? 200,
    `${options.method || 'GET'} ${pathname} returned ${response.status}.\n${rawBody}`
  );
  return rawBody ? JSON.parse(rawBody) : null;
};

const login = (baseUrl, code) => jsonRequest(baseUrl, '/api/login', {
  method: 'POST',
  body: { code },
});

const shiftDayKey = (dayKey, days) => {
  const date = new Date(`${dayKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const toIcalUtc = (dayKey, hour) => (
  `${dayKey.replaceAll('-', '')}T${String(hour).padStart(2, '0')}0000Z`
);

const buildEvent = ({ uid, dayKey, summary, location = '' }) => [
  'BEGIN:VEVENT',
  `UID:${uid}`,
  `DTSTAMP:${toIcalUtc(dayKey, 9)}`,
  `DTSTART:${toIcalUtc(dayKey, 17)}`,
  `DTEND:${toIcalUtc(dayKey, 18)}`,
  `SUMMARY:${summary}`,
  ...(location ? [`LOCATION:${location}`] : []),
  'END:VEVENT',
];

const startFakeIcalServer = async (initialIcalBody) => {
  let icalBody = initialIcalBody;
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
    setBody: (value) => { icalBody = String(value || ''); },
  };
};

const groupMember = (studentId, overrides = {}) => ({
  studentId,
  status: 'active',
  joinedAt: '2026-08-01T10:00:00.000Z',
  leftAt: '',
  addedAfterStart: false,
  overrideReason: '',
  addedById: 'teacher-a',
  removedById: '',
  ...overrides,
});

const learningGroup = (overrides = {}) => ({
  id: 'group-active',
  teacherId: 'teacher-a',
  name: 'Группа 2',
  plannedStartDate: '2026-08-01',
  maxStudents: 5,
  admissionsOpen: false,
  members: [groupMember('student-a'), groupMember('student-b')],
  schedule: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  startedAt: '2026-08-02T10:00:00.000Z',
  completedAt: '',
  deletedAt: '',
  ...overrides,
});

test('Google group occurrences create one stable lesson and project independent member payments', {
  timeout: 60_000,
}, async () => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const activeDay = shiftDayKey(todayKey, 3);
  const readyDay = shiftDayKey(todayKey, 4);
  const individualDay = shiftDayKey(todayKey, 5);
  const ambiguousDay = shiftDayKey(todayKey, 6);
  const telemostUrl = 'https://telemost.yandex.ru/j/group-room';
  const icalBody = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ivan EGE//Google learning groups integration test//EN',
    'X-WR-CALNAME:Group integration calendar',
    ...buildEvent({
      uid: 'active-group@example.test',
      dayKey: activeDay,
      summary: 'Группа 2',
      location: telemostUrl,
    }),
    ...buildEvent({
      uid: 'ready-group@example.test',
      dayKey: readyDay,
      summary: 'Подготовительная группа',
    }),
    ...buildEvent({
      uid: 'individual@example.test',
      dayKey: individualDay,
      summary: 'Student A',
    }),
    ...buildEvent({
      uid: 'ambiguous@example.test',
      dayKey: ambiguousDay,
      summary: 'Дубль',
    }),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  const icalBodyWithoutActiveGroup = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ivan EGE//Google learning groups integration test//EN',
    'X-WR-CALNAME:Group integration calendar',
    ...buildEvent({
      uid: 'ready-group@example.test',
      dayKey: readyDay,
      summary: 'Подготовительная группа',
    }),
    ...buildEvent({
      uid: 'individual@example.test',
      dayKey: individualDay,
      summary: 'Student A',
    }),
    ...buildEvent({
      uid: 'ambiguous@example.test',
      dayKey: ambiguousDay,
      summary: 'Дубль',
    }),
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-google-groups-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  let child = null;
  let calendarServer = null;
  let setCalendarBody = null;
  let serverLogs = '';
  try {
    const fakeCalendar = await startFakeIcalServer(icalBody);
    calendarServer = fakeCalendar.server;
    setCalendarBody = fakeCalendar.setBody;
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
      id: 'teacher-a',
      name: 'Teacher A',
      code: 'teacher-code',
      createdAt: now,
    }]));
    fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
      id: 'student-a',
      name: 'Student A',
      teacherId: 'teacher-a',
      code: 'student-a-code',
      grade: '11',
      createdAt: now,
      deletedAt: null,
      studyStatus: 'active',
    }, {
      id: 'student-b',
      name: 'Student B',
      teacherId: 'teacher-a',
      code: 'student-b-code',
      grade: '11',
      createdAt: now,
      deletedAt: null,
      studyStatus: 'active',
    }, {
      id: 'student-c',
      name: 'Student C',
      teacherId: 'teacher-a',
      code: 'student-c-code',
      grade: '10',
      createdAt: now,
      deletedAt: null,
      studyStatus: 'active',
    }]));
    fs.writeFileSync(path.join(dataDir, 'tests.json'), '{}');
    fs.writeFileSync(path.join(dataDir, 'mock-exams.json'), '[]');
    fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
      'student-a': { schedule: [], homeworks: [], mockAttempts: {} },
      'student-b': { schedule: [], homeworks: [], mockAttempts: {} },
      'student-c': { schedule: [], homeworks: [], mockAttempts: {} },
    }));
    fs.writeFileSync(path.join(dataDir, 'learning-groups.json'), JSON.stringify([
      learningGroup(),
      learningGroup({
        id: 'group-ready',
        name: 'Подготовительная группа',
        admissionsOpen: true,
        startedAt: '',
      }),
      learningGroup({ id: 'group-individual-collision', name: 'Student A' }),
      learningGroup({ id: 'group-duplicate-a', name: 'Дубль', startedAt: '', admissionsOpen: true }),
      learningGroup({ id: 'group-duplicate-b', name: 'дубль-', startedAt: '', admissionsOpen: true }),
      learningGroup({
        id: 'group-completed',
        name: 'Группа 2',
        startedAt: '2026-07-01T10:00:00.000Z',
        completedAt: '2026-08-01T10:00:00.000Z',
      }),
    ]));
    fs.writeFileSync(path.join(dataDir, 'teacher-calendar-sync.json'), JSON.stringify({
      'teacher-a': {
        enabled: true,
        icalUrl: fakeCalendar.url,
        updatedAt: now,
        lastFetchedAt: '',
        lastError: '',
        calendarName: '',
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
        LEARNING_GROUPS_ENABLED: '1',
        LEARNING_GROUP_RTC_ENABLED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    child.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    await waitForServer(baseUrl, child, () => serverLogs);

    const teacher = await login(baseUrl, 'teacher-code');
    const studentA = await login(baseUrl, 'student-a-code');
    const studentB = await login(baseUrl, 'student-b-code');
    const studentC = await login(baseUrl, 'student-c-code');

    const refresh = await jsonRequest(baseUrl, '/api/teacher-calendar-sync/refresh', {
      token: teacher.token,
      method: 'POST',
      body: {},
    });
    assert.equal(refresh.importedCount, 4);
    assert.equal(refresh.updatedStudentCount, 2);

    const teacherSchedule = await jsonRequest(baseUrl, '/api/teacher-schedule', { token: teacher.token });
    const googleEntries = teacherSchedule.filter((entry) => entry.source === 'google-ical');
    assert.equal(googleEntries.length, 4);

    const activeEntry = googleEntries.find((entry) => entry.externalEventId === 'active-group@example.test');
    assert.equal(activeEntry.isLearningGroupEvent, true);
    assert.equal(activeEntry.groupId, 'group-active');
    assert.equal(activeEntry.groupName, 'Группа 2');
    assert.equal(activeEntry.studentId, '');
    assert.equal(activeEntry.isTeacherSlot, false);
    assert.ok(activeEntry.lessonId);
    assert.equal(activeEntry.telemostUrl, telemostUrl);
    assert.deepEqual(activeEntry.participantIds, ['student-a', 'student-b']);
    assert.deepEqual(activeEntry.participants, [
      { studentId: 'student-a', studentName: 'Student A' },
      { studentId: 'student-b', studentName: 'Student B' },
    ]);
    assert.deepEqual(
      activeEntry.memberPaymentStatuses.map((item) => [item.studentId, item.status]),
      [['student-a', 'pending'], ['student-b', 'pending']]
    );
    assert.notEqual(
      activeEntry.memberPaymentStatuses[0].paidMarkKey,
      activeEntry.memberPaymentStatuses[1].paidMarkKey
    );

    const readyEntry = googleEntries.find((entry) => entry.externalEventId === 'ready-group@example.test');
    assert.equal(readyEntry.isLearningGroupEvent, true);
    assert.equal(readyEntry.groupId, 'group-ready');
    assert.equal(readyEntry.lessonId, '');

    const individualEntry = googleEntries.find((entry) => entry.externalEventId === 'individual@example.test');
    assert.equal(individualEntry.studentId, 'student-a');
    assert.equal(individualEntry.groupId, undefined);
    assert.equal(individualEntry.isLearningGroupEvent, undefined);

    const ambiguousEntry = googleEntries.find((entry) => entry.externalEventId === 'ambiguous@example.test');
    assert.equal(ambiguousEntry.groupId, undefined);
    assert.equal(ambiguousEntry.learningGroupMatchAmbiguous, true);
    assert.equal(ambiguousEntry.isTeacherSlot, true);

    const lessons = JSON.parse(fs.readFileSync(path.join(dataDir, 'learning-lesson-sessions.json'), 'utf8'));
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].id, activeEntry.lessonId);
    assert.equal(lessons[0].groupId, 'group-active');
    assert.equal(lessons[0].source, 'google-calendar');
    assert.equal(lessons[0].externalEventId, 'active-group@example.test');
    assert.deepEqual(lessons[0].participantIds, ['student-a', 'student-b']);
    assert.equal(lessons[0].telemostUrl, telemostUrl);

    const attendance = JSON.parse(fs.readFileSync(path.join(dataDir, 'learning-attendance.json'), 'utf8'));
    assert.deepEqual(
      attendance.map((item) => item.studentId).sort(),
      ['student-a', 'student-b']
    );

    const scheduleA = await jsonRequest(baseUrl, '/api/student-schedule', { token: studentA.token });
    const scheduleB = await jsonRequest(baseUrl, '/api/student-schedule', { token: studentB.token });
    const scheduleC = await jsonRequest(baseUrl, '/api/student-schedule', { token: studentC.token });
    const groupEntriesA = scheduleA.filter((entry) => entry.isLearningGroupEvent);
    const groupEntriesB = scheduleB.filter((entry) => entry.isLearningGroupEvent);
    assert.deepEqual(groupEntriesA.map((entry) => entry.groupId).sort(), ['group-active', 'group-ready']);
    assert.deepEqual(groupEntriesB.map((entry) => entry.groupId).sort(), ['group-active', 'group-ready']);
    assert.equal(scheduleC.some((entry) => entry.isLearningGroupEvent), false);
    assert.equal(scheduleA.some((entry) => entry.externalEventId === 'individual@example.test'), true);
    assert.equal(scheduleB.some((entry) => entry.externalEventId === 'individual@example.test'), false);
    [groupEntriesA, groupEntriesB].flat().forEach((entry) => {
      assert.ok(entry.studentId === 'student-a' || entry.studentId === 'student-b');
      assert.deepEqual(entry.participantIds, ['student-a', 'student-b']);
      assert.equal(entry.memberPaymentStatuses, undefined);
    });
    assert.equal(
      groupEntriesA.find((entry) => entry.groupId === 'group-active').lessonId,
      activeEntry.lessonId
    );

    const paidMarkKey = activeEntry.memberPaymentStatuses.find((item) => item.studentId === 'student-a').paidMarkKey;
    await jsonRequest(baseUrl, '/api/teacher-calendar-marks', {
      token: teacher.token,
      method: 'PATCH',
      body: { set: { [paidMarkKey]: now } },
    });
    const scheduleAfterPayment = await jsonRequest(baseUrl, '/api/teacher-schedule', { token: teacher.token });
    const paidGroupEntry = scheduleAfterPayment.find((entry) => entry.externalEventId === 'active-group@example.test');
    assert.deepEqual(
      paidGroupEntry.memberPaymentStatuses.map((item) => [item.studentId, item.status]),
      [['student-a', 'paid'], ['student-b', 'pending']]
    );

    const secondRefresh = await jsonRequest(baseUrl, '/api/teacher-calendar-sync/refresh', {
      token: teacher.token,
      method: 'POST',
      body: {},
    });
    assert.equal(secondRefresh.importedCount, 4);
    const lessonsAfterRefresh = JSON.parse(fs.readFileSync(path.join(dataDir, 'learning-lesson-sessions.json'), 'utf8'));
    assert.equal(lessonsAfterRefresh.length, 1);
    assert.equal(lessonsAfterRefresh[0].id, activeEntry.lessonId);

    await jsonRequest(baseUrl, '/api/learning-groups/group-active/members/student-b', {
      token: teacher.token,
      method: 'DELETE',
    });
    await jsonRequest(baseUrl, '/api/teacher-calendar-sync/refresh', {
      token: teacher.token,
      method: 'POST',
      body: {},
    });
    const scheduleAfterMemberRemoval = await jsonRequest(baseUrl, '/api/teacher-schedule', {
      token: teacher.token,
    });
    const reducedGroupEntry = scheduleAfterMemberRemoval.find((entry) => (
      entry.externalEventId === 'active-group@example.test'
    ));
    assert.deepEqual(reducedGroupEntry.participantIds, ['student-a']);
    assert.deepEqual(reducedGroupEntry.memberPaymentStatuses.map((item) => item.studentId), ['student-a']);
    const reducedLessonStore = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'learning-lesson-sessions.json'), 'utf8')
    );
    assert.deepEqual(reducedLessonStore[0].participantIds, ['student-a']);
    const reducedStudentBSchedule = await jsonRequest(baseUrl, '/api/student-schedule', {
      token: studentB.token,
    });
    assert.equal(
      reducedStudentBSchedule.some((entry) => entry.externalEventId === 'active-group@example.test'),
      false
    );

    setCalendarBody(icalBodyWithoutActiveGroup);
    const refreshAfterDeletion = await jsonRequest(baseUrl, '/api/teacher-calendar-sync/refresh', {
      token: teacher.token,
      method: 'POST',
      body: {},
    });
    assert.equal(refreshAfterDeletion.importedCount, 3);
    const cancelledLessonStore = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'learning-lesson-sessions.json'), 'utf8')
    );
    assert.equal(cancelledLessonStore[0].id, activeEntry.lessonId);
    assert.equal(cancelledLessonStore[0].status, 'cancelled');
    const scheduleAfterDeletion = await jsonRequest(baseUrl, '/api/student-schedule', {
      token: studentA.token,
    });
    assert.equal(
      scheduleAfterDeletion.some((entry) => entry.externalEventId === 'active-group@example.test'),
      false
    );
  } finally {
    await stopServer(child);
    await stopHttpServer(calendarServer);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) fs.rmSync(safeTempRoot, { recursive: true, force: true });
  }
});
