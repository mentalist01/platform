import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

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

const jsonRequest = async (baseUrl, pathname, options = {}) => {
  const method = options.method || 'GET';
  const headers = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (Object.prototype.hasOwnProperty.call(options, 'body')) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(Object.prototype.hasOwnProperty.call(options, 'body')
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const rawBody = await response.text();
  const expectedStatus = options.status ?? 200;
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${pathname} returned ${response.status}.\n${rawBody}`
  );
  return rawBody ? JSON.parse(rawBody) : null;
};

const login = async (baseUrl, code) => (
  jsonRequest(baseUrl, '/api/login', {
    method: 'POST',
    body: { code },
  })
);

const waitForValue = async (probe, message, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
};

const openWebSocket = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.once('open', () => resolve(ws));
  ws.once('error', reject);
});

const closeWebSocket = (ws) => new Promise((resolve) => {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    resolve();
    return;
  }
  ws.once('close', resolve);
  ws.close();
});

const ids = (values) => values.map((value) => value.id).sort();

test('learning groups keep shared work isolated while legacy student schedules remain independent', {
  timeout: 90_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-learning-groups-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const createdAt = '2026-08-20T10:00:00.000Z';
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([
    {
      id: 'teacher-a',
      name: 'Teacher A',
      code: '110001',
      createdAt,
    },
    {
      id: 'teacher-foreign',
      name: 'Foreign Teacher',
      code: '220001',
      createdAt,
    },
  ]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([
    {
      id: 'student-a',
      name: 'Student A',
      teacherId: 'teacher-a',
      code: '110101',
      grade: '11',
      createdAt,
      deletedAt: null,
    },
    {
      id: 'student-b',
      name: 'Student B',
      teacherId: 'teacher-a',
      code: '110102',
      grade: '11',
      createdAt,
      deletedAt: null,
    },
    {
      id: 'student-c',
      name: 'Student C',
      teacherId: 'teacher-a',
      code: '110103',
      grade: '10',
      createdAt,
      deletedAt: null,
    },
    {
      id: 'student-foreign',
      name: 'Foreign Student',
      teacherId: 'teacher-foreign',
      code: '220101',
      grade: '11',
      createdAt,
      deletedAt: null,
    },
  ]));
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
    'student-a': {
      schedule: [{
        id: 'legacy-existing-a',
        date: '2026-09-03',
        day: 'Четверг',
        weekdayKey: 'thursday',
        time: '16:00',
        durationMinutes: 60,
        subject: 'Existing individual lesson',
      }],
      homeworks: [],
      mockAttempts: {},
    },
    'student-b': { schedule: [], homeworks: [], mockAttempts: {} },
    'student-c': { schedule: [], homeworks: [], mockAttempts: {} },
    'student-foreign': { schedule: [], homeworks: [], mockAttempts: {} },
  }));
  fs.writeFileSync(path.join(dataDir, 'tests.json'), '{}');
  fs.writeFileSync(path.join(dataDir, 'mock-exams.json'), '[]');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverLogs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
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

  try {
    await waitForServer(baseUrl, child, () => serverLogs);

    const teacher = await login(baseUrl, '110001');
    const foreignTeacher = await login(baseUrl, '220001');
    const studentA = await login(baseUrl, '110101');
    const studentB = await login(baseUrl, '110102');
    const studentC = await login(baseUrl, '110103');
    const foreignStudent = await login(baseUrl, '220101');
    assert.equal(teacher.role, 'teacher');
    assert.equal(studentA.role, 'student');

    const created = await jsonRequest(baseUrl, '/api/learning-groups', {
      token: teacher.token,
      method: 'POST',
      status: 201,
      body: {
        name: 'Algorithms mini-group',
        plannedStartDate: '2026-09-01',
        maxStudents: 5,
        telemostUrl: 'telemost.yandex.ru/j/12345678901234',
        studentIds: ['student-a'],
      },
    });
    const groupId = created.group.id;
    assert.equal(created.group.status, 'ready');
    assert.equal(created.group.memberCount, 1);
    assert.equal(created.group.telemostUrl, 'https://telemost.yandex.ru/j/12345678901234');
    assert.deepEqual(created.group.members.map((member) => member.studentId), ['student-a']);

    const foreignMember = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/members`, {
      token: teacher.token,
      method: 'POST',
      status: 409,
      body: { studentId: 'student-foreign' },
    });
    assert.equal(foreignMember.code, 'student_teacher_mismatch');

    const ready = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/members`, {
      token: teacher.token,
      method: 'POST',
      body: { studentId: 'student-b' },
    });
    assert.equal(ready.group.status, 'ready');
    assert.equal(ready.group.memberCount, 2);

    const started = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/start`, {
      token: teacher.token,
      method: 'POST',
      body: {},
    });
    assert.equal(started.group.status, 'active');
    assert.equal(started.group.admissionsOpen, false);

    const lateWithoutReason = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/members`, {
      token: teacher.token,
      method: 'POST',
      status: 409,
      body: { studentId: 'student-c' },
    });
    assert.equal(lateWithoutReason.code, 'late_add_reason_required');

    const lateAdd = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/members`, {
      token: teacher.token,
      method: 'POST',
      body: {
        studentId: 'student-c',
        lateAddReason: 'Transferred after the introductory lesson',
      },
    });
    assert.equal(lateAdd.group.memberCount, 3);
    assert.equal(lateAdd.group.status, 'active');
    const lateMember = lateAdd.group.members.find((member) => member.studentId === 'student-c');
    assert.equal(lateMember.addedAfterStart, true);
    assert.equal(lateMember.overrideReason, 'Transferred after the introductory lesson');

    const scheduled = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/schedule`, {
      token: teacher.token,
      method: 'PUT',
      body: {
        schedule: [{
          date: '2026-09-07',
          time: '18:30',
          durationMinutes: 75,
          subject: 'Algorithms: graphs',
        }],
      },
    });
    assert.equal(scheduled.schedule.length, 1);
    assert.equal(scheduled.group.schedule.length, 1);
    assert.equal(scheduled.schedule[0].date, '2026-09-07');
    assert.equal(scheduled.schedule[0].time, '18:30');

    const studentAIndividualBefore = await jsonRequest(baseUrl, '/api/student-schedule', {
      token: studentA.token,
    });
    const studentBIndividualBefore = await jsonRequest(baseUrl, '/api/student-schedule', {
      token: studentB.token,
    });
    assert.deepEqual(studentAIndividualBefore.map((entry) => entry.id), ['legacy-existing-a']);
    assert.deepEqual(studentBIndividualBefore, []);

    const futureLessonStartAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const activeLessonStartAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const lessonCreated = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/lessons`, {
      token: teacher.token,
      method: 'POST',
      status: 201,
      body: {
        startAt: futureLessonStartAt,
        durationMinutes: 75,
        topic: 'Graph traversal',
        scheduleEntryId: scheduled.schedule[0].id,
      },
    });
    const lessonId = lessonCreated.lesson.id;
    assert.deepEqual(
      lessonCreated.lesson.participantIds.slice().sort(),
      ['student-a', 'student-b', 'student-c']
    );
    assert.equal(lessonCreated.lesson.roomId, `lesson:${lessonId}`);
    assert.equal(lessonCreated.lesson.rtcRoomId, `rtc:lesson:${lessonId}`);
    assert.equal(lessonCreated.lesson.telemostUrl, 'https://telemost.yandex.ru/j/12345678901234');
    assert.equal(lessonCreated.lesson.telemostUrlOverride, '');
    assert.equal(lessonCreated.lesson.usesGroupTelemostUrl, true);

    const changedGroupTelemost = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}`, {
      token: teacher.token,
      method: 'PATCH',
      body: { telemostUrl: 'https://telemost.yandex.ru/j/22222222222222' },
    });
    assert.equal(changedGroupTelemost.group.telemostUrl, 'https://telemost.yandex.ru/j/22222222222222');
    const lessonAfterGroupTelemostChange = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      { token: teacher.token }
    );
    assert.equal(
      lessonAfterGroupTelemostChange.lesson.telemostUrl,
      'https://telemost.yandex.ru/j/22222222222222'
    );
    assert.equal(lessonAfterGroupTelemostChange.lesson.usesGroupTelemostUrl, true);

    const groupRtcDenied = await jsonRequest(
      baseUrl,
      `/api/rtc/presence?roomId=${encodeURIComponent(`rtc:lesson:${lessonId}`)}`,
      { token: teacher.token, status: 403 }
    );
    assert.match(groupRtcDenied.error, /Телемост/i);
    const legacyRtcStillAvailable = await jsonRequest(
      baseUrl,
      `/api/rtc/presence?roomId=${encodeURIComponent('rtc:teacher-a:student-a')}`,
      { token: teacher.token }
    );
    assert.equal(legacyRtcStillAvailable.roomId, 'rtc:teacher-a:student-a');

    const invalidTelemostUpdate = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        status: 400,
        body: { telemostUrl: 'https://example.com/j/not-telemost' },
      }
    );
    assert.equal(invalidTelemostUpdate.code, 'invalid_lesson_telemost_url');

    const updatedTelemost = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        body: { telemostUrl: 'https://telemost.yandex.ru/j/99999999999999' },
      }
    );
    assert.equal(updatedTelemost.lesson.telemostUrl, 'https://telemost.yandex.ru/j/99999999999999');

    const prematureStart = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        status: 409,
        body: { status: 'active' },
      }
    );
    assert.equal(prematureStart.code, 'lesson_not_started');

    const activeLesson = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        body: { status: 'active', startAt: activeLessonStartAt },
      }
    );
    assert.equal(activeLesson.lesson.status, 'active');
    assert.equal(activeLesson.lesson.completedAt, '');
    assert.equal(activeLesson.lesson.telemostUrl, 'https://telemost.yandex.ru/j/99999999999999');

    await jsonRequest(
      baseUrl,
      `/api/rtc/presence?roomId=${encodeURIComponent(`rtc:lesson:${lessonId}`)}`,
      { token: studentA.token, status: 403 }
    );
    const studentLegacyRtcStillAvailable = await jsonRequest(
      baseUrl,
      `/api/rtc/presence?roomId=${encodeURIComponent('rtc:teacher-a:student-a')}`,
      { token: studentA.token }
    );
    assert.equal(studentLegacyRtcStillAvailable.roomId, 'rtc:teacher-a:student-a');

    const studentLesson = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      { token: studentA.token }
    );
    assert.deepEqual(
      studentLesson.lesson.participantIds.slice().sort(),
      ['student-a', 'student-b', 'student-c']
    );
    assert.equal(studentLesson.lesson.boardDocName, `board-lesson-${lessonId}`);
    assert.equal(studentLesson.lesson.telemostUrl, 'https://telemost.yandex.ru/j/99999999999999');
    assert.equal(studentLesson.lesson.status, 'active');

    const replayLessonStart = new Date(Date.now() - (20 * 60 * 1000)).toISOString();
    const replayLessonCreated = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/lessons`, {
      token: teacher.token,
      method: 'POST',
      status: 201,
      body: {
        startAt: replayLessonStart,
        durationMinutes: 15,
        topic: 'Shared replay lesson',
        telemostUrl: 'https://telemost.yandex.ru/j/88888888888888',
      },
    });
    const replayLessonId = replayLessonCreated.lesson.id;
    let teacherReplaySession;
    try {
      teacherReplaySession = await jsonRequest(baseUrl, '/api/lesson-replay/session', {
        token: teacher.token,
        method: 'POST',
        body: { learningLessonId: replayLessonId, via: 'telemost' },
      });
    } catch (error) {
      throw new Error(`${error.message}\n${serverLogs}`);
    }
    const studentReplaySession = await jsonRequest(baseUrl, '/api/lesson-replay/session', {
      token: studentA.token,
      method: 'POST',
      body: { learningLessonId: replayLessonId, via: 'telemost' },
    });
    assert.equal(teacherReplaySession.occurrence.scope, 'learning-group');
    assert.equal(teacherReplaySession.occurrence.lessonId, replayLessonId);
    assert.equal(studentReplaySession.occurrenceKey, teacherReplaySession.occurrenceKey);

    await jsonRequest(baseUrl, '/api/lesson-replay/events', {
      token: teacher.token,
      method: 'POST',
      body: {
        sessionId: teacherReplaySession.sessionId,
        events: [{
          id: 'shared-code-event',
          type: 'code',
          occurredAt: new Date().toISOString(),
          payload: { language: 'python', code: 'print("group")' },
        }],
      },
    });
    await jsonRequest(baseUrl, '/api/lesson-replay/events', {
      token: studentA.token,
      method: 'POST',
      body: {
        sessionId: studentReplaySession.sessionId,
        events: [{
          id: 'shared-board-event',
          type: 'board',
          occurredAt: new Date().toISOString(),
          payload: { mode: 'snapshot', items: [] },
        }],
      },
    });
    const replayAudioBytes = Buffer.from('group-audio');
    const preparedAudio = await jsonRequest(baseUrl, '/api/lesson-replay/audio/prepare', {
      token: teacher.token,
      method: 'POST',
      body: {
        sessionId: teacherReplaySession.sessionId,
        occurredAt: new Date().toISOString(),
        durationMs: 1000,
        mimeType: 'audio/webm',
        sizeBytes: replayAudioBytes.length,
      },
    });
    const audioUploadResponse = await fetch(`${baseUrl}${preparedAudio.uploadUrl}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${teacher.token}`,
        'Content-Type': 'audio/webm',
      },
      body: replayAudioBytes,
    });
    assert.equal(audioUploadResponse.status, 200);
    await jsonRequest(baseUrl, '/api/lesson-replay/audio/complete', {
      token: teacher.token,
      method: 'POST',
      body: { audioId: preparedAudio.audioId },
    });
    await jsonRequest(baseUrl, '/api/lesson-replay/finish', {
      token: teacher.token,
      method: 'POST',
      body: { sessionId: teacherReplaySession.sessionId },
    });
    await jsonRequest(baseUrl, '/api/lesson-replay/finish', {
      token: studentA.token,
      method: 'POST',
      body: { sessionId: studentReplaySession.sessionId },
    });

    const teacherGroupLessons = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons`,
      { token: teacher.token }
    );
    const storedReplayLesson = teacherGroupLessons.lessons.find((lesson) => (
      lesson.id === replayLessonId
    ));
    assert.ok(storedReplayLesson?.replayStorage, JSON.stringify(teacherGroupLessons));
    assert.ok(storedReplayLesson.replayStorage.totalBytes >= replayAudioBytes.length);
    assert.equal(teacherGroupLessons.replayStorageStatus, 'ready');
    assert.equal(
      teacherGroupLessons.replayStorageTotalBytes,
      storedReplayLesson.replayStorage.totalBytes,
      'shared group replay storage must only be counted once'
    );

    const studentGroupLessons = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons`,
      { token: studentA.token }
    );
    assert.equal(Object.hasOwn(studentGroupLessons, 'replayStorageTotalBytes'), false);
    assert.equal(
      Object.hasOwn(
        studentGroupLessons.lessons.find((lesson) => lesson.id === replayLessonId),
        'replayStorage'
      ),
      false
    );

    const studentAHistory = await jsonRequest(
      baseUrl,
      '/api/lesson-history?studentId=student-a&limit=50',
      { token: studentA.token }
    );
    const studentBHistory = await jsonRequest(
      baseUrl,
      '/api/lesson-history?studentId=student-b&limit=50',
      { token: studentB.token }
    );
    const studentAReplayLesson = studentAHistory.items.find((entry) => entry.lessonId === replayLessonId);
    const studentBReplayLesson = studentBHistory.items.find((entry) => entry.lessonId === replayLessonId);
    assert.ok(studentAReplayLesson, JSON.stringify(studentAHistory));
    assert.ok(studentBReplayLesson, JSON.stringify(studentBHistory));
    const studentAReplayDetail = await jsonRequest(
      baseUrl,
      `/api/lesson-history/detail?studentId=student-a&occurrenceKey=${encodeURIComponent(studentAReplayLesson.key)}`,
      { token: studentA.token }
    );
    const studentBReplayDetail = await jsonRequest(
      baseUrl,
      `/api/lesson-history/detail?studentId=student-b&occurrenceKey=${encodeURIComponent(studentBReplayLesson.key)}`,
      { token: studentB.token }
    );
    assert.equal(studentAReplayDetail.replay.occurrence.key, teacherReplaySession.occurrenceKey);
    assert.equal(studentBReplayDetail.replay.occurrence.key, teacherReplaySession.occurrenceKey);
    assert.ok(studentBReplayDetail.replay.events.some((event) => event.id === 'shared-code-event'));
    const replayAudioEvent = studentBReplayDetail.replay.events.find((event) => event.type === 'audio');
    assert.ok(replayAudioEvent);
    const replayAudioResponse = await fetch(
      `${baseUrl}/api/lesson-replay/audio/${encodeURIComponent(replayAudioEvent.payload.audioId)}`
        + `?occurrenceKey=${encodeURIComponent(teacherReplaySession.occurrenceKey)}&studentId=student-b`,
      { headers: { Authorization: `Bearer ${studentB.token}` } }
    );
    assert.equal(replayAudioResponse.status, 200);
    assert.deepEqual(Buffer.from(await replayAudioResponse.arrayBuffer()), replayAudioBytes);

    const studentGroups = await jsonRequest(baseUrl, '/api/learning-groups', {
      token: studentC.token,
    });
    assert.deepEqual(studentGroups.groups.map((group) => group.id), [groupId]);
    assert.equal(studentGroups.groups[0].telemostUrl, 'https://telemost.yandex.ru/j/22222222222222');
    const projectedLateMember = studentGroups.groups[0].members.find((member) => (
      member.studentId === 'student-c'
    ));
    assert.equal(Object.hasOwn(projectedLateMember, 'overrideReason'), false);
    assert.equal(Object.hasOwn(projectedLateMember, 'addedById'), false);
    assert.equal(Object.hasOwn(projectedLateMember, 'removedById'), false);

    const foreignGroupCreated = await jsonRequest(baseUrl, '/api/learning-groups', {
      token: foreignTeacher.token,
      method: 'POST',
      status: 201,
      body: {
        name: 'Foreign group',
        studentIds: ['student-foreign'],
      },
    });
    const foreignGroupId = foreignGroupCreated.group.id;
    const foreignGroups = await jsonRequest(baseUrl, '/api/learning-groups', {
      token: foreignStudent.token,
    });
    assert.deepEqual(foreignGroups.groups.map((group) => group.id), [foreignGroupId]);

    const foreignStudentGroupProbe = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}`, {
      token: foreignStudent.token,
      status: 403,
    });
    assert.equal(foreignStudentGroupProbe.code, 'group_forbidden');
    const foreignTeacherGroupProbe = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}`, {
      token: foreignTeacher.token,
      status: 403,
    });
    assert.equal(foreignTeacherGroupProbe.code, 'group_forbidden');

    const commonMaterial = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/materials`, {
      token: teacher.token,
      method: 'POST',
      status: 201,
      body: {
        title: 'Common theory',
        content: 'Shared only with this group',
        visibility: 'group',
      },
    });
    const lessonMaterial = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/materials`, {
      token: teacher.token,
      method: 'POST',
      status: 201,
      body: {
        title: 'Lesson worksheet',
        content: 'Visible to lesson participants',
        visibility: 'lesson',
        lessonId,
      },
    });
    const foreignMaterial = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${foreignGroupId}/materials`,
      {
        token: foreignTeacher.token,
        method: 'POST',
        status: 201,
        body: {
          title: 'Foreign material',
          content: 'Must not cross group boundaries',
          visibility: 'group',
        },
      }
    );

    const uploadedBytes = Buffer.from('private group upload bytes');
    const uploadBody = new FormData();
    uploadBody.append('file', new Blob([uploadedBytes], { type: 'text/plain' }), 'group-notes.txt');
    uploadBody.append('title', 'Uploaded group notes');
    uploadBody.append('visibility', 'group');
    const uploadResponse = await fetch(`${baseUrl}/api/learning-groups/${groupId}/materials/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher.token}` },
      body: uploadBody,
    });
    const uploadRawBody = await uploadResponse.text();
    assert.equal(uploadResponse.status, 201, uploadRawBody);
    const uploaded = JSON.parse(uploadRawBody);
    assert.equal(uploaded.material.title, 'Uploaded group notes');
    assert.equal(uploaded.material.originalName, 'group-notes.txt');
    assert.equal(uploaded.material.mimeType, 'text/plain');
    assert.equal(uploaded.material.sizeBytes, uploadedBytes.length);
    assert.equal(
      uploaded.material.downloadUrl,
      `/api/learning-groups/${groupId}/materials/${uploaded.material.id}/download`
    );

    const foreignRawMaterialResponse = await fetch(
      `${baseUrl}/uploads/${encodeURIComponent(uploaded.material.storageName)}`,
      { headers: { Authorization: `Bearer ${foreignStudent.token}` } }
    );
    assert.equal(foreignRawMaterialResponse.status, 403);

    const studentMaterials = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/materials`, {
      token: studentA.token,
    });
    assert.deepEqual(ids(studentMaterials.materials), [
      commonMaterial.material.id,
      lessonMaterial.material.id,
      uploaded.material.id,
    ].sort());
    const studentUploadedMaterial = studentMaterials.materials.find((material) => (
      material.id === uploaded.material.id
    ));
    assert.equal(Object.hasOwn(studentUploadedMaterial, 'storageName'), false);

    const studentDownload = await fetch(`${baseUrl}${uploaded.material.downloadUrl}`, {
      headers: { Authorization: `Bearer ${studentA.token}` },
    });
    assert.equal(studentDownload.status, 200);
    assert.deepEqual(Buffer.from(await studentDownload.arrayBuffer()), uploadedBytes);
    const foreignDownload = await fetch(`${baseUrl}${uploaded.material.downloadUrl}`, {
      headers: { Authorization: `Bearer ${foreignStudent.token}` },
    });
    assert.equal(foreignDownload.status, 403);

    await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/materials/${uploaded.material.id}`,
      { token: studentA.token, method: 'DELETE', status: 403 }
    );
    const deletedUpload = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/materials/${uploaded.material.id}`,
      { token: teacher.token, method: 'DELETE' }
    );
    assert.equal(deletedUpload.ok, true);
    assert.notEqual(deletedUpload.material.deletedAt, '');
    const materialsAfterDelete = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/materials`, {
      token: studentA.token,
    });
    assert.deepEqual(ids(materialsAfterDelete.materials), [
      commonMaterial.material.id,
      lessonMaterial.material.id,
    ].sort());
    const deletedDownload = await fetch(`${baseUrl}${uploaded.material.downloadUrl}`, {
      headers: { Authorization: `Bearer ${studentA.token}` },
    });
    assert.equal(deletedDownload.status, 404);
    const deletedRawDownload = await fetch(
      `${baseUrl}/uploads/${encodeURIComponent(uploaded.material.storageName)}`,
      { headers: { Authorization: `Bearer ${studentA.token}` } }
    );
    assert.equal(deletedRawDownload.status, 404);

    const lessonMaterials = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/materials?lessonId=${lessonId}`,
      { token: studentB.token }
    );
    assert.deepEqual(lessonMaterials.materials.map((material) => material.id), [lessonMaterial.material.id]);
    await jsonRequest(baseUrl, `/api/learning-groups/${foreignGroupId}/materials`, {
      token: studentA.token,
      status: 403,
    });
    await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/materials`, {
      token: foreignStudent.token,
      status: 403,
    });

    const crossGroupMaterial = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/assignments`, {
      token: teacher.token,
      method: 'POST',
      status: 404,
      body: {
        title: 'Invalid cross-group assignment',
        content: 'This must be rejected',
        materialIds: [foreignMaterial.material.id],
      },
    });
    assert.equal(crossGroupMaterial.code, 'material_not_found');

    const assignmentCreated = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/assignments`, {
      token: teacher.token,
      method: 'POST',
      status: 201,
      body: {
        lessonId,
        title: 'Graph traversal homework',
        content: 'Solve both tasks independently',
        dueAt: '2026-09-10T18:00:00.000Z',
        materialIds: [commonMaterial.material.id, lessonMaterial.material.id],
        homework: {
          homeWork: 'Solve both tasks independently',
          lessonLink: 'https://example.com/group-lesson',
          boardLink: 'https://example.com/group-board',
          dueAt: '2026-09-10T18:00:00.000Z',
          dueAtMode: 'manual',
          calendarOffsetMinutes: 180,
          daysToComplete: 7,
          goals: [{
            type: 'task',
            assignmentTier: 'required',
            taskNumber: 1,
            levelId: 'basic',
            includeAll: false,
            targetQuestions: [1],
          }],
        },
      },
    });
    const assignmentId = assignmentCreated.assignment.id;
    assert.deepEqual(
      assignmentCreated.assignment.recipientIds.slice().sort(),
      ['student-a', 'student-b', 'student-c']
    );

    const studentAHomework = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: studentA.token,
    });
    const studentAGroupHomework = studentAHomework.homeworks.find((homework) => (
      homework.learningAssignmentId === assignmentId
    ));
    assert.ok(studentAGroupHomework);
    assert.equal(studentAGroupHomework.source, 'learning-group');
    assert.equal(studentAGroupHomework.learningGroupId, groupId);
    assert.equal(studentAGroupHomework.learningGroupName, 'Algorithms mini-group');
    assert.equal(studentAGroupHomework.learningAssignmentTitle, 'Graph traversal homework');
    assert.equal(studentAGroupHomework.homeWork, 'Solve both tasks independently');
    assert.equal(studentAGroupHomework.dueAt, '2026-09-10T18:00:00.000Z');
    assert.equal(studentAGroupHomework.lessonLink, 'https://example.com/group-lesson');
    assert.equal(studentAGroupHomework.boardLink, 'https://example.com/group-board');
    assert.equal(studentAGroupHomework.goals[0].taskNumber, 1);
    assert.deepEqual(studentAGroupHomework.goals[0].targetQuestions, [1]);
    assert.ok(studentAGroupHomework.checklistItems.length > 0);

    const directGroupHomeworkEdit = await jsonRequest(
      baseUrl,
      `/api/student-next-lesson/${encodeURIComponent(studentAGroupHomework.id)}`,
      {
        token: teacher.token,
        method: 'PATCH',
        status: 409,
        body: { studentId: 'student-a', homeWork: 'Must not become personal' },
      }
    );
    assert.equal(directGroupHomeworkEdit.code, 'learning_group_homework_managed_by_group');

    const studentBHomeworkBefore = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: studentB.token,
    });
    const studentBGroupHomeworkBefore = studentBHomeworkBefore.homeworks.find((homework) => (
      homework.learningAssignmentId === assignmentId
    ));
    assert.ok(studentBGroupHomeworkBefore);
    assert.equal(studentBGroupHomeworkBefore.checklistItems[0].completedAt, null);

    const checkedStudentAHomework = await jsonRequest(
      baseUrl,
      `/api/student-next-lesson/${encodeURIComponent(studentAGroupHomework.id)}/checklist`,
      {
        token: studentA.token,
        method: 'PATCH',
        body: {
          itemId: studentAGroupHomework.checklistItems[0].id,
          completed: true,
        },
      }
    );
    assert.ok(checkedStudentAHomework.homework.checklistItems[0].completedAt);

    const studentBHomeworkAfter = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: studentB.token,
    });
    const studentBGroupHomeworkAfter = studentBHomeworkAfter.homeworks.find((homework) => (
      homework.learningAssignmentId === assignmentId
    ));
    assert.equal(studentBGroupHomeworkAfter.checklistItems[0].completedAt, null);

    const foreignHomework = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: foreignStudent.token,
    });
    assert.equal(
      foreignHomework.homeworks.some((homework) => homework.learningAssignmentId === assignmentId),
      false
    );

    await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: teacher.token,
      method: 'PATCH',
      body: {
        studentId: 'student-a',
        homeWork: 'Personal extra task',
        dueAt: '2026-09-11T18:00:00.000Z',
        dueAtMode: 'manual',
        daysToComplete: 7,
        goals: [],
      },
    });
    const studentACombinedHomework = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: studentA.token,
    });
    assert.ok(studentACombinedHomework.homeworks.some((homework) => (
      homework.learningAssignmentId === assignmentId
    )));
    assert.ok(studentACombinedHomework.homeworks.some((homework) => (
      homework.source !== 'learning-group' && homework.homeWork === 'Personal extra task'
    )));

    const draftAssignmentCreated = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/assignments`, {
      token: teacher.token,
      method: 'POST',
      status: 201,
      body: {
        title: 'Draft group homework',
        content: 'This should appear only after publication',
        status: 'draft',
      },
    });
    const draftAssignmentId = draftAssignmentCreated.assignment.id;
    const homeworkWhileDraft = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: studentA.token,
    });
    assert.equal(
      homeworkWhileDraft.homeworks.some((homework) => homework.learningAssignmentId === draftAssignmentId),
      false
    );

    const publishedDraft = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${draftAssignmentId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        body: { status: 'assigned' },
      }
    );
    assert.ok(publishedDraft.assignment.publishedAt);
    const homeworkAfterDraftPublication = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: studentA.token,
    });
    assert.equal(
      homeworkAfterDraftPublication.homeworks.some((homework) => homework.learningAssignmentId === draftAssignmentId),
      true
    );
    const preservedMainHomework = homeworkAfterDraftPublication.homeworks.find((homework) => (
      homework.learningAssignmentId === assignmentId
    ));
    assert.ok(preservedMainHomework.checklistItems[0].completedAt);

    await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/assignments/${draftAssignmentId}`, {
      token: teacher.token,
      method: 'DELETE',
    });
    const homeworkAfterDraftDelete = await jsonRequest(baseUrl, '/api/student-next-lesson', {
      token: studentA.token,
    });
    assert.equal(
      homeworkAfterDraftDelete.homeworks.some((homework) => homework.learningAssignmentId === draftAssignmentId),
      false
    );

    const studentAssignments = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/assignments`, {
      token: studentA.token,
    });
    assert.deepEqual(studentAssignments.assignments.map((assignment) => assignment.id), [assignmentId]);
    assert.deepEqual(studentAssignments.assignments[0].recipientIds, ['student-a']);

    const submittedA = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}/submission`,
      {
        token: studentA.token,
        method: 'PUT',
        body: {
          content: 'Student A private solution',
          status: 'submitted',
        },
      }
    );
    const submittedB = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}/submission`,
      {
        token: studentB.token,
        method: 'PUT',
        body: {
          content: 'Student B private solution',
          status: 'submitted',
        },
      }
    );
    assert.equal(submittedA.submission.studentId, 'student-a');
    assert.equal(submittedB.submission.studentId, 'student-b');
    assert.notEqual(submittedA.submission.id, submittedB.submission.id);

    const studentSubmissionListDenied = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}/submissions`,
      { token: studentA.token, status: 403 }
    );
    assert.match(studentSubmissionListDenied.error, /прав/i);

    const teacherSubmissions = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}/submissions`,
      { token: teacher.token }
    );
    assert.deepEqual(
      teacherSubmissions.submissions.map((submission) => submission.studentId).sort(),
      ['student-a', 'student-b']
    );

    const reviewedA = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}/submissions/student-a/review`,
      {
        token: teacher.token,
        method: 'PATCH',
        body: {
          status: 'reviewed',
          grade: 5,
          privateComment: 'Feedback visible only to Student A',
        },
      }
    );
    assert.equal(reviewedA.submission.status, 'reviewed');
    assert.equal(reviewedA.submission.grade, 5);

    const ownReviewedSubmission = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}/submission`,
      { token: studentA.token }
    );
    assert.equal(ownReviewedSubmission.submission.privateComment, 'Feedback visible only to Student A');

    const studentBProbeForA = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}/submission?studentId=student-a`,
      { token: studentB.token }
    );
    assert.equal(studentBProbeForA.submission.studentId, 'student-b');
    assert.equal(studentBProbeForA.submission.content, 'Student B private solution');
    assert.equal(studentBProbeForA.submission.privateComment, '');
    assert.equal(JSON.stringify(studentBProbeForA).includes('Feedback visible only to Student A'), false);

    const boardA = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses/task-card-1`,
      {
        token: studentA.token,
        method: 'PUT',
        body: {
          answers: [{ value: 'Student A private board answer' }],
          code: 'print("student-a")',
        },
      }
    );
    const boardB = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses/task-card-1`,
      {
        token: studentB.token,
        method: 'PUT',
        body: {
          answers: [{ value: 'Student B private board answer' }],
          code: 'print("student-b")',
        },
      }
    );
    assert.equal(boardA.response.studentId, 'student-a');
    assert.equal(boardB.response.studentId, 'student-b');
    assert.notEqual(boardA.response.id, boardB.response.id);

    const studentBoardList = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses`,
      { token: studentA.token }
    );
    assert.deepEqual(studentBoardList.responses.map((response) => response.studentId), ['student-a']);
    assert.equal(JSON.stringify(studentBoardList).includes('Student B private board answer'), false);

    await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses?studentId=student-b`,
      { token: studentA.token, status: 403 }
    );

    const crossStudentBoardProbe = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses/task-card-1?studentId=student-b`,
      { token: studentA.token, status: 403 }
    );
    assert.equal(crossStudentBoardProbe.code, 'board_response_forbidden');

    const teacherBoardList = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses`,
      { token: teacher.token }
    );
    assert.deepEqual(
      teacherBoardList.responses.map((response) => response.studentId).sort(),
      ['student-a', 'student-b']
    );

    const initialStudentAttendance = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`,
      { token: studentA.token }
    );
    assert.equal(initialStudentAttendance.records.length, 1);
    assert.equal(initialStudentAttendance.records[0].studentId, 'student-a');
    assert.equal(initialStudentAttendance.records[0].status, 'pending');

    const collabBaseUrl = baseUrl.replace(/^http/, 'ws');
    const boardSocket = await openWebSocket(
      `${collabBaseUrl}/collab/${encodeURIComponent(`board-lesson-${lessonId}`)}?_auth=${encodeURIComponent(studentA.token)}`
    );
    const codeSocket = await openWebSocket(
      `${collabBaseUrl}/collab/${encodeURIComponent(`collab-lesson-${lessonId}`)}?_auth=${encodeURIComponent(studentA.token)}`
    );
    const attendanceWithTwoConnections = await waitForValue(async () => {
      const payload = await jsonRequest(
        baseUrl,
        `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`,
        { token: studentA.token }
      );
      const record = payload.records[0];
      return record?.activeConnectionIds?.length === 2 ? record : null;
    }, 'board/collab connections did not join lesson attendance');
    assert.equal(attendanceWithTwoConnections.status, 'present');

    await closeWebSocket(boardSocket);
    await waitForValue(async () => {
      const payload = await jsonRequest(
        baseUrl,
        `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`,
        { token: studentA.token }
      );
      const record = payload.records[0];
      return record?.activeConnectionIds?.length === 1 ? record : null;
    }, 'closing one collab connection removed the whole attendance presence');

    await closeWebSocket(codeSocket);
    const attendanceAfterCollabLeave = await waitForValue(async () => {
      const payload = await jsonRequest(
        baseUrl,
        `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`,
        { token: studentA.token }
      );
      const record = payload.records[0];
      return record?.activeConnectionIds?.length === 0 && record?.lastLeftAt ? record : null;
    }, 'collab connection leave was not persisted');
    assert.equal(attendanceAfterCollabLeave.status, 'present');

    await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`, {
      token: studentA.token,
      method: 'PUT',
      status: 403,
      body: {
        records: [{ studentId: 'student-a', status: 'present' }],
      },
    });
    await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`, {
      token: foreignTeacher.token,
      method: 'PUT',
      status: 403,
      body: {
        records: [{ studentId: 'student-a', status: 'present' }],
      },
    });

    const markedAttendance = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`,
      {
        token: teacher.token,
        method: 'PUT',
        body: {
          records: [
            {
              studentId: 'student-a',
              status: 'present',
              presentSeconds: 3600,
              comment: 'Present for the whole lesson',
            },
            {
              studentId: 'student-b',
              status: 'absent',
              presentSeconds: 0,
              comment: 'Absent',
            },
          ],
        },
      }
    );
    assert.equal(markedAttendance.records.length, 3);
    const attendanceByStudent = Object.fromEntries(
      markedAttendance.records.map((record) => [record.studentId, record])
    );
    assert.equal(attendanceByStudent['student-a'].status, 'present');
    assert.equal(attendanceByStudent['student-a'].presentSeconds, 3600);
    assert.equal(attendanceByStudent['student-b'].status, 'absent');
    assert.equal(attendanceByStudent['student-c'].status, 'pending');

    const studentBAttendance = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`,
      { token: studentB.token }
    );
    assert.equal(studentBAttendance.records.length, 1);
    assert.equal(studentBAttendance.records[0].studentId, 'student-b');
    assert.equal(studentBAttendance.records[0].status, 'absent');
    assert.equal(JSON.stringify(studentBAttendance).includes('student-a'), false);

    await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`, {
      token: foreignStudent.token,
      status: 403,
    });

    const completedLesson = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        body: { status: 'completed' },
      }
    );
    assert.equal(completedLesson.lesson.status, 'completed');
    assert.notEqual(completedLesson.lesson.completedAt, '');
    assert.equal(completedLesson.lesson.telemostUrl, 'https://telemost.yandex.ru/j/99999999999999');

    const completedBoardView = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses/task-card-1`,
      { token: studentA.token }
    );
    assert.equal(completedBoardView.response.answers[0].value, 'Student A private board answer');
    const completedBoardWrite = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/responses/task-card-1`,
      {
        token: studentA.token,
        method: 'PUT',
        status: 409,
        body: { answers: [{ value: 'must not be saved' }] },
      }
    );
    assert.equal(completedBoardWrite.code, 'lesson_read_only');

    const completedBoardSocket = await openWebSocket(
      `${collabBaseUrl}/collab/${encodeURIComponent(`board-lesson-${lessonId}`)}?_auth=${encodeURIComponent(studentA.token)}`
    );
    await closeWebSocket(completedBoardSocket);

    const finalizedAttendance = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}/attendance`,
      { token: teacher.token }
    );
    const finalizedByStudent = Object.fromEntries(
      finalizedAttendance.records.map((record) => [record.studentId, record])
    );
    assert.equal(finalizedByStudent['student-a'].status, 'present');
    assert.deepEqual(finalizedByStudent['student-a'].activeConnectionIds, []);
    assert.equal(finalizedByStudent['student-b'].status, 'absent');
    assert.equal(finalizedByStudent['student-c'].status, 'absent');

    const studentProgress = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/progress`, {
      token: studentA.token,
    });
    assert.deepEqual(studentProgress.progress.members.map((member) => member.studentId), ['student-a']);
    assert.equal(studentProgress.progress.self.studentId, 'student-a');
    assert.equal(studentProgress.progress.self.assignments.total, 1);
    assert.equal(studentProgress.progress.self.assignments.reviewed, 1);
    assert.equal(studentProgress.progress.self.attendance.present, 1);
    assert.equal(JSON.stringify(studentProgress).includes('student-b'), false);

    const teacherProgress = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/progress`, {
      token: teacher.token,
    });
    assert.deepEqual(
      teacherProgress.progress.members.map((member) => member.studentId).sort(),
      ['student-a', 'student-b', 'student-c']
    );

    const groupNoteForm = new FormData();
    groupNoteForm.append('file', new Blob(['print("shared group note")'], { type: 'text/plain' }), 'group-note.py');
    groupNoteForm.append('taskNumber', '27');
    groupNoteForm.append('category', 'class');
    groupNoteForm.append('learningGroupId', groupId);
    groupNoteForm.append('learningLessonId', lessonId);
    groupNoteForm.append('source', 'collab-code');
    const groupNoteResponse = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher.token}` },
      body: groupNoteForm,
    });
    const groupNoteRaw = await groupNoteResponse.text();
    assert.equal(groupNoteResponse.status, 200, groupNoteRaw);
    const groupNote = JSON.parse(groupNoteRaw);
    assert.equal(groupNote.sharedScope, 'learning-group-notes');
    assert.equal(groupNote.groupId, groupId);
    assert.equal(groupNote.lessonId, lessonId);
    assert.deepEqual(groupNote.participantIds.sort(), ['student-a', 'student-b', 'student-c']);

    for (const studentSession of [studentA, studentB]) {
      const studentFiles = await jsonRequest(baseUrl, '/api/files?taskNumber=27&category=class', {
        token: studentSession.token,
      });
      assert.equal(studentFiles.filter((file) => file.id === groupNote.id).length, 1);
    }
    const teacherStudentCFiles = await jsonRequest(
      baseUrl,
      '/api/files?studentId=student-c&taskNumber=27&category=class',
      { token: teacher.token }
    );
    assert.equal(teacherStudentCFiles.filter((file) => file.id === groupNote.id).length, 1);
    const foreignFiles = await jsonRequest(baseUrl, '/api/files?taskNumber=27&category=class', {
      token: foreignStudent.token,
    });
    assert.equal(foreignFiles.some((file) => file.id === groupNote.id), false);

    const storedGroupNotes = JSON.parse(fs.readFileSync(path.join(dataDir, 'files.json'), 'utf8'))
      .filter((file) => file.id === groupNote.id);
    assert.equal(storedGroupNotes.length, 1);

    const groupNoteDownload = await fetch(`${baseUrl}${groupNote.url}?studentId=student-a`, {
      headers: { Authorization: `Bearer ${studentA.token}` },
    });
    assert.equal(groupNoteDownload.status, 200);
    assert.equal(await groupNoteDownload.text(), 'print("shared group note")');

    const unauthorizedGroupNoteForm = new FormData();
    unauthorizedGroupNoteForm.append('file', new Blob(['forbidden'], { type: 'text/plain' }), 'forbidden.py');
    unauthorizedGroupNoteForm.append('taskNumber', '27');
    unauthorizedGroupNoteForm.append('category', 'class');
    unauthorizedGroupNoteForm.append('learningGroupId', groupId);
    unauthorizedGroupNoteForm.append('learningLessonId', lessonId);
    const unauthorizedGroupNoteResponse = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentA.token}` },
      body: unauthorizedGroupNoteForm,
    });
    assert.equal(unauthorizedGroupNoteResponse.status, 403);

    const legacyCreated = await jsonRequest(baseUrl, '/api/student-schedule', {
      token: teacher.token,
      method: 'POST',
      body: {
        studentId: 'student-b',
        date: '2026-09-08',
        time: '17:00',
        durationMinutes: 45,
        subject: 'Legacy individual lesson',
      },
    });
    assert.equal(legacyCreated.subject, 'Legacy individual lesson');
    const studentBIndividualAfter = await jsonRequest(baseUrl, '/api/student-schedule', {
      token: studentB.token,
    });
    assert.deepEqual(studentBIndividualAfter.map((entry) => entry.id), [legacyCreated.id]);

    const groupAfterLegacySchedule = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}`, {
      token: teacher.token,
    });
    assert.equal(groupAfterLegacySchedule.group.schedule.length, 1);
    assert.equal(groupAfterLegacySchedule.group.schedule[0].id, scheduled.schedule[0].id);

    const completed = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}/complete`, {
      token: teacher.token,
      method: 'POST',
      body: {},
    });
    assert.equal(completed.group.status, 'completed');
    assert.equal(typeof completed.group.completedAt, 'string');
    assert.notEqual(completed.group.completedAt, '');

    const correctedArchiveGroup = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}`, {
      token: teacher.token,
      method: 'PATCH',
      body: { name: 'Archive corrected group', plannedStartDate: '2026-09-02' },
    });
    assert.equal(correctedArchiveGroup.group.name, 'Archive corrected group');
    assert.equal(correctedArchiveGroup.group.plannedStartDate, '2026-09-02');
    const rejectedArchiveStructure = await jsonRequest(baseUrl, `/api/learning-groups/${groupId}`, {
      token: teacher.token,
      method: 'PATCH',
      status: 409,
      body: { maxStudents: 4 },
    });
    assert.equal(rejectedArchiveStructure.code, 'group_completed');

    const correctedArchiveLesson = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/lessons/${lessonId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        body: { topic: 'Archive corrected topic', note: 'Corrected after completion' },
      }
    );
    assert.equal(correctedArchiveLesson.lesson.topic, 'Archive corrected topic');
    assert.equal(correctedArchiveLesson.lesson.note, 'Corrected after completion');

    const correctedArchiveAssignment = await jsonRequest(
      baseUrl,
      `/api/learning-groups/${groupId}/assignments/${assignmentId}`,
      {
        token: teacher.token,
        method: 'PATCH',
        body: { content: 'Archive corrected homework text' },
      }
    );
    assert.equal(correctedArchiveAssignment.assignment.content, 'Archive corrected homework text');

    const activeGroupsAfterCompletion = await jsonRequest(baseUrl, '/api/learning-groups', {
      token: teacher.token,
    });
    assert.deepEqual(activeGroupsAfterCompletion.groups, []);
    const allGroupsAfterCompletion = await jsonRequest(
      baseUrl,
      '/api/learning-groups?includeCompleted=1',
      { token: teacher.token }
    );
    assert.deepEqual(allGroupsAfterCompletion.groups.map((group) => group.id), [groupId]);
  } finally {
    await stopServer(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
