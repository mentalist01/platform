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

test('interleaved solution runs and viewports retain each solution state across seeks', () => {
  const code = (id, offsetMs, solutionId) => ({
    id, type: 'code', offsetMs, payload: { solutionId, code: `print("${solutionId}")` },
  });
  const run = (id, offsetMs, solutionId) => ({
    id, type: 'run', offsetMs, actor: { role: 'student' }, payload: { solutionId, output: id },
  });
  const view = (id, offsetMs, solutionId) => ({
    id, type: 'viewport', offsetMs, actor: { role: 'teacher' },
    payload: { surface: 'code', solutionId, cursorLine: offsetMs },
  });
  const source = [
    code('copy-code', 0, 'copy'),
    run('copy-run', 10, 'copy'),
    view('copy-view', 20, 'copy'),
    run('main-run', 30, 'main'),
    view('main-view', 40, 'main'),
    code('main-code', 50, 'main'),
    code('copy-again', 60, 'copy'),
  ];
  const read = createLessonReplayPlaybackLookup(source);
  const index = createLessonReplayPlaybackIndex(source);
  for (const position of [40, 60, 50, 20, 40]) {
    const expectedSolution = position === 50 ? 'main' : 'copy';
    const state = read(position);
    assert.equal(state.run.id, `${expectedSolution}-run`);
    assert.equal(state.codeView.id, `${expectedSolution}-view`);
    assert.equal(state.actors.teacher.codeView.id, `${expectedSolution}-view`);
    assert.equal(state.actors.student.run.id, `${expectedSolution}-run`);
    assert.deepEqual(state, buildLessonReplayPlaybackState(source, position, index));
  }
  assert.equal(read(20).codeRuns.has('main'), false, 'later runs must not mutate cached snapshots');
  assert.equal(read(20).actors.teacher.codeViews.has('main'), false);
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

test('independent tab heartbeats never steal selection, while switches edits and runs select their code', () => {
  const snapshot = (id, offsetMs, solutionId, code, extra = {}) => ({
    id, type: 'code', offsetMs, actor: { role: 'teacher' },
    payload: { action: 'snapshot', solutionId, code, ...extra },
  });
  const source = [
    snapshot('initial-main', 0, 'main', 'print(1)'),
    snapshot('inactive-copy', 10, 'copy', 'print(2)'),
    snapshot('select-copy', 20, 'copy', 'print(2)', { solutionSelected: true }),
    snapshot('main-heartbeat', 30, 'main', 'print(3)'),
    snapshot('copy-heartbeat', 40, 'copy', 'print(2)'),
    { id: 'main-run', type: 'run', offsetMs: 50, payload: { solutionId: 'main', output: '3' } },
    snapshot('copy-edit', 60, 'copy', 'print(4)', { action: 'edit', actorVerified: true }),
    ...Array.from({ length: 40 }, (_, index) => snapshot(`heartbeat-${index}`, 70 + index, 'main', `print(${index})`)),
    snapshot('select-main', 120, 'main', 'print(39)', { solutionSelected: true }),
    { id: 'legacy-snapshot', type: 'code', offsetMs: 130, payload: { action: 'snapshot', code: 'legacy' } },
  ];
  const read = createLessonReplayPlaybackLookup(source);
  const index = createLessonReplayPlaybackIndex(source, 16);
  for (const [position, solutionId, code] of [
    [10, 'main', 'print(1)'], [40, 'copy', 'print(2)'], [50, 'main', 'print(3)'],
    [109, 'copy', 'print(4)'], [120, 'main', 'print(39)'], [20, 'copy', 'print(2)'],
    [109, 'copy', 'print(4)'], [130, undefined, 'legacy'],
  ]) {
    const state = read(position);
    assert.equal(state.code.payload.solutionId, solutionId);
    assert.equal(state.code.payload.code, code);
    assert.deepEqual(state, buildLessonReplayPlaybackState(source, position, index));
    assert.deepEqual(state, buildLessonReplayPlaybackState(source, position));
  }
  assert.equal(read(10).codeSnapshots.get('main').payload.code, 'print(1)');
  assert.equal(read(30).current.id, 'select-copy');
  assert.equal(getLessonReplayActorRole(source[2]), 'teacher');
});

test('a versioned heartbeat cannot pull following away from the board', () => {
  const source = [
    { type: 'navigation', offsetMs: 0, actor: { role: 'teacher' }, payload: { view: 'board' } },
    { type: 'code', offsetMs: 30, actor: { role: 'teacher' }, payload: {
      solutionId: 'main', action: 'snapshot', actorVerified: true, code: 'print(1)',
    } },
  ];
  assert.equal(getLessonReplayFollowSurface(source, 30, 'teacher'), 'board');
  source.push({ ...source[1], offsetMs: 40, payload: { ...source[1].payload, solutionSelected: true } });
  assert.equal(getLessonReplayFollowSurface(source, 40, 'teacher'), 'code');
});

test('followed actors keep independent selected tabs while receiving shared edits in the same tab', () => {
  const code = (id, offsetMs, role, solutionId, extra = {}) => ({
    id, type: 'code', offsetMs, actor: { role },
    payload: { action: 'snapshot', solutionId, code: id, ...extra },
  });
  const source = [
    code('teacher-main', 0, 'teacher', 'main'),
    code('student-copy', 10, 'student', 'copy'),
    code('student-edit-copy', 20, 'student', 'copy', { action: 'edit' }),
    code('teacher-heartbeat', 30, 'teacher', 'main'),
    code('teacher-edit-main', 40, 'teacher', 'main', { action: 'edit' }),
    { id: 'copy-run', type: 'run', offsetMs: 50, actor: { role: 'student' }, payload: { solutionId: 'copy', output: 'copy' } },
    { id: 'main-run', type: 'run', offsetMs: 60, actor: { role: 'teacher' }, payload: { solutionId: 'main', output: 'main' } },
    code('teacher-selects-copy', 70, 'teacher', 'copy', { solutionSelected: true }),
    code('shared-copy-edit', 80, 'student', 'copy', { action: 'edit' }),
    code('stale-main-checkpoint', 90, 'teacher', 'main'),
  ];
  const read = createLessonReplayPlaybackLookup(source);
  for (const position of [60, 20, 90, 30, 50, 80]) {
    const state = read(position);
    assert.deepEqual(state, buildLessonReplayPlaybackState(source, position));
    assert.equal(state.actors.student.code.payload.solutionId, 'copy');
    assert.equal(state.actors.teacher.code.payload.solutionId, position < 70 ? 'main' : 'copy');
    if (position >= 80) assert.equal(state.actors.teacher.code.id, 'shared-copy-edit');
  }
  assert.equal(read(60).actors.teacher.run.id, 'main-run');
  assert.equal(read(60).actors.student.run.id, 'copy-run');
  assert.equal(read(60).actors.teacher.codeSnapshots.get('copy').id, 'student-edit-copy');
});
