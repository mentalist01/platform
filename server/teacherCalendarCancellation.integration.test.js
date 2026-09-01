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
  const third = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 5));
  const fourth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 12));
  const fifth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 19));
  const sixth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 26));
  const seventh = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 5));
  return [first, second, third, fourth, fifth, sixth, seventh]
    .map((date) => date.toISOString().slice(0, 10));
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
  const [firstDay, secondDay, thirdDay, fourthDay, fifthDay, sixthDay, seventhDay] = getFutureLessonDays();
  const month = firstDay.slice(0, 7);
  const followingMonth = thirdDay.slice(0, 7);
  const laterMonth = seventhDay.slice(0, 7);
  const firstLessonId = 'lesson-first';
  const secondLessonId = 'lesson-second';
  const thirdLessonId = 'lesson-third';
  const fourthLessonId = 'lesson-fourth';
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
    {
      id: thirdLessonId,
      studentId,
      date: thirdDay,
      time: '20:00',
      durationMinutes: 60,
      subject: 'Информатика',
      createdAt: studentCreatedAt,
      updatedAt: now,
    },
    {
      id: fourthLessonId,
      studentId,
      date: fourthDay,
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
        paidAmount: 4000,
      },
    });
    const completedMarkKey = `${teacherId}:${firstLessonId}:${firstDay}:${studentId}:20:00:completed`;
    const paidMarkKey = `${teacherId}:${firstLessonId}:${firstDay}:${studentId}:20:00:paid`;
    const secondPaidMarkKey = `${teacherId}:${secondLessonId}:${secondDay}:${studentId}:20:00:paid`;
    const thirdPaidMarkKey = `${teacherId}:${thirdLessonId}:${thirdDay}:${studentId}:20:00:paid`;
    const fourthPaidMarkKey = `${teacherId}:${fourthLessonId}:${fourthDay}:${studentId}:20:00:paid`;
    await jsonRequest(baseUrl, '/api/teacher-calendar-marks', {
      token,
      method: 'PATCH',
      body: {
        set: {
          [completedMarkKey]: now,
          [paidMarkKey]: now,
          [secondPaidMarkKey]: now,
        },
      },
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
    assert.equal(cancelled.marks[paidMarkKey], undefined, 'payment must leave the cancelled lesson');
    assert.ok(cancelled.marks[secondPaidMarkKey], 'an already paid next lesson must remain paid');
    assert.ok(cancelled.marks[thirdPaidMarkKey], 'payment must skip an already paid lesson');
    assert.deepEqual(cancelled.payment, [{
      studentId,
      type: 'transferred',
      amount: 2000,
      fromDayKey: firstDay,
      toDayKey: thirdDay,
      markKey: thirdPaidMarkKey,
    }]);

    const repeatedCancellation = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence, cancelled: true },
    });
    assert.deepEqual(repeatedCancellation.payment, [], 'repeated cancellation must be idempotent');
    assert.ok(repeatedCancellation.marks[thirdPaidMarkKey]);
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
    assert.equal(studentSchedule.some((entry) => entry.id === thirdLessonId), true);
    assert.equal(studentSchedule.some((entry) => entry.id === fourthLessonId), true);
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
    assert.ok(restored.marks[paidMarkKey], 'restoring a cancellation must restore the original payment');
    assert.ok(restored.marks[secondPaidMarkKey], 'unrelated payment must remain on the next lesson');
    assert.equal(restored.marks[thirdPaidMarkKey], undefined, 'transferred mark must be removed on restore');

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

    // Cancelling the already prepaid next lesson moves that distinct payment
    // across a month boundary and restoring it reverses both calendar marks
    // and monthly finance allocation.
    const secondOccurrence = {
      id: secondLessonId,
      dayKey: secondDay,
      time: '20:00',
      studentId,
    };
    const secondCancelled = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: secondOccurrence, cancelled: true },
    });
    assert.equal(secondCancelled.marks[secondPaidMarkKey], undefined);
    assert.ok(secondCancelled.marks[thirdPaidMarkKey]);
    assert.deepEqual(secondCancelled.payment, [{
      studentId,
      type: 'transferred',
      amount: 2000,
      fromDayKey: secondDay,
      toDayKey: thirdDay,
      markKey: thirdPaidMarkKey,
    }]);
    const financeAfterCrossMonthTransfer = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${month}`,
      { token }
    );
    const sourceMonthStudent = financeAfterCrossMonthTransfer.students.find(
      (entry) => entry.id === studentId
    );
    assert.equal(sourceMonthStudent.record.paidAmount, 2000);
    const followingMonthFinance = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    const targetMonthStudent = followingMonthFinance.students.find((entry) => entry.id === studentId);
    assert.equal(targetMonthStudent.record.paidAmount, 2000);

    const secondRestored = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: secondOccurrence, cancelled: false },
    });
    assert.ok(secondRestored.marks[secondPaidMarkKey]);
    assert.equal(secondRestored.marks[thirdPaidMarkKey], undefined);
    const sourceFinanceAfterTransferRestore = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${month}`,
      { token }
    );
    assert.equal(
      sourceFinanceAfterTransferRestore.students.find((entry) => entry.id === studentId).record.paidAmount,
      4000
    );
    const targetFinanceAfterTransferRestore = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    assert.equal(
      targetFinanceAfterTransferRestore.students.find((entry) => entry.id === studentId).record.paidAmount,
      0
    );

    // A paid lesson with no later slot becomes an explicit student advance and
    // is restored to the original lesson when the cancellation is undone.
    await jsonRequest(baseUrl, `/api/teacher-finance/students/${studentId}`, {
      token,
      method: 'PATCH',
      body: {
        month: followingMonth,
        paidAmount: 2000,
      },
    });
    await jsonRequest(baseUrl, '/api/teacher-calendar-marks', {
      token,
      method: 'PATCH',
      body: { set: { [fourthPaidMarkKey]: now } },
    });
    const fourthOccurrence = {
      id: fourthLessonId,
      dayKey: fourthDay,
      time: '20:00',
      studentId,
    };
    const fourthCancelled = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: fourthOccurrence, cancelled: true },
    });
    assert.equal(fourthCancelled.marks[fourthPaidMarkKey], undefined);
    assert.deepEqual(fourthCancelled.payment, [{
      studentId,
      type: 'credit',
      amount: 2000,
      fromDayKey: fourthDay,
    }]);
    const financeWithCredit = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    const studentFinanceWithCredit = financeWithCredit.students.find((entry) => entry.id === studentId);
    assert.equal(studentFinanceWithCredit.availableCredit, 2000);

    const addedLesson = await jsonRequest(baseUrl, '/api/student-schedule', {
      token,
      method: 'POST',
      body: {
        studentId,
        date: fifthDay,
        time: '20:00',
        durationMinutes: 60,
        subject: 'Информатика',
      },
    });
    const addedLessonPaidMarkKey = `${teacherId}:${addedLesson.id}:${fifthDay}:${studentId}:20:00:paid`;
    const marksAfterAddingLesson = await jsonRequest(baseUrl, '/api/teacher-calendar-marks', { token });
    assert.ok(
      marksAfterAddingLesson.marks[addedLessonPaidMarkKey],
      'stored advance must automatically apply when the next lesson is added'
    );
    const financeAfterAutomaticCredit = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    assert.equal(
      financeAfterAutomaticCredit.students.find((entry) => entry.id === studentId).availableCredit,
      0
    );

    const fourthRestored = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: fourthOccurrence, cancelled: false },
    });
    assert.ok(fourthRestored.marks[fourthPaidMarkKey]);
    assert.equal(
      fourthRestored.marks[addedLessonPaidMarkKey],
      undefined,
      'restoring the original cancellation must reverse an unused automatic transfer'
    );
    const financeAfterCreditRestore = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    const studentFinanceAfterCreditRestore = financeAfterCreditRestore.students.find((entry) => entry.id === studentId);
    assert.equal(studentFinanceAfterCreditRestore.availableCredit, 0);

    // If the target of an automatic transfer is later deleted, the payment
    // must leave the stale occurrence and continue to the next suitable lesson.
    const fourthCancelledAgain = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: fourthOccurrence, cancelled: true },
    });
    assert.ok(fourthCancelledAgain.marks[addedLessonPaidMarkKey]);
    const sixthLesson = await jsonRequest(baseUrl, '/api/student-schedule', {
      token,
      method: 'POST',
      body: {
        studentId,
        date: sixthDay,
        time: '20:00',
        durationMinutes: 60,
        subject: 'Информатика',
      },
    });
    const sixthLessonPaidMarkKey = `${teacherId}:${sixthLesson.id}:${sixthDay}:${studentId}:20:00:paid`;
    const addedLessonOccurrence = {
      id: addedLesson.id,
      dayKey: fifthDay,
      time: '20:00',
      studentId,
    };
    const addedLessonCancelled = await jsonRequest(
      baseUrl,
      '/api/teacher-calendar-cancellations',
      {
        token,
        method: 'PATCH',
        body: { occurrence: addedLessonOccurrence, cancelled: true },
      }
    );
    assert.equal(addedLessonCancelled.marks[addedLessonPaidMarkKey], undefined);
    assert.ok(addedLessonCancelled.marks[sixthLessonPaidMarkKey]);

    // Moving a nested transfer target must preserve the anchor of the most
    // recent cancellation so that restoring it still returns the payment.
    const movedSixthLesson = await jsonRequest(baseUrl, `/api/student-schedule/${sixthLesson.id}`, {
      token,
      method: 'PUT',
      body: { studentId, date: seventhDay },
    });
    const movedSixthPaidMarkKey = `${teacherId}:${movedSixthLesson.id}:${seventhDay}:${studentId}:20:00:paid`;
    const marksAfterMovingTransferTarget = await jsonRequest(
      baseUrl,
      '/api/teacher-calendar-marks',
      { token }
    );
    assert.equal(marksAfterMovingTransferTarget.marks[sixthLessonPaidMarkKey], undefined);
    assert.ok(marksAfterMovingTransferTarget.marks[movedSixthPaidMarkKey]);
    const restoredAddedLesson = await jsonRequest(
      baseUrl,
      '/api/teacher-calendar-cancellations',
      {
        token,
        method: 'PATCH',
        body: { occurrence: addedLessonOccurrence, cancelled: false },
      }
    );
    assert.ok(restoredAddedLesson.marks[addedLessonPaidMarkKey]);
    assert.equal(
      restoredAddedLesson.marks[movedSixthPaidMarkKey],
      undefined,
      'restoring a nested cancellation must survive a later schedule move'
    );

    await jsonRequest(
      baseUrl,
      `/api/student-schedule/${addedLesson.id}?studentId=${encodeURIComponent(studentId)}`,
      {
      token,
      method: 'DELETE',
      }
    );
    const marksAfterDeletingTransferTarget = await jsonRequest(
      baseUrl,
      '/api/teacher-calendar-marks',
      { token }
    );
    assert.equal(marksAfterDeletingTransferTarget.marks[addedLessonPaidMarkKey], undefined);
    assert.ok(
      marksAfterDeletingTransferTarget.marks[movedSixthPaidMarkKey],
      'deleting the transfer target must move its payment to the next lesson'
    );

    // The direct move and subsequent deletion both shift monthly paidAmount
    // bookkeeping together with the calendar mark.
    const financeAfterMovingTarget = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    assert.equal(
      financeAfterMovingTarget.students.find((entry) => entry.id === studentId).record.paidAmount,
      0
    );
    const laterFinanceAfterMovingTarget = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${laterMonth}`,
      { token }
    );
    assert.equal(
      laterFinanceAfterMovingTarget.students.find((entry) => entry.id === studentId).record.paidAmount,
      2000
    );

    await jsonRequest(
      baseUrl,
      `/api/student-schedule/${movedSixthLesson.id}?studentId=${encodeURIComponent(studentId)}`,
      {
        token,
        method: 'DELETE',
      }
    );
    const financeAfterDeletingLastTarget = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${laterMonth}`,
      { token }
    );
    const studentFinanceAfterDeletingLastTarget = financeAfterDeletingLastTarget.students.find(
      (entry) => entry.id === studentId
    );
    assert.equal(studentFinanceAfterDeletingLastTarget.record.paidAmount, 2000);
    assert.equal(studentFinanceAfterDeletingLastTarget.availableCredit, 2000);

    const fourthRestoredAgain = await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: fourthOccurrence, cancelled: false },
    });
    assert.ok(fourthRestoredAgain.marks[fourthPaidMarkKey]);
    assert.equal(fourthRestoredAgain.marks[movedSixthPaidMarkKey], undefined);
    const financeAfterRestoringDeletedTarget = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    assert.equal(
      financeAfterRestoringDeletedTarget.students.find((entry) => entry.id === studentId).record.paidAmount,
      2000
    );
    const laterFinanceAfterRestoringDeletedTarget = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${laterMonth}`,
      { token }
    );
    assert.equal(
      laterFinanceAfterRestoringDeletedTarget.students.find((entry) => entry.id === studentId).record.paidAmount,
      0
    );

    // A teacher's explicit removal is final: cancel/restore must not recreate
    // the paid mark from the persisted allocation history.
    await jsonRequest(baseUrl, `/api/teacher-finance/students/${studentId}`, {
      token,
      method: 'PATCH',
      body: {
        month: followingMonth,
        paidAmount: 0,
      },
    });
    await jsonRequest(baseUrl, '/api/teacher-calendar-marks', {
      token,
      method: 'PATCH',
      body: { unset: [fourthPaidMarkKey] },
    });
    await jsonRequest(baseUrl, '/api/teacher-calendar-cancellations', {
      token,
      method: 'PATCH',
      body: { occurrence: fourthOccurrence, cancelled: true },
    });
    const restoredAfterManualRemoval = await jsonRequest(
      baseUrl,
      '/api/teacher-calendar-cancellations',
      {
        token,
        method: 'PATCH',
        body: { occurrence: fourthOccurrence, cancelled: false },
      }
    );
    assert.equal(restoredAfterManualRemoval.marks[fourthPaidMarkKey], undefined);
    const financeAfterManualRemovalRestore = await jsonRequest(
      baseUrl,
      `/api/teacher-finance?month=${followingMonth}`,
      { token }
    );
    assert.equal(
      financeAfterManualRemovalRestore.students.find((entry) => entry.id === studentId).record.paidAmount,
      0
    );

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
