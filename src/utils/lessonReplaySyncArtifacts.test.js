import test from 'node:test';
import assert from 'node:assert/strict';
import {
  removeLessonReplaySyncArtifacts,
  repairLessonReplayInitialBoardState,
} from './lessonReplaySyncArtifacts.js';

const actor = (role) => ({ role, id: role });
const item = (id) => ({ id, type: 'text', text: id });

test('removes a transient empty board checkpoint when navigation remounts the same board', () => {
  const events = [
    { id: 'board-full', type: 'board', offsetMs: 0, actor: actor('student'), payload: { mode: 'snapshot', items: [item('a'), item('b')] } },
    { id: 'open-code', type: 'navigation', offsetMs: 1000, actor: actor('student'), payload: { view: 'collab' } },
    { id: 'empty-warmup', type: 'board', offsetMs: 1001, actor: actor('student'), payload: { mode: 'snapshot', items: [] } },
    { id: 'restore', type: 'board', offsetMs: 5000, actor: actor('student'), payload: { mode: 'delta', upserts: [{ index: 0, item: item('a') }, { index: 1, item: item('b') }], removedIds: [] } },
  ];

  assert.deepEqual(removeLessonReplaySyncArtifacts(events).map((event) => event.id), [
    'board-full',
    'open-code',
  ]);
});

test('keeps an explicitly verified board clear when the previous board is not restored', () => {
  const events = [
    { id: 'board-full', type: 'board', offsetMs: 0, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a')] } },
    { id: 'open-code', type: 'navigation', offsetMs: 1000, actor: actor('teacher'), payload: { view: 'collab' } },
    { id: 'real-clear', type: 'board', offsetMs: 1001, actor: actor('teacher'), payload: { mode: 'snapshot', items: [], actorVerified: true } },
    { id: 'different-board', type: 'board', offsetMs: 3000, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('b')] } },
  ];

  assert.equal(removeLessonReplaySyncArtifacts(events).some((event) => event.id === 'real-clear'), true);
});

test('repairs a legacy empty board checkpoint even when restoration arrives minutes later', () => {
  const events = [
    {
      id: 'board-full',
      type: 'board',
      offsetMs: 0,
      actor: actor('teacher'),
      payload: { mode: 'snapshot', items: [item('a'), item('b'), item('c'), item('d'), item('e')] },
    },
    {
      id: 'legacy-empty',
      type: 'board',
      offsetMs: 60_000,
      actor: actor('student'),
      payload: { mode: 'snapshot', items: [] },
    },
    { id: 'code-edit', type: 'code', offsetMs: 61_000, actor: actor('student'), payload: { code: 'print(1)' } },
    {
      id: 'late-restore',
      type: 'board',
      offsetMs: 6 * 60_000,
      actor: actor('teacher'),
      payload: { mode: 'snapshot', items: [item('a'), item('b'), item('c'), item('d'), item('e')] },
    },
  ];

  assert.deepEqual(removeLessonReplaySyncArtifacts(events).map((event) => event.id), [
    'board-full',
    'code-edit',
  ]);
});

test('turns a server-marked truncated snapshot into a non-destructive delta', () => {
  const events = [
    { id: 'board-full', type: 'board', offsetMs: 0, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a'), item('b'), item('c')] } },
    { id: 'truncated', type: 'board', offsetMs: 1000, actor: actor('teacher'), payload: { mode: 'snapshot', items: [{ ...item('a'), text: 'updated' }, item('c')], truncated: true } },
  ];

  const repaired = removeLessonReplaySyncArtifacts(events);
  assert.equal(repaired[1].payload.mode, 'delta');
  assert.equal(repaired[1].payload.recoveredFromTruncatedSnapshot, true);
  assert.deepEqual(repaired[1].payload.upserts.map((entry) => entry.item.id), ['a', 'c']);
  assert.deepEqual(repaired[1].payload.removedIds, []);
});

test('keeps an explicitly verified clear even when undo later restores the board', () => {
  const events = [
    { id: 'board-full', type: 'board', offsetMs: 0, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a'), item('b')] } },
    { id: 'verified-clear', type: 'board', offsetMs: 1000, actor: actor('teacher'), payload: { mode: 'snapshot', items: [], actorVerified: true } },
    { id: 'undo', type: 'board', offsetMs: 5000, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a'), item('b')] } },
  ];

  assert.equal(removeLessonReplaySyncArtifacts(events).some((event) => event.id === 'verified-clear'), true);
});

test('repairs a legacy empty board frame emitted while switching to shared code', () => {
  const events = [
    { id: 'board-full', type: 'board', offsetMs: 0, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a'), item('b')] } },
    { id: 'empty-on-switch', type: 'board', offsetMs: 10_000, actor: actor('student'), payload: { mode: 'snapshot', items: [], actorVerified: false } },
    { id: 'code-mounted', type: 'code', offsetMs: 10_400, actor: actor('student'), payload: { action: 'edit', code: 'print(1)', actorVerified: false } },
  ];

  assert.deepEqual(removeLessonReplaySyncArtifacts(events).map((event) => event.id), [
    'board-full',
    'code-mounted',
  ]);
});

test('repairs a legacy empty frame followed by passive board synchronization', () => {
  const events = [
    { id: 'board-full', type: 'board', offsetMs: 0, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a'), item('b')] } },
    { id: 'empty-before-sync', type: 'board', offsetMs: 10_000, actor: actor('student'), payload: { mode: 'snapshot', items: [], actorVerified: false } },
    { id: 'passive-sync', type: 'board', offsetMs: 19_000, actor: actor('student'), payload: { mode: 'delta', upserts: [{ index: 2, item: item('c') }], removedIds: [], actorVerified: false } },
  ];

  assert.deepEqual(removeLessonReplaySyncArtifacts(events).map((event) => event.id), [
    'board-full',
    'passive-sync',
  ]);
});

test('never lets an unauthored legacy snapshot erase an existing board', () => {
  const events = [
    { id: 'board-full', type: 'board', offsetMs: 1_262_539, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a'), item('b')] } },
    { id: 'legacy-empty-21-33', type: 'board', offsetMs: 1_293_684, actor: actor('student'), payload: { mode: 'snapshot', items: [], actorVerified: false } },
    { id: 'audio-only', type: 'audio', offsetMs: 1_298_512, actor: actor('teacher'), payload: { audioId: 'segment' } },
  ];

  assert.deepEqual(removeLessonReplaySyncArtifacts(events).map((event) => event.id), [
    'board-full',
    'audio-only',
  ]);
});

test('removes an empty code warmup that is followed by the unchanged shared code', () => {
  const events = [
    { id: 'shared-code', type: 'code', offsetMs: 0, actor: actor('teacher'), payload: { code: 'print(1)' } },
    { id: 'student-opens-code', type: 'navigation', offsetMs: 1000, actor: actor('student'), payload: { view: 'collab' } },
    { id: 'empty-warmup', type: 'code', offsetMs: 1200, actor: actor('student'), payload: { code: '', input: '', testFile: '', output: '', error: '' } },
    { id: 'synced-code', type: 'code', offsetMs: 31_000, actor: actor('student'), payload: { code: 'print(1)' } },
  ];

  assert.deepEqual(removeLessonReplaySyncArtifacts(events).map((event) => event.id), [
    'shared-code',
    'student-opens-code',
  ]);
});

test('keeps an intentional code clear when the following source is different', () => {
  const events = [
    { id: 'old-code', type: 'code', offsetMs: 0, actor: actor('student'), payload: { code: 'old' } },
    { id: 'open-code', type: 'navigation', offsetMs: 1000, actor: actor('student'), payload: { view: 'collab' } },
    { id: 'real-clear', type: 'code', offsetMs: 1200, actor: actor('student'), payload: { code: '' } },
    { id: 'new-code', type: 'code', offsetMs: 5000, actor: actor('student'), payload: { code: 'new' } },
  ];

  assert.equal(removeLessonReplaySyncArtifacts(events).some((event) => event.id === 'real-clear'), true);
});

test('drops shared board and code checkpoints that do not change visible state', () => {
  const events = [
    { id: 'board-change', type: 'board', offsetMs: 0, actor: actor('teacher'), payload: { mode: 'snapshot', items: [item('a')] } },
    { id: 'board-copy', type: 'board', offsetMs: 10, actor: actor('student'), payload: { mode: 'delta', upserts: [{ index: 0, item: item('a') }], removedIds: [] } },
    { id: 'code-change', type: 'code', offsetMs: 20, actor: actor('teacher'), payload: { action: 'edit', code: 'print(1)' } },
    { id: 'code-copy', type: 'code', offsetMs: 30, actor: actor('student'), payload: { action: 'snapshot', code: 'print(1)' } },
  ];

  assert.deepEqual(removeLessonReplaySyncArtifacts(events).map((event) => event.id), [
    'board-change',
    'code-change',
  ]);
});

test('moves an explicitly marked initial board state to the start of playback', () => {
  const repaired = repairLessonReplayInitialBoardState([
    { id: 'lesson-start', type: 'session', offsetMs: 8000, actor: actor('student'), payload: { action: 'start' } },
    {
      id: 'late-initial',
      type: 'board',
      offsetMs: 87_000,
      actor: actor('teacher'),
      payload: {
        mode: 'snapshot',
        actorVerified: false,
        initialState: true,
        items: [item('a'), item('b')],
      },
    },
  ]);

  assert.equal(repaired[0].offsetMs, 0);
  assert.equal(repaired[0].actor, null);
  assert.equal(repaired[0].payload.initialState, true);
  assert.equal(repaired[0].payload.recoveredInitialState, false);
  assert.deepEqual(repaired[0].payload.items.map((entry) => entry.id), ['a', 'b']);
  assert.equal(repaired[1].id, 'lesson-start');
});

test('collapses a staggered legacy board sync into one initial snapshot', () => {
  const makeItems = (prefix, count, yOffset) => Array.from(
    { length: count },
    (_, index) => ({
      ...item(`${prefix}-${index}`),
      x: 100 + index,
      y: yOffset + index,
    })
  );
  const makeDelta = (id, offsetMs, items, startIndex = 0) => ({
    id,
    type: 'board',
    offsetMs,
    actor: actor('student'),
    payload: {
      mode: 'delta',
      actorVerified: false,
      upserts: items.map((entry, index) => ({ index: startIndex + index, item: entry })),
      removedIds: [],
    },
  });
  const firstBatch = makeItems('first', 177, 200);
  const lateBatch = makeItems('late', 513, 5000);
  const rawEvents = [
    { id: 'empty-a', type: 'board', offsetMs: 22_199, actor: actor('student'), payload: { mode: 'snapshot', actorVerified: false, items: [] } },
    { id: 'empty-b', type: 'board', offsetMs: 22_503, actor: actor('teacher'), payload: { mode: 'snapshot', actorVerified: false, items: [] } },
    makeDelta('first-sync', 27_173, firstBatch),
    makeDelta('duplicate-sync', 32_482, firstBatch),
    makeDelta('late-1', 87_175, lateBatch.slice(0, 1), firstBatch.length),
    makeDelta('late-155', 87_176, lateBatch.slice(1, 156), firstBatch.length + 1),
    makeDelta('late-106', 87_176, lateBatch.slice(156, 262), firstBatch.length + 156),
    makeDelta('late-107', 87_176, lateBatch.slice(262, 369), firstBatch.length + 262),
    makeDelta('late-12', 87_176, lateBatch.slice(369, 381), firstBatch.length + 369),
    makeDelta('late-132', 87_176, lateBatch.slice(381), firstBatch.length + 381),
  ];

  const repaired = removeLessonReplaySyncArtifacts(
    repairLessonReplayInitialBoardState(rawEvents)
  );
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].offsetMs, 0);
  assert.equal(repaired[0].payload.recoveredInitialState, true);
  assert.equal(repaired[0].payload.items.length, 690);
  assert.equal(repaired[0].payload.initialFocusBounds.minY, 200);
  assert.ok(repaired[0].payload.initialFocusBounds.maxY < 1000);
  assert.deepEqual(
    repaired[0].payload.items.map((entry) => entry.id),
    [...firstBatch, ...lateBatch].map((entry) => entry.id)
  );
});

test('does not move real edits or ordinary passive changes to the start', () => {
  const smallPassive = {
    id: 'small-passive',
    type: 'board',
    offsetMs: 87_000,
    payload: {
      mode: 'delta',
      actorVerified: false,
      upserts: Array.from({ length: 10 }, (_, index) => ({ index, item: item(`small-${index}`) })),
      removedIds: [],
    },
  };
  const verifiedLarge = {
    id: 'verified-large',
    type: 'board',
    offsetMs: 88_000,
    payload: {
      mode: 'delta',
      actorVerified: true,
      upserts: Array.from({ length: 100 }, (_, index) => ({ index, item: item(`verified-${index}`) })),
      removedIds: [],
    },
  };
  const latePassive = {
    id: 'late-passive',
    type: 'board',
    offsetMs: 121_000,
    payload: {
      mode: 'delta',
      actorVerified: false,
      upserts: Array.from({ length: 100 }, (_, index) => ({ index, item: item(`late-${index}`) })),
      removedIds: [],
    },
  };

  const repaired = repairLessonReplayInitialBoardState([
    smallPassive,
    verifiedLarge,
    latePassive,
  ]);
  assert.deepEqual(repaired.map((event) => [event.id, event.offsetMs]), [
    ['small-passive', 87_000],
    ['verified-large', 88_000],
    ['late-passive', 121_000],
  ]);
});
