import test from 'node:test';
import assert from 'node:assert/strict';
import { removeLessonReplaySyncArtifacts } from './lessonReplaySyncArtifacts.js';

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
