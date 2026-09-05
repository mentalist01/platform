import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLessonReplayPlaybackState,
  createLessonReplayPlaybackIndex,
  createLessonReplayPlaybackLookup,
  getLessonReplayActorRole,
  getLessonReplayFollowSurface,
} from './lessonReplayPlaybackState.js';

test('indexed playback matches reconstruction across forward and backward seeks', () => {
  const source = [
    ...events,
    { id: 'audio', type: 'audio', offsetMs: 400, payload: { audioId: 'segment' } },
    { id: 'task', type: 'task', offsetMs: 500, actor: { role: 'student' }, payload: {} },
    { id: 'close', type: 'task', offsetMs: 500, actor: { role: 'student' }, payload: { active: false } },
    { id: 'screen', type: 'screen', offsetMs: 600, actor: { role: 'teacher' }, payload: {} },
    { id: 'stop', type: 'screen', offsetMs: 700, actor: { role: 'teacher' }, payload: { active: false } },
  ];
  const read = createLessonReplayPlaybackLookup(source);
  for (const position of [0, 100, 349, 500, 800, 600, 200, 400, 700, 0]) {
    assert.deepEqual(read(position), buildLessonReplayPlaybackState(source, position));
  }
  assert.equal(read(351), read(399), 'clock ticks reuse the same snapshot');
  assert.notEqual(read(399), read(400));
  assert.equal(read(600).screen.id, 'screen', 'later queries do not mutate earlier states');
});

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

test('indexed playback produces the same state when seeking across a long lesson', () => {
  const longEvents = Array.from({ length: 520 }, (_, index) => ({
    id: `event-${index}`,
    type: index % 3 === 0 ? 'board' : (index % 3 === 1 ? 'code' : 'navigation'),
    offsetMs: index * 125,
    actor: { role: index % 2 === 0 ? 'teacher' : 'student' },
    payload: index % 3 === 0
      ? { mode: 'snapshot', items: [{ id: `item-${index}` }] }
      : (index % 3 === 1 ? { code: `print(${index})` } : { view: 'progress' }),
  }));
  const playbackIndex = createLessonReplayPlaybackIndex(longEvents, 32);
  [0, 124, 125, 8_000, 32_625, 64_875, 99_999].forEach((positionMs) => {
    assert.deepEqual(
      buildLessonReplayPlaybackState(longEvents, positionMs, playbackIndex),
      buildLessonReplayPlaybackState(longEvents, positionMs)
    );
  });
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
