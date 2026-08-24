import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEARNING_ATTENDANCE_STATUS,
  applyLearningAttendanceEvent,
  authorizeLearningCollabUpgrade,
  authorizeLearningRealtimeRoom,
  buildLearningAttendanceKey,
  buildLearningLessonBoardDocName,
  buildLearningLessonCollabDocName,
  buildLearningLessonRoomId,
  buildLearningLessonRoomNames,
  buildLearningLessonRtcRoomId,
  canAccessLearningLessonSession,
  createLearningAttendanceRecord,
  createLearningAttendanceRoster,
  extractCollabDocNameFromRequestUrl,
  finalizeLearningAttendanceRecord,
  hasActiveLearningGroupWorkspace,
  normalizeLearningAttendanceRecord,
  normalizeLearningAttendanceRecords,
  parseLearningLessonRoomTarget,
  resolveLearningRealtimeRoomTarget,
  resolveLegacyLearningRoomTarget,
} from './learningLessonAccess.js';

const session = {
  id: '8e8d75b4-a2ed-4cf0-a5bf-81a2cd74c858',
  groupId: 'group-a',
  teacherId: 'teacher-a',
  participantIds: ['student-a', 'student-b'],
  status: 'scheduled',
};

const group = {
  id: 'group-a',
  teacherId: 'teacher-a',
  members: [
    { studentId: 'student-a', status: 'active', joinedAt: '2026-08-01T00:00:00.000Z' },
    { studentId: 'student-c', status: 'active', joinedAt: '2026-08-02T00:00:00.000Z' },
    { studentId: 'student-left', status: 'left', leftAt: '2026-08-03T00:00:00.000Z' },
  ],
};

const legacyStudents = [
  { id: 'student-with-hyphens', teacherId: 'teacher-with-hyphens' },
  { id: 'student-b', teacherId: 'teacher-a' },
];

test('builds one stable set of transport room names from a lesson session id', () => {
  assert.deepEqual(buildLearningLessonRoomNames(session.id), {
    sessionId: session.id,
    roomId: `lesson:${session.id}`,
    rtcRoomId: `rtc:lesson:${session.id}`,
    boardDocName: `board-lesson-${session.id}`,
    collabDocName: `collab-lesson-${session.id}`,
  });
  assert.equal(buildLearningLessonRoomId(session.id), `lesson:${session.id}`);
  assert.equal(buildLearningLessonRtcRoomId(session.id), `rtc:lesson:${session.id}`);
  assert.equal(buildLearningLessonBoardDocName(session.id), `board-lesson-${session.id}`);
  assert.equal(buildLearningLessonCollabDocName(session.id), `collab-lesson-${session.id}`);
});

test('room builders reject path, delimiter and control-character injection', () => {
  for (const invalid of ['', '../lesson', 'lesson/id', 'lesson:id', 'lesson\nid', 'урок']) {
    assert.equal(buildLearningLessonRoomNames(invalid), null);
  }
});

test('parses canonical, rtc, board and collab lesson targets without parsing legacy ids', () => {
  const values = [
    [`lesson:${session.id}`, 'lesson'],
    [`rtc:lesson:${session.id}`, 'rtc'],
    [`board-lesson-${session.id}`, 'board'],
    [`collab-lesson-${session.id}`, 'collab'],
  ];
  values.forEach(([roomId, kind]) => {
    assert.deepEqual(parseLearningLessonRoomTarget(roomId), {
      targetType: 'lesson',
      kind,
      sessionId: session.id,
      roomId,
      canonicalRoomId: `lesson:${session.id}`,
      legacy: false,
    });
  });
  assert.equal(parseLearningLessonRoomTarget('board-teacher-a-student-a'), null);
  assert.equal(parseLearningLessonRoomTarget('collab-lesson-../../secret'), null);
});

test('lesson ACL accepts admin, owner teacher, participant snapshot and active group member', () => {
  const options = { groups: [group] };
  assert.equal(canAccessLearningLessonSession({ role: 'admin', id: 'admin-a' }, session, options), true);
  assert.equal(canAccessLearningLessonSession({ role: 'teacher', id: 'teacher-a' }, session, options), true);
  assert.equal(canAccessLearningLessonSession({ role: 'student', id: 'student-b' }, session, options), true);
  assert.equal(canAccessLearningLessonSession({ role: 'student', id: 'student-c' }, session, options), true);
});

test('lesson ACL rejects another teacher, removed group member, parent and an unrelated student', () => {
  const options = { groups: [group] };
  assert.equal(canAccessLearningLessonSession({ role: 'teacher', id: 'teacher-b' }, session, options), false);
  assert.equal(canAccessLearningLessonSession({ role: 'student', id: 'student-left' }, session, options), false);
  assert.equal(canAccessLearningLessonSession({ role: 'student', id: 'student-x' }, session, options), false);
  assert.equal(canAccessLearningLessonSession({ role: 'parent', id: 'parent-a', studentId: 'student-a' }, session, options), false);
});

test('participant snapshot keeps past lesson access after the member leaves the group', () => {
  const pastSession = { ...session, participantIds: ['student-left'], status: 'completed' };
  assert.equal(canAccessLearningLessonSession(
    { role: 'student', id: 'student-left' },
    pastSession,
    { groups: [group] }
  ), true);
});

test('a member removed during a lesson cannot keep the live room, but keeps a fully finished lesson', () => {
  const lesson = {
    ...session,
    participantIds: ['student-left'],
    startAt: '2026-08-03T10:00:00.000Z',
    durationMinutes: 60,
    status: 'active',
  };
  const removedDuringLesson = {
    ...group,
    members: [{
      studentId: 'student-left',
      status: 'removed',
      leftAt: '2026-08-03T10:30:00.000Z',
    }],
  };
  assert.equal(canAccessLearningLessonSession(
    { role: 'student', id: 'student-left' },
    lesson,
    { groups: [removedDuringLesson] }
  ), false);
  assert.equal(canAccessLearningLessonSession(
    { role: 'student', id: 'student-left' },
    { ...lesson, status: 'completed' },
    {
      groups: [{
        ...removedDuringLesson,
        members: [{
          ...removedDuringLesson.members[0],
          leftAt: '2026-08-03T10:30:00.000Z',
        }],
      }],
    }
  ), true);
});

test('legacy rooms are resolved by full generated name even when ids contain hyphens', () => {
  assert.deepEqual(
    resolveLegacyLearningRoomTarget(
      'board-teacher-with-hyphens-student-with-hyphens',
      legacyStudents
    ),
    {
      targetType: 'student',
      kind: 'board',
      teacherId: 'teacher-with-hyphens',
      studentId: 'student-with-hyphens',
      roomId: 'board-teacher-with-hyphens-student-with-hyphens',
      legacy: true,
      student: legacyStudents[0],
    }
  );
  assert.equal(
    resolveLegacyLearningRoomTarget(
      'py-collab:py-sync:student-with-hyphens:100:python:question-1',
      legacyStudents
    )?.kind,
    'python'
  );
});

test('a lesson-looking legacy collision falls back to exact legacy matching when no session exists', () => {
  const collisionStudent = { id: 'student-a', teacherId: 'lesson' };
  const target = resolveLearningRealtimeRoomTarget({
    roomId: 'board-lesson-student-a',
    sessions: [],
    students: [collisionStudent],
  });
  assert.equal(target?.legacy, true);
  assert.equal(target?.teacherId, 'lesson');
  assert.equal(target?.studentId, 'student-a');
});

test('realtime authorization protects lesson rooms and preserves exact legacy rooms', () => {
  const lessonAccess = authorizeLearningRealtimeRoom({
    auth: { role: 'student', id: 'student-a' },
    roomId: `board-lesson-${session.id}`,
    sessions: [session],
    groups: [group],
    students: legacyStudents,
    allowedKinds: ['board'],
  });
  assert.equal(lessonAccess.allowed, true);
  assert.equal(lessonAccess.target?.session, session);

  const legacyAccess = authorizeLearningRealtimeRoom({
    auth: { role: 'student', id: 'student-b', teacherId: 'teacher-a' },
    roomId: 'collab-teacher-a-student-b',
    sessions: [session],
    groups: [group],
    students: legacyStudents,
    allowedKinds: ['collab'],
  });
  assert.equal(legacyAccess.allowed, true);
  assert.equal(legacyAccess.target?.legacy, true);
});

test('an active group member cannot open a separate legacy board or code room', () => {
  const activeGroup = { ...group, status: 'active' };
  const activeStudent = { id: 'student-a', teacherId: 'teacher-a' };
  assert.equal(hasActiveLearningGroupWorkspace('student-a', 'teacher-a', [activeGroup]), true);
  for (const roomId of ['board-teacher-a-student-a', 'collab-teacher-a-student-a']) {
    const access = authorizeLearningRealtimeRoom({
      auth: { role: 'student', id: 'student-a', teacherId: 'teacher-a' },
      roomId,
      sessions: [session],
      groups: [activeGroup],
      students: [...legacyStudents, activeStudent],
    });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, 'group-workspace-required');
  }
});

test('a forming or ready group member also uses the shared workspace', () => {
  const student = { id: 'student-a', teacherId: 'teacher-a' };
  for (const status of ['forming', 'ready']) {
    const groupForStatus = {
      ...group,
      status,
      members: [{ studentId: 'student-a', status: 'active' }],
    };
    assert.equal(hasActiveLearningGroupWorkspace('student-a', 'teacher-a', [groupForStatus]), true);
    const access = authorizeLearningRealtimeRoom({
      auth: { role: 'student', id: 'student-a', teacherId: 'teacher-a' },
      roomId: 'board-teacher-a-student-a',
      sessions: [session],
      groups: [groupForStatus],
      students: [...legacyStudents, student],
      allowedKinds: ['board'],
    });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, 'group-workspace-required');
  }
});

test('realtime authorization denies unauthenticated, unknown, wrong-kind and cross-student access', () => {
  assert.equal(authorizeLearningRealtimeRoom({
    roomId: `board-lesson-${session.id}`,
    sessions: [session],
  }).reason, 'unauthenticated');

  assert.equal(authorizeLearningRealtimeRoom({
    auth: { role: 'teacher', id: 'teacher-a' },
    roomId: 'collab-lesson-unknown-session',
    sessions: [session],
  }).reason, 'unknown-room');

  assert.equal(authorizeLearningRealtimeRoom({
    auth: { role: 'teacher', id: 'teacher-a' },
    roomId: `rtc:lesson:${session.id}`,
    sessions: [session],
    groups: [group],
    allowedKinds: ['board'],
  }).reason, 'invalid-room-kind');

  assert.equal(authorizeLearningRealtimeRoom({
    auth: { role: 'student', id: 'student-with-hyphens', teacherId: 'teacher-with-hyphens' },
    roomId: 'collab-teacher-a-student-b',
    students: legacyStudents,
  }).reason, 'forbidden');
});

test('an explicit registry callback can authorize a known non-learning legacy document only', () => {
  const known = authorizeLearningRealtimeRoom({
    auth: { role: 'teacher', id: 'teacher-a' },
    roomId: 'sandbox-known-token',
    authorizeAdditionalRoom: ({ roomId }) => roomId === 'sandbox-known-token',
  });
  const unknown = authorizeLearningRealtimeRoom({
    auth: { role: 'teacher', id: 'teacher-a' },
    roomId: 'sandbox-unknown-token',
    authorizeAdditionalRoom: ({ roomId }) => roomId === 'sandbox-known-token',
  });
  assert.equal(known.allowed, true);
  assert.equal(known.target?.targetType, 'registered');
  assert.equal(unknown.allowed, false);
});

test('collab upgrade extracts one decoded document name and applies the same ACL', () => {
  const encodedDocName = encodeURIComponent(`collab-lesson-${session.id}`);
  assert.equal(
    extractCollabDocNameFromRequestUrl(`/collab/${encodedDocName}?room=${session.id}`),
    `collab-lesson-${session.id}`
  );
  assert.equal(extractCollabDocNameFromRequestUrl('/collab/%2E%2E%2Fsecret'), '');
  assert.equal(extractCollabDocNameFromRequestUrl('/rtc/collab-lesson-id'), '');

  const access = authorizeLearningCollabUpgrade({
    requestUrl: `/collab/${encodedDocName}`,
    auth: { role: 'student', id: 'student-a' },
    sessions: [session],
    groups: [group],
    students: legacyStudents,
  });
  assert.equal(access.allowed, true);
  assert.equal(access.docName, `collab-lesson-${session.id}`);

  const completedAccess = authorizeLearningCollabUpgrade({
    requestUrl: `/collab/${encodedDocName}`,
    auth: { role: 'student', id: 'student-a' },
    sessions: [{ ...session, status: 'completed' }],
    groups: [group],
  });
  assert.equal(completedAccess.allowed, true);
  assert.equal(completedAccess.readOnly, true);

  const cancelledAccess = authorizeLearningCollabUpgrade({
    requestUrl: `/collab/${encodedDocName}`,
    auth: { role: 'student', id: 'student-a' },
    sessions: [{ ...session, status: 'cancelled' }],
    groups: [group],
  });
  assert.equal(cancelledAccess.allowed, false);
  assert.equal(cancelledAccess.reason, 'session-not-live');
});

test('teacher can prepare a future group workspace while students stay read-only', () => {
  const futureSession = {
    ...session,
    startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    durationMinutes: 60,
  };
  const requestUrl = `/collab/${encodeURIComponent(`board-lesson-${session.id}`)}`;
  const teacherAccess = authorizeLearningCollabUpgrade({
    requestUrl,
    auth: { role: 'teacher', id: 'teacher-a' },
    sessions: [futureSession],
    groups: [group],
  });
  const studentAccess = authorizeLearningCollabUpgrade({
    requestUrl,
    auth: { role: 'student', id: 'student-a' },
    sessions: [futureSession],
    groups: [group],
  });

  assert.equal(teacherAccess.allowed, true);
  assert.equal(teacherAccess.readOnly, false);
  assert.equal(studentAccess.allowed, true);
  assert.equal(studentAccess.readOnly, true);
});

test('attendance normalization creates a stable student-per-session identity', () => {
  const record = normalizeLearningAttendanceRecord({
    sessionId: 'session-a',
    studentId: 'student-a',
    status: 'unknown',
    presentSeconds: -10,
    firstJoinedAt: 'invalid',
    comment: ` ${'x'.repeat(1200)} `,
  });
  assert.equal(record.id, buildLearningAttendanceKey('session-a', 'student-a'));
  assert.equal(record.status, LEARNING_ATTENDANCE_STATUS.PENDING);
  assert.equal(record.presentSeconds, 0);
  assert.equal(record.attendedSeconds, 0);
  assert.equal(record.firstJoinedAt, '');
  assert.equal(record.comment.length, 1000);
  assert.equal(normalizeLearningAttendanceRecord({ studentId: 'student-a' }), null);
});

test('attendance roster snapshots every participant once and keeps durable state', () => {
  const rosterSession = {
    id: 'session-a',
    groupId: 'group-a',
    participantIds: ['student-a', 'student-a', 'student-b'],
  };
  const existing = createLearningAttendanceRecord({
    sessionId: 'session-a',
    studentId: 'student-a',
    groupId: 'group-a',
    status: LEARNING_ATTENDANCE_STATUS.PARTIAL,
    presentSeconds: 600,
    markedAt: '2026-08-22T10:30:00.000Z',
    markedById: 'teacher-a',
  });
  const roster = createLearningAttendanceRoster(rosterSession, [existing]);
  assert.equal(roster.length, 2);
  assert.equal(roster[0].status, LEARNING_ATTENDANCE_STATUS.PARTIAL);
  assert.equal(roster[1].status, LEARNING_ATTENDANCE_STATUS.PENDING);
  assert.equal(roster[1].groupId, 'group-a');
});

test('attendance counts one continuous interval across duplicate tabs', () => {
  let record = createLearningAttendanceRecord({ sessionId: 'session-a', studentId: 'student-a' });
  record = applyLearningAttendanceEvent(record, {
    type: 'join', clientId: 'tab-1', at: '2026-08-22T10:00:00.000Z',
  });
  record = applyLearningAttendanceEvent(record, {
    type: 'join', clientId: 'tab-2', at: '2026-08-22T10:05:00.000Z',
  });
  record = applyLearningAttendanceEvent(record, {
    type: 'join', clientId: 'tab-2', at: '2026-08-22T10:06:00.000Z',
  });
  record = applyLearningAttendanceEvent(record, {
    type: 'leave', clientId: 'tab-1', at: '2026-08-22T10:10:00.000Z',
  });
  assert.equal(record.presentSeconds, 0);
  assert.deepEqual(record.activeConnectionIds, ['tab-2']);
  record = applyLearningAttendanceEvent(record, {
    type: 'leave', clientId: 'tab-2', at: '2026-08-22T10:20:00.000Z',
  });
  assert.equal(record.presentSeconds, 20 * 60);
  assert.equal(record.attendedSeconds, 20 * 60);
  assert.equal(record.firstJoinedAt, '2026-08-22T10:00:00.000Z');
  assert.equal(record.lastLeftAt, '2026-08-22T10:20:00.000Z');
});

test('attendance accumulates reconnect intervals without counting disconnected time', () => {
  let record = createLearningAttendanceRecord({ sessionId: 'session-a', studentId: 'student-a' });
  for (const event of [
    { type: 'join', clientId: 'one', at: '2026-08-22T10:00:00.000Z' },
    { type: 'leave', clientId: 'one', at: '2026-08-22T10:10:00.000Z' },
    { type: 'join', clientId: 'two', at: '2026-08-22T10:15:00.000Z' },
    { type: 'leave', clientId: 'two', at: '2026-08-22T10:25:00.000Z' },
  ]) record = applyLearningAttendanceEvent(record, event);
  assert.equal(record.presentSeconds, 20 * 60);
});

test('manual attendance status survives realtime events and can be unmarked', () => {
  let record = createLearningAttendanceRecord({ sessionId: 'session-a', studentId: 'student-a' });
  record = applyLearningAttendanceEvent(record, {
    type: 'mark',
    status: LEARNING_ATTENDANCE_STATUS.EXCUSED,
    at: '2026-08-22T09:55:00.000Z',
    markedById: 'teacher-a',
    comment: 'Предупредил заранее',
  });
  record = applyLearningAttendanceEvent(record, {
    type: 'join', clientId: 'tab', at: '2026-08-22T10:00:00.000Z',
  });
  record = applyLearningAttendanceEvent(record, {
    type: 'leave', clientId: 'tab', at: '2026-08-22T10:05:00.000Z',
  });
  assert.equal(record.status, LEARNING_ATTENDANCE_STATUS.EXCUSED);
  assert.equal(record.presentSeconds, 300);

  record = applyLearningAttendanceEvent(record, { type: 'unmark' });
  assert.equal(record.status, LEARNING_ATTENDANCE_STATUS.PRESENT);
  assert.equal(record.markedAt, '');
});

test('finalizing attendance closes active presence and marks a no-show absent', () => {
  const noShow = finalizeLearningAttendanceRecord(
    createLearningAttendanceRecord({ sessionId: 'session-a', studentId: 'student-a' }),
    '2026-08-22T11:00:00.000Z'
  );
  assert.equal(noShow.status, LEARNING_ATTENDANCE_STATUS.ABSENT);

  let present = createLearningAttendanceRecord({ sessionId: 'session-a', studentId: 'student-b' });
  present = applyLearningAttendanceEvent(present, {
    type: 'join', clientId: 'tab', at: '2026-08-22T10:00:00.000Z',
  });
  present = finalizeLearningAttendanceRecord(present, '2026-08-22T11:00:00.000Z');
  assert.equal(present.status, LEARNING_ATTENDANCE_STATUS.PRESENT);
  assert.equal(present.presentSeconds, 3600);
  assert.deepEqual(present.activeConnectionIds, []);
});

test('attendance store keeps the latest normalized record for each session/student key', () => {
  const records = normalizeLearningAttendanceRecords({ records: [
    { sessionId: 'session-a', studentId: 'student-a', presentSeconds: 60 },
    { sessionId: 'session-a', studentId: 'student-a', presentSeconds: 120 },
    { sessionId: 'session-a', studentId: 'student-b', attendedSeconds: 30 },
    { sessionId: '', studentId: 'invalid' },
  ] });
  assert.equal(records.length, 2);
  assert.equal(records[0].presentSeconds, 120);
  assert.equal(records[1].presentSeconds, 30);
  assert.equal(records[1].attendedSeconds, 30);
});
