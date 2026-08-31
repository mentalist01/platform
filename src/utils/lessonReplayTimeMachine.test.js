import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLessonReplayPlaybackState } from './lessonReplayPlaybackState.js';
import {
  getLessonReplayBoardContentBounds,
  resolveLessonReplayBoardViewport,
} from './lessonReplayBoardViewport.js';
import {
  createLessonReplayBranch,
  createLessonReplayBranchMetadata,
  getLessonReplayStateAt,
  updateLessonReplayBranchBoard,
  updateLessonReplayBranchCode,
} from './lessonReplayTimeMachine.js';

const replay = {
  version: 1,
  occurrence: {
    key: 'student-7:2026-08-08:18:00',
    studentId: 'student-7',
    dayKey: '2026-08-08',
    time: '18:00',
    startMs: 1_754_674_400_000,
  },
  events: [
    {
      id: 'future-code',
      type: 'code',
      offsetMs: 40_000,
      payload: { code: 'print("future")', output: 'future' },
    },
    {
      id: 'board-delta',
      type: 'board',
      offsetMs: 20_000,
      payload: {
        mode: 'delta',
        removedIds: ['shape-1'],
        upserts: [
          { index: 0, item: { id: 'text-1', type: 'text', text: 'new' } },
          { index: 1, item: { id: 'stroke-1', type: 'stroke', points: [{ x: 1, y: 2 }] } },
        ],
      },
    },
    {
      id: 'initial-code',
      type: 'code',
      offsetMs: 5_000,
      payload: { language: 'python', code: 'print(1)', input: '1' },
    },
    {
      id: 'board-snapshot',
      type: 'board',
      offsetMs: 4_000,
      payload: {
        mode: 'snapshot',
        items: [
          { id: 'text-1', type: 'text', text: 'old' },
          { id: 'shape-1', type: 'shape', shape: 'rectangle' },
        ],
      },
    },
    {
      id: 'current-code',
      type: 'code',
      offsetMs: 15_000,
      payload: { language: 'python', code: 'print(2)', input: '2', output: '2' },
    },
    {
      id: 'current-run',
      type: 'run',
      offsetMs: 18_000,
      payload: { status: 'success', output: '2\n', error: '' },
    },
  ],
};

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

test('materializes code, run result and board deltas at the selected replay moment', () => {
  const source = deepFreeze(structuredClone(replay));
  const state = getLessonReplayStateAt(source, 20_000);

  assert.deepEqual(state.code, {
    language: 'python',
    code: 'print(2)',
    input: '2',
    testFile: '',
    output: '2\n',
    error: '',
    status: 'success',
  });
  assert.deepEqual(state.board.items, [
    { id: 'text-1', type: 'text', text: 'new' },
    { id: 'stroke-1', type: 'stroke', points: [{ x: 1, y: 2 }] },
  ]);

  state.code.code = 'changed only in state';
  state.board.items[0].text = 'changed only in state';
  assert.equal(source.events[4].payload.code, 'print(2)');
  assert.equal(source.events[1].payload.upserts[0].item.text, 'new');
});

test('preserves omitted objects from a server-truncated legacy board keyframe', () => {
  const state = getLessonReplayStateAt({
    events: [
      {
        id: 'complete',
        type: 'board',
        offsetMs: 0,
        payload: {
          mode: 'snapshot',
          items: [
            { id: 'a', type: 'text', text: 'old' },
            { id: 'b', type: 'text', text: 'must stay' },
          ],
        },
      },
      {
        id: 'truncated',
        type: 'board',
        offsetMs: 1000,
        payload: {
          mode: 'snapshot',
          items: [{ id: 'a', type: 'text', text: 'updated' }],
          truncated: true,
        },
      },
    ],
  }, 1000);

  assert.deepEqual(state.board.items.map((item) => [item.id, item.text]), [
    ['a', 'updated'],
    ['b', 'must stay'],
  ]);
});

test('fullscreen copies include the same recovered initial board at 0:00, 1:23 and 1:31', () => {
  const initialItems = Array.from({ length: 177 }, (_, index) => ({
    id: `initial-${index}`, type: 'text', text: `Initial ${index}`, x: 100, y: 6900 + index,
  }));
  const delayedItems = Array.from({ length: 513 }, (_, index) => ({
    id: `delayed-${index}`, type: 'text', text: `Delayed ${index}`, x: 100, y: 8400 + index,
  }));
  const delta = (id, offsetMs, items, startIndex = 0) => ({
    id, type: 'board', offsetMs,
    payload: {
      mode: 'delta', actorVerified: false, removedIds: [],
      upserts: items.map((item, index) => ({ index: startIndex + index, item })),
    },
  });
  const source = deepFreeze({ events: [
    { id: 'warmup', type: 'board', offsetMs: 22_199, payload: { mode: 'snapshot', items: [] } },
    delta('first-sync', 27_173, initialItems),
    delta('duplicate-sync', 32_482, initialItems),
    delta('delayed-tail', 87_175, delayedItems.slice(0, 1), 177),
    delta('delayed-middle', 87_176, delayedItems.slice(1), 178),
    {
      id: 'real-edit', type: 'board', offsetMs: 125_000,
      payload: {
        mode: 'delta', actorVerified: true, removedIds: ['initial-0'],
        upserts: [{ index: 0, item: { id: 'new', type: 'text', text: 'A later edit' } }],
      },
    },
  ] });

  const expected = [...initialItems, ...delayedItems];
  const expectedViewport = {
    surface: 'board', width: 900, height: 520,
    ...resolveLessonReplayBoardViewport(
      null,
      { width: 900, height: 520 },
      getLessonReplayBoardContentBounds(initialItems),
      { minZoom: 0.15, maxZoom: 12 }
    ),
  };
  for (const positionMs of [0, 83_000, 91_000, 83_000]) {
    const copy = createLessonReplayBranch(source, positionMs);
    assert.equal(copy.board.items.length, expected.length, `object count at ${positionMs} ms`);
    assert.deepEqual(copy.board.items, expected, `board at ${positionMs} ms`);
    assert.notStrictEqual(copy.board.items[0], initialItems[0]);
    assert.deepEqual(copy.board.viewport, expectedViewport, `initial camera at ${positionMs} ms`);
  }
  const edited = createLessonReplayBranch(source, 125_000);
  assert.equal(edited.board.items[0].id, 'new');
  assert.equal(edited.board.items.some((item) => item.id === 'initial-0'), false);
  assert.equal(edited.board.items.length, expected.length);
});

test('copies and resets preserve legacy board and code navigation like the inline player', () => {
  const boardViewport = { zoom: 0.8, offset: { x: 120, y: 6900 }, width: 900, height: 520 };
  const codeViewport = { scrollTopRatio: 0.6, cursorLine: 14, cursorColumn: 5 };
  const source = deepFreeze({ events: [
    { id: 'board', type: 'board', offsetMs: 0, payload: { items: [{ id: 'task', x: 120, y: 6900 }] } },
    { id: 'code', type: 'code', offsetMs: 0, payload: { code: 'print(1)' } },
    { id: 'board-view', type: 'board-view', offsetMs: 1000, actor: { role: 'teacher' }, payload: boardViewport },
    { id: 'code-view', type: 'code-view', offsetMs: 2000, actor: { role: 'teacher' }, payload: codeViewport },
    { id: 'later-board-view', type: 'viewport', offsetMs: 3000, actor: { role: 'student' }, payload: {
      surface: 'board', zoom: 1.2, offset: { x: 500, y: 8000 }, width: 1200, height: 700,
    } },
  ] });

  for (const positionMs of [2000, 3000, 2000]) {
    const inline = buildLessonReplayPlaybackState(source.events, positionMs);
    const branch = createLessonReplayBranch(source, positionMs);
    assert.deepEqual(branch.board.viewport, inline.boardView.payload);
    assert.deepEqual(branch.code.viewport, inline.codeView.payload);
    branch.board.viewport.offset.y = -10_000;
    const reset = createLessonReplayBranch(source, branch.metadata.positionMs);
    assert.deepEqual(reset.board.viewport, inline.boardView.payload);
  }
  const teacherBranch = createLessonReplayBranch(source, 3000, { actorRole: 'teacher' });
  assert.deepEqual(teacherBranch.board.viewport, boardViewport);
  assert.deepEqual(teacherBranch.code.viewport, codeViewport);
});

test('falls back to embedded camera and editor positions when separate navigation events are absent', () => {
  const boardViewport = { zoom: 0.8, offset: { x: 120, y: 6900 }, width: 900, height: 520 };
  const codeViewport = { scrollTopRatio: 0.6, cursorLine: 14, cursorColumn: 5 };
  for (const [boardKey, codeKey] of [['viewport', 'editor'], ['view', 'view']]) {
    const source = deepFreeze({ events: [
      { id: 'board', type: 'board', offsetMs: 0, payload: {
        items: [{ id: 'task', x: 120, y: 6900 }], [boardKey]: boardViewport,
      } },
      { id: 'code', type: 'code', offsetMs: 0, payload: { code: 'print(1)', [codeKey]: codeViewport } },
    ] });
    const branch = createLessonReplayBranch(source, 0);
    assert.deepEqual(branch.board.viewport, boardViewport);
    assert.deepEqual(branch.code.viewport, codeViewport);
    assert.notStrictEqual(branch.board.viewport.offset, boardViewport.offset);
    assert.notStrictEqual(branch.code.viewport, codeViewport);
  }
});

test('creates deterministic metadata anchored to the student and replay position', () => {
  const first = createLessonReplayBranchMetadata(replay, 20_000.4);
  const second = createLessonReplayBranchMetadata(structuredClone(replay), 20_000);
  const later = createLessonReplayBranchMetadata(replay, 20_001);

  assert.deepEqual(first, second);
  assert.equal(first.studentId, 'student-7');
  assert.equal(first.occurrenceKey, replay.occurrence.key);
  assert.equal(first.positionMs, 20_000);
  assert.equal(first.sourceEventId, 'board-delta');
  assert.equal(first.sourceEventOffsetMs, 20_000);
  assert.match(first.branchId, /^lesson-replay-branch-[a-z0-9]+$/);
  assert.notEqual(first.branchId, later.branchId);
});

test('updates an isolated branch without changing replay data or previous revisions', () => {
  const source = deepFreeze(structuredClone(replay));
  const branch = createLessonReplayBranch(source, 20_000);
  const codeRevision = updateLessonReplayBranchCode(branch, (draft) => {
    draft.code = 'print(3)';
    draft.output = '';
    draft.status = 'edited';
  });
  const boardRevision = updateLessonReplayBranchBoard(codeRevision, (items) => {
    items[0].text = 'branch text';
    items.push({ id: 'shape-2', type: 'shape', shape: 'ellipse' });
  });

  assert.equal(branch.revision, 0);
  assert.equal(branch.code.code, 'print(2)');
  assert.equal(branch.board.items[0].text, 'new');
  assert.equal(codeRevision.revision, 1);
  assert.equal(codeRevision.code.code, 'print(3)');
  assert.equal(codeRevision.board.items.length, 2);
  assert.equal(boardRevision.revision, 2);
  assert.equal(boardRevision.board.items[0].text, 'branch text');
  assert.equal(boardRevision.board.items.length, 3);
  assert.equal(boardRevision.branchId, branch.branchId);
  assert.deepEqual(boardRevision.metadata, branch.metadata);
  assert.notStrictEqual(boardRevision.metadata, branch.metadata);
  assert.notStrictEqual(boardRevision.code, codeRevision.code);
  assert.notStrictEqual(boardRevision.board.items, codeRevision.board.items);
  assert.equal(source.events[4].payload.code, 'print(2)');
  assert.equal(source.events[1].payload.upserts[0].item.text, 'new');
});

test('supports direct code patches and complete board replacements', () => {
  const branch = createLessonReplayBranch(replay, 0);
  const withCode = updateLessonReplayBranchCode(branch, 'print("branch")');
  const withBoard = updateLessonReplayBranchBoard(withCode, [
    { id: 'branch-note', type: 'text', text: 'Try another path' },
  ]);

  assert.equal(withCode.code.code, 'print("branch")');
  assert.deepEqual(withBoard.board.items, [
    { id: 'branch-note', type: 'text', text: 'Try another path' },
  ]);
  assert.deepEqual(branch.board.items, []);
});

test('restores the selected actor viewport for the real code and board surfaces', () => {
  const viewportReplay = {
    occurrence: { key: 'viewport-lesson', studentId: 'student-9' },
    events: [
      { id: 'code', type: 'code', offsetMs: 1_000, payload: { code: 'print(1)' } },
      {
        id: 'student-board-view',
        type: 'viewport',
        offsetMs: 2_000,
        actor: { role: 'student' },
        payload: { surface: 'board', zoom: 1.7, offset: { x: 120, y: -45 }, width: 900, height: 520 },
      },
      {
        id: 'student-code-view',
        type: 'viewport',
        offsetMs: 2_500,
        actor: { role: 'student' },
        payload: { surface: 'code', scrollTopRatio: 0.6, scrollLeftRatio: 0.2, cursorLine: 14, cursorColumn: 5 },
      },
      {
        id: 'teacher-board-view',
        type: 'viewport',
        offsetMs: 3_000,
        actor: { role: 'teacher' },
        payload: { surface: 'board', zoom: 0.8, offset: { x: -20, y: 30 }, width: 1200, height: 700 },
      },
    ],
  };

  const studentBranch = createLessonReplayBranch(viewportReplay, 3_000, { actorRole: 'student' });
  const teacherBranch = createLessonReplayBranch(viewportReplay, 3_000, { actorRole: 'teacher' });

  assert.equal(studentBranch.board.viewport.zoom, 1.7);
  assert.deepEqual(studentBranch.board.viewport.offset, { x: 120, y: -45 });
  assert.equal(studentBranch.code.viewport.scrollTopRatio, 0.6);
  assert.equal(studentBranch.code.viewport.cursorLine, 14);
  assert.equal(teacherBranch.board.viewport.zoom, 0.8);
  assert.equal(teacherBranch.code.viewport.scrollTopRatio, 0.6);

  studentBranch.board.viewport.offset.x = 999;
  assert.equal(viewportReplay.events[1].payload.offset.x, 120);
});
