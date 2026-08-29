import assert from 'node:assert/strict';
import test from 'node:test';

import { repairLessonReplayBoardActors } from './lessonReplayBoardActors.js';

const teacher = { role: 'teacher', id: 'teacher-1', name: 'Иван' };
const student = { role: 'student', id: 'student-1', name: 'Олег' };

test('attributes an all-new board delta to the author of its objects', () => {
  const events = [
    { id: 'teacher-session', type: 'session', actor: teacher, payload: { action: 'start' } },
    { id: 'student-session', type: 'session', actor: student, payload: { action: 'start' } },
    { id: 'baseline', type: 'board', actor: student, payload: { mode: 'snapshot', items: [] } },
    {
      id: 'passive-checkpoint',
      type: 'board',
      actor: student,
      payload: {
        mode: 'delta',
        removedIds: [],
        upserts: [
          { index: 0, item: { id: 'stroke-1', type: 'stroke', authorId: teacher.id } },
          { index: 1, item: { id: 'stroke-2', type: 'stroke', authorId: teacher.id } },
        ],
      },
    },
  ];

  const repaired = repairLessonReplayBoardActors(events);
  assert.deepEqual(repaired[3].actor, teacher);
  assert.deepEqual(events[3].actor, student);
});

test('does not guess the actor for edits or mixed-author additions', () => {
  const events = [
    { id: 'teacher-session', type: 'session', actor: teacher, payload: { action: 'start' } },
    { id: 'student-session', type: 'session', actor: student, payload: { action: 'start' } },
    {
      id: 'baseline',
      type: 'board',
      actor: teacher,
      payload: { mode: 'snapshot', items: [{ id: 'existing', type: 'stroke', authorId: teacher.id }] },
    },
    {
      id: 'edit',
      type: 'board',
      actor: student,
      payload: {
        mode: 'delta',
        removedIds: [],
        upserts: [{ index: 0, item: { id: 'existing', type: 'stroke', authorId: teacher.id } }],
      },
    },
    {
      id: 'mixed',
      type: 'board',
      actor: student,
      payload: {
        mode: 'delta',
        removedIds: [],
        upserts: [
          { index: 1, item: { id: 'teacher-new', type: 'stroke', authorId: teacher.id } },
          { index: 2, item: { id: 'student-new', type: 'stroke', authorId: student.id } },
        ],
      },
    },
  ];

  const repaired = repairLessonReplayBoardActors(events);
  assert.equal(repaired[3].actor, null);
  assert.equal(repaired[4].actor, null);
});

test('keeps the authenticated actor on new verified board events', () => {
  const [event] = repairLessonReplayBoardActors([{
    id: 'verified-removal',
    type: 'board',
    actor: teacher,
    payload: { mode: 'delta', actorVerified: true, upserts: [], removedIds: ['shape-1'] },
  }]);

  assert.deepEqual(event.actor, teacher);
});
