import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLessonReplayPlaybackState,
  getLessonReplayActorRole,
  getLessonReplayFollowSurface,
} from './lessonReplayPlaybackState.js';

const events = [
  {
    id: 'teacher-board-navigation',
    type: 'navigation',
    offsetMs: 100,
    actor: { role: 'teacher' },
    payload: { view: 'board' },
  },
  {
    id: 'student-code-navigation',
    type: 'navigation',
    offsetMs: 150,
    actor: { role: 'student' },
    payload: { view: 'collab' },
  },
  {
    id: 'student-code',
    type: 'code',
    offsetMs: 200,
    actor: { role: 'student' },
    payload: { code: 'print(1)' },
  },
  {
    id: 'teacher-board',
    type: 'board',
    offsetMs: 250,
    actor: { role: 'teacher' },
    payload: { mode: 'snapshot', items: [{ id: 'line', type: 'line' }] },
  },
  {
    id: 'teacher-board-view',
    type: 'viewport',
    offsetMs: 300,
    actor: { role: 'teacher' },
    payload: { surface: 'board', zoom: 2 },
  },
  {
    id: 'student-code-view',
    type: 'viewport',
    offsetMs: 350,
    actor: { role: 'student' },
    payload: { surface: 'code', cursorLine: 7 },
  },
];

test('keeps shared board and code state visible to both followed actors', () => {
  const state = buildLessonReplayPlaybackState(events, 350);

  assert.equal(state.actors.teacher.code?.id, 'student-code');
  assert.equal(state.actors.student.code?.id, 'student-code');
  assert.equal(state.actors.teacher.board?.id, 'teacher-board');
  assert.equal(state.actors.student.board?.id, 'teacher-board');
  assert.equal(state.actors.teacher.boardView?.id, 'teacher-board-view');
  assert.equal(state.actors.teacher.codeView, null);
  assert.equal(state.actors.student.codeView?.id, 'student-code-view');
  assert.equal(state.actors.student.boardView, null);
});

test('follows each participant navigation without switching on the other actor edit', () => {
  assert.equal(getLessonReplayFollowSurface(events, 200, 'teacher'), 'board');
  assert.equal(getLessonReplayFollowSurface(events, 250, 'student'), 'code');
  assert.equal(getLessonReplayFollowSurface(events, 350, 'teacher'), 'board');
  assert.equal(getLessonReplayFollowSurface(events, 350, 'student'), 'code');
});

test('keeps passive code checkpoints neutral while retaining verified edits', () => {
  const passiveSnapshot = {
    type: 'code',
    actor: { id: 'student-1', role: 'student', name: 'Олег' },
    payload: { action: 'snapshot', actorVerified: false, code: 'print(1)' },
  };
  const verifiedEdit = {
    ...passiveSnapshot,
    payload: { ...passiveSnapshot.payload, action: 'edit', actorVerified: true },
  };

  assert.equal(getLessonReplayActorRole(passiveSnapshot), '');
  assert.equal(getLessonReplayActorRole(verifiedEdit), 'student');
});
