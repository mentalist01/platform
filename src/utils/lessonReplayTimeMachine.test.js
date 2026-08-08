import assert from 'node:assert/strict';
import test from 'node:test';

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
