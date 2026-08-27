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
  const salt = Buffer.from('teacher-calendar-cancellation-test-salt').toString('base64');
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

const getFutureLessonDays = () => {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 5));
  const second = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 12));
  return [first.toISOString().slice(0, 10), second.toISOString().slice(0, 10)];
};

const shiftDay = (value, amount) => {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

test('calendar cancellation updates linked schedule, homework and finance and can be restored', {
  timeout: 40_000,
}, async () => {
  const teacherId = 'teacher-cancel';
  const studentId = 'student-cancel';
  const [firstDay, secondDay] = getFutureLessonDays();
  const month = firstDay.slice(0, 7);
  const firstLessonId = 'lesson-first';
  const secondLessonId = 'lesson-second';
  const pastLessonId = 'lesson-past';
  const pastDay = shiftDay(new Date(), -2);
  const firstDueAt = `${firstDay}T17:00:00.000Z`;
  const secondDueAt = `${secondDay}T17:00:00.000Z`;
  const now = new Date().toISOString();
  const studentCreatedAt = `${shiftDay(new Date(), -30)}T09:00:00.000Z`;
  const homework = {
    id: 'homework-cancel',
    issuedAt: now,
    updatedAt: now,
    dueAt: firstDueAt,
    dueAtMode: 'next-lesson',
    calendarOffsetMinutes: 180,
    daysToComplete: 7,
    homeWork: 'Задание 1',
    goals: [],
    checklistItems: [{ id: 'check-1', text: 'Задание 1', completedAt: null }],
  };
  const schedule = [
    {
      id: pastLessonId,
      studentId,
      date: pastDay,
      time: '18:00',
      durationMinutes: 60,
      subject: 'Информатика',
      createdAt: studentCreatedAt,
      updatedAt: studentCreatedAt,
    },
    {
      id: firstLessonId,
      studentId,
      date: firstDay,
      time: '20:00',
      durationMinutes: 60,
      subject: 'Информатика',
      createdAt: studentCreatedAt,
      updatedAt: now,
    },
    {
      id: secondLessonId,
      studentId,
      date: secondDay,
      time: '20:00',
      durationMinutes: 60,
      subject: 'Информатика',
      createdAt: studentCreatedAt,
      updatedAt: now,
    },
  ];

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-calendar-cancel-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  let child = null;
  let serverLogs = '';
  try {
    fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
      id: teacherId,
      name: 'Teacher Cancel',
      codeHash: buildCodeHash('teacher-cancel-code'),
      createdAt: studentCreatedAt,
    }]));
    fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
      id: studentId,
      name: 'Student Cancel',
      teacherId,
      code: 'student-cancel-code',
      grade: '11',
      studyStatus: 'active',
      createdAt: studentCreatedAt,
      deletedAt: null,
    }]));
    fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
      [studentId]: {
        progress: {},
        mocks: [],
        schedule,
        homeworks: [homework],
        nextLesson: homework,
        solvedByTask: {},
        solvedEvents: [],
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

    const login = await jsonRequest(baseUrl, '/api/login', {
      method: 'POST',
      body: { code: 'teacher-cancel-code' },
    });
    const token = `Bearer ${login.token}`;
    await jsonRequest(baseUrl, `/api/teacher-finance/students/${studentId}`, {
      token,
      method: 'PATCH',
      body: {
        month,
        lessonPrice: 2000,
        completedLessons: 1,
      },
    });
    const completedMarkKey = `${teacherId}:${firstLessonId}:${firstDay}:${studentId}:20:00:completed`;
    await jsonRequest(baseUrl, '/api/teacher-calendar-marks', {
      token,
      method: 'PATCH',
      body: { set: { [completedMarkKey]: now } },
    });

    const financeBefore = await jsonRequest(baseUrl, `/api/teacher-finance?month=${month}`, { token });
    assert.equal(financeBefore.calendarPlan.total.lessonCount, 2);

    const occurrence = {
      id: firstLessonId,
      dayKey: firstDay,
      time: '20:00',
      studentId,
    };
    const cancelled = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence, cancelled: true },
    });
    assert.equal(cancelled.cancelled, true);
    assert.ok(cancelled.marks[cancelled.cancellationMarkKey]);
    assert.ok(cancelled.marks[completedMarkKey], 'completed mark must survive a reversible cancellation');

    await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence, cancelled: true },
    });
    await jsonRequest(baseUrl, '/api/teacher-calendar-marks', {
      token,
      method: 'PATCH',
      body: { unset: [cancelled.cancellationMarkKey] },
    });
    const protectedMarks = await jsonRequest(baseUrl, '/api/teacher-calendar-marks', { token });
    assert.ok(protectedMarks.marks[cancelled.cancellationMarkKey]);

    const teacherSchedule = await jsonRequest(baseUrl, '/api/teacher-schedule', { token });
    const cancelledEntry = teacherSchedule.find((entry) => entry.id === firstLessonId);
    assert.equal(cancelledEntry.cancelled, true);
    assert.equal(cancelledEntry.status, 'cancelled');

    const studentSchedule = await jsonRequest(
      baseUrl,
      `/api/student-schedule?studentId=${studentId}`,
      { token }
    );
    assert.equal(studentSchedule.some((entry) => entry.id === firstLessonId), false);
    assert.equal(studentSchedule.some((entry) => entry.id === secondLessonId), true);
    const homeworkAfterCancel = await jsonRequest(
      baseUrl,
      `/api/student-next-lesson?studentId=${studentId}`,
      { token }
    );
    assert.equal(homeworkAfterCancel.latest.dueAt, secondDueAt);

    const financeAfterCancel = await jsonRequest(baseUrl, `/api/teacher-finance?month=${month}`, { token });
    const studentFinanceAfterCancel = financeAfterCancel.students.find((entry) => entry.id === studentId);
    assert.equal(financeAfterCancel.calendarPlan.total.lessonCount, 1);
    assert.equal(studentFinanceAfterCancel.record.cancelledLessons, 1);
    assert.equal(studentFinanceAfterCancel.record.completedLessons, 0);

    const restored = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence, cancelled: false },
    });
    assert.equal(restored.cancelled, false);
    assert.equal(restored.marks[restored.cancellationMarkKey], undefined);
    assert.ok(restored.marks[completedMarkKey]);

    const restoredSchedule = await jsonRequest(
      baseUrl,
      `/api/student-schedule?studentId=${studentId}`,
      { token }
    );
    assert.equal(restoredSchedule.some((entry) => entry.id === firstLessonId), true);
    assert.equal(restoredSchedule.some((entry) => entry.id === secondLessonId), true);
    const homeworkAfterRestore = await jsonRequest(
      baseUrl,
      `/api/student-next-lesson?studentId=${studentId}`,
      { token }
    );
    assert.equal(homeworkAfterRestore.latest.dueAt, firstDueAt);

    const financeAfterRestore = await jsonRequest(baseUrl, `/api/teacher-finance?month=${month}`, { token });
    const studentFinanceAfterRestore = financeAfterRestore.students.find((entry) => entry.id === studentId);
    assert.equal(financeAfterRestore.calendarPlan.total.lessonCount, 2);
    assert.equal(studentFinanceAfterRestore.record.cancelledLessons, 0);
    assert.equal(studentFinanceAfterRestore.record.completedLessons, 1);

    const historyBeforePastCancel = await jsonRequest(
      baseUrl,
      `/api/lesson-history?studentId=${studentId}`,
      { token }
    );
    assert.equal(historyBeforePastCancel.items.some((entry) => entry.dayKey === pastDay), true);
    const pastOccurrence = {
      id: pastLessonId,
      dayKey: pastDay,
      time: '18:00',
      studentId,
    };
    await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: pastOccurrence, cancelled: true },
    });
    const historyAfterPastCancel = await jsonRequest(
      baseUrl,
      `/api/lesson-history?studentId=${studentId}`,
      { token }
    );
    assert.equal(historyAfterPastCancel.items.some((entry) => entry.dayKey === pastDay), false);
    await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: pastOccurrence, cancelled: false },
    });
    const historyAfterPastRestore = await jsonRequest(
      baseUrl,
      `/api/lesson-history?studentId=${studentId}`,
      { token }
    );
    assert.equal(historyAfterPastRestore.items.some((entry) => entry.dayKey === pastDay), true);
  } finally {
    await stopServer(child);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});
