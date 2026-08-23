import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LearningGroupDomainError,
  addLearningGroupMember,
  completeLearningGroup,
  createLearningAssignment,
  createLearningGroup,
  createLearningLessonSession,
  createLearningMaterial,
  getActiveLearningGroupMembers,
  normalizeLearningAttendanceStore,
  reviewLearningSubmission,
  setLearningGroupSchedule,
  startLearningGroup,
  updateLearningGroup,
  updateLearningAssignment,
  updateLearningLessonSession,
  upsertLearningAttendanceRecord,
  upsertLearningBoardResponse,
  upsertLearningSubmission,
} from './learningGroups.js';

const NOW = '2026-08-22T09:00:00.000Z';
const teacherId = 'teacher-a';
const makeGroup = (overrides = {}) => createLearningGroup({
  name: 'ЕГЭ — высокий балл',
  maxStudents: 5,
  plannedStartDate: '2026-09-01',
  ...overrides,
}, { id: 'group-a', teacherId, now: NOW });
const student = (id, ownerTeacherId = teacherId) => ({ id, teacherId: ownerTeacherId });
const add = (group, id, options = {}) => addLearningGroupMember(group, student(id), {
  actorId: teacherId,
  now: NOW,
  ...options,
});

test('new groups are forming and capacity is constrained to 2..5', () => {
  const group = makeGroup();
  assert.equal(group.status, 'forming');
  assert.equal(group.maxStudents, 5);
  assert.equal(group.admissionsOpen, true);
  assert.throws(
    () => makeGroup({ maxStudents: 6 }),
    (error) => error instanceof LearningGroupDomainError && error.code === 'invalid_group_capacity'
  );
});

test('group stores one validated permanent Telemost link', () => {
  const group = makeGroup({ telemostUrl: 'telemost.yandex.ru/j/group-room' });
  assert.equal(group.telemostUrl, 'https://telemost.yandex.ru/j/group-room');
  const updated = updateLearningGroup(group, {
    telemostUrl: 'https://telemost.yandex.ru/j/new-group-room',
  }, { now: '2026-08-22T10:00:00.000Z' });
  assert.equal(updated.telemostUrl, 'https://telemost.yandex.ru/j/new-group-room');
  assert.throws(
    () => updateLearningGroup(group, { telemostUrl: 'https://example.com/not-telemost' }),
    (error) => error.code === 'invalid_group_telemost_url'
  );
});

test('first same-teacher member makes a group ready and members stay unique', () => {
  let group = add(makeGroup(), 'student-a');
  assert.equal(group.status, 'ready');
  group = add(group, 'student-b');
  assert.equal(group.status, 'ready');
  assert.equal(getActiveLearningGroupMembers(group).length, 2);
  assert.throws(() => add(group, 'student-a'), /уже состоит/i);
  assert.throws(
    () => addLearningGroupMember(group, student('foreign', 'teacher-b')),
    (error) => error.code === 'student_teacher_mismatch'
  );
});

test('a group can start with one member and closes admissions after start', () => {
  assert.throws(
    () => startLearningGroup(makeGroup(), { now: NOW }),
    (error) => error.code === 'not_enough_members' && error.statusCode === 409
  );
  const oneMember = add(makeGroup(), 'student-a');
  const active = startLearningGroup(oneMember, { now: NOW });
  assert.equal(active.status, 'active');
  assert.equal(active.admissionsOpen, false);
  assert.ok(active.startedAt);
});

test('late addition requires a reason and records an audit marker', () => {
  let group = add(add(makeGroup(), 'student-a'), 'student-b');
  group = startLearningGroup(group, { now: NOW });
  assert.throws(
    () => add(group, 'student-c'),
    (error) => error.code === 'late_add_reason_required'
  );
  group = add(group, 'student-c', { lateAddReason: 'Уровень совпадает, пройдена только вводная тема' });
  const membership = group.members.find((entry) => entry.studentId === 'student-c');
  assert.equal(membership.addedAfterStart, true);
  assert.match(membership.overrideReason, /уровень совпадает/i);
});

test('active group completes without regressing its status', () => {
  const active = startLearningGroup(add(add(makeGroup(), 'student-a'), 'student-b'), { now: NOW });
  const completed = completeLearningGroup(active, { now: '2027-05-20T09:00:00.000Z' });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.admissionsOpen, false);
});

test('group schedule validates recurring and dated slots', () => {
  let counter = 0;
  const group = setLearningGroupSchedule(makeGroup(), [
    { weekdayKey: 'monday', time: '18:30', durationMinutes: 60, subject: 'Кодирование' },
    { date: '2026-09-05', time: '10:00', durationMinutes: 90, subject: 'Пробник' },
  ], { now: NOW, idFactory: () => `slot-${++counter}` });
  assert.deepEqual(group.schedule.map((entry) => entry.id), ['slot-1', 'slot-2']);
  assert.equal(group.schedule[1].durationMinutes, 90);
  assert.throws(() => setLearningGroupSchedule(group, [{ weekdayKey: 'noday', time: '99:99' }]), /расписание/i);
});

test('lesson session snapshots participants and exposes stable transport names', () => {
  const active = startLearningGroup(add(add(makeGroup(), 'student-a'), 'student-b'), { now: NOW });
  const lesson = createLearningLessonSession(active, {
    startAt: '2026-09-01T15:00:00.000Z',
    durationMinutes: 60,
    topic: 'Системы счисления',
    telemostUrl: 'telemost.yandex.ru/j/1234567890',
    source: 'google-calendar',
    externalCalendarProvider: 'Google Calendar',
    externalEventId: 'series@example.test',
    externalOccurrenceId: 'google-ical-occurrence-a',
  }, { id: 'lesson-a', now: NOW });
  assert.deepEqual(lesson.participantIds.sort(), ['student-a', 'student-b']);
  assert.equal(lesson.roomId, 'lesson:lesson-a');
  assert.equal(lesson.rtcRoomId, 'rtc:lesson:lesson-a');
  assert.equal(lesson.boardDocName, 'board-lesson-lesson-a');
  assert.equal(lesson.telemostUrl, 'https://telemost.yandex.ru/j/1234567890');
  assert.equal(lesson.source, 'google-calendar');
  assert.equal(lesson.externalCalendarProvider, 'Google Calendar');
  assert.equal(lesson.externalEventId, 'series@example.test');
  assert.equal(lesson.externalOccurrenceId, 'google-ical-occurrence-a');

  const updated = updateLearningLessonSession(lesson, {
    telemostUrl: 'https://telemost.yandex.ru/j/0987654321',
  }, { now: '2026-08-22T10:00:00.000Z' });
  assert.equal(updated.telemostUrl, 'https://telemost.yandex.ru/j/0987654321');
  assert.throws(
    () => updateLearningLessonSession(lesson, { telemostUrl: 'https://example.com/j/not-telemost' }),
    (error) => error.code === 'invalid_lesson_telemost_url'
  );
  assert.throws(
    () => createLearningLessonSession(active, {
      startAt: '2026-09-02T15:00:00.000Z',
      telemostUrl: 'https://example.com/j/not-telemost',
    }, { id: 'lesson-b', now: NOW }),
    (error) => error.code === 'invalid_lesson_telemost_url'
  );
});

test('one assignment has per-student submissions and private reviews', () => {
  const active = startLearningGroup(add(add(makeGroup(), 'student-a'), 'student-b'), { now: NOW });
  const assignment = createLearningAssignment(active, {
    title: 'Домашняя работа №1',
    content: 'Решить задания 1–5',
    dueAt: '2026-09-08T15:00:00.000Z',
  }, { id: 'assignment-a', now: NOW });
  assert.deepEqual(assignment.recipientIds.sort(), ['student-a', 'student-b']);
  assert.equal(assignment.publishedAt, NOW);
  const submitted = upsertLearningSubmission(null, assignment, 'student-a', {
    content: 'Моё решение',
    status: 'submitted',
  }, { id: 'submission-a', now: NOW });
  const reviewed = reviewLearningSubmission(submitted, {
    grade: 5,
    privateComment: 'Хорошая работа',
  }, { actorId: teacherId, now: NOW });
  assert.equal(reviewed.studentId, 'student-a');
  assert.equal(reviewed.status, 'reviewed');
  assert.equal(reviewed.grade, 5);
  assert.equal(reviewed.privateComment, 'Хорошая работа');
});

test('a group assignment preserves the regular homework template', () => {
  const active = startLearningGroup(add(add(makeGroup(), 'student-a'), 'student-b'), { now: NOW });
  const assignment = createLearningAssignment(active, {
    title: 'Домашняя работа',
    content: 'Повторить конспект',
    dueAt: '2026-09-08T15:00:00.000Z',
    homework: {
      homeWork: 'Повторить конспект',
      lessonLink: 'https://example.com/lesson',
      boardLink: 'https://example.com/board',
      dueAt: '2026-09-08T15:00:00.000Z',
      dueAtMode: 'manual',
      calendarOffsetMinutes: 180,
      daysToComplete: 6,
      goals: [{
        type: 'task',
        assignmentTier: 'required',
        taskNumber: 6,
        levelId: 'basic',
        includeAll: false,
        targetQuestions: [1, 2, 3],
        targetQuestionIds: ['q-1', 'q-2', 'q-3'],
      }],
    },
  }, { id: 'assignment-template', now: NOW });

  assert.equal(assignment.homework.homeWork, 'Повторить конспект');
  assert.equal(assignment.homework.calendarOffsetMinutes, 180);
  assert.deepEqual(assignment.homework.goals[0].targetQuestions, [1, 2, 3]);
  assert.deepEqual(assignment.homework.goals[0].targetQuestionIds, ['q-1', 'q-2', 'q-3']);
});

test('an assignment draft gets one stable publication timestamp when assigned', () => {
  const active = startLearningGroup(add(add(makeGroup(), 'student-a'), 'student-b'), { now: NOW });
  const draft = createLearningAssignment(active, {
    title: 'Черновик домашней работы',
    status: 'draft',
  }, { id: 'assignment-draft', now: NOW });
  assert.equal(draft.publishedAt, '');
  const publishedAt = '2026-08-23T09:00:00.000Z';
  const assigned = updateLearningAssignment(draft, { status: 'assigned' }, { now: publishedAt });
  assert.equal(assigned.publishedAt, publishedAt);
  const edited = updateLearningAssignment(assigned, { content: 'Обновлённое условие' }, {
    now: '2026-08-24T09:00:00.000Z',
  });
  assert.equal(edited.publishedAt, publishedAt);
});

test('attendance can be marked only for a lesson participant', () => {
  const active = startLearningGroup(add(add(makeGroup(), 'student-a'), 'student-b'), { now: NOW });
  const lesson = createLearningLessonSession(active, {
    startAt: '2026-09-01T15:00:00.000Z',
  }, { id: 'lesson-a', now: NOW });
  const record = upsertLearningAttendanceRecord(null, lesson, 'student-a', {
    status: 'present',
    presentSeconds: 3400,
  }, { id: 'attendance-a', actorId: teacherId, now: NOW });
  assert.equal(record.presentSeconds, 3400);
  assert.throws(
    () => upsertLearningAttendanceRecord(null, lesson, 'student-c', { status: 'present' }, { id: 'x' }),
    (error) => error.code === 'student_not_in_lesson'
  );
});

test('attendance persistence keeps active connection state for a later leave event', () => {
  const [record] = normalizeLearningAttendanceStore([{
    id: 'lesson-a:student-a',
    groupId: 'group-a',
    sessionId: 'lesson-a',
    studentId: 'student-a',
    status: 'present',
    firstJoinedAt: NOW,
    lastJoinedAt: NOW,
    activeSince: NOW,
    activeConnectionIds: ['tab-a'],
  }]);

  assert.deepEqual(record.activeConnectionIds, ['tab-a']);
  assert.equal(record.activeSince, NOW);
});

test('materials use explicit group or lesson scope', () => {
  const groupMaterial = createLearningMaterial(makeGroup(), {
    title: 'Конспект',
    content: 'Материал по теме',
    visibility: 'group',
  }, { id: 'material-a', now: NOW });
  assert.equal(groupMaterial.groupId, 'group-a');
  assert.equal(groupMaterial.visibility, 'group');
  assert.throws(
    () => createLearningMaterial(makeGroup(), { content: 'x', visibility: 'lesson' }, { id: 'bad' }),
    (error) => error.code === 'material_lesson_required'
  );
});

test('shared board keeps a separate response for every lesson participant', () => {
  const active = startLearningGroup(add(add(makeGroup(), 'student-a'), 'student-b'), { now: NOW });
  const lesson = createLearningLessonSession(active, {
    startAt: '2026-09-01T15:00:00.000Z',
  }, { id: 'lesson-a', now: NOW });
  const first = upsertLearningBoardResponse(null, lesson, 'task-card-1', 'student-a', {
    answers: ['42'],
    code: 'print(42)',
    checkState: 'correct',
  }, { id: 'response-a', now: NOW });
  const second = upsertLearningBoardResponse(null, lesson, 'task-card-1', 'student-b', {
    answers: ['17'],
    checkState: 'wrong',
  }, { id: 'response-b', now: NOW });

  assert.equal(first.studentId, 'student-a');
  assert.equal(second.studentId, 'student-b');
  assert.notDeepEqual(first.answers, second.answers);
  assert.throws(
    () => upsertLearningBoardResponse(null, lesson, 'task-card-1', 'student-c', { answers: ['x'] }, { id: 'x' }),
    (error) => error.code === 'student_not_in_lesson'
  );
  const completedLesson = updateLearningLessonSession(lesson, { status: 'completed' }, { now: NOW });
  assert.throws(
    () => upsertLearningBoardResponse(first, completedLesson, 'task-card-1', 'student-a', {
      answers: ['changed after completion'],
    }, { id: first.id, now: NOW }),
    (error) => error.code === 'lesson_read_only' && error.statusCode === 409
  );
});
