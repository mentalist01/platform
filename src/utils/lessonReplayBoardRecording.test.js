import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compactLessonReplayBoardItems,
  createLessonReplayBoardRecordingState,
  evaluateLessonReplayBoardPayload,
  LESSON_REPLAY_BOARD_CHECKPOINT_MS,
  splitLessonReplayBoardPayload,
} from './lessonReplayBoardRecording.js';

const applyBoardPayload = (items, payload) => {
  if (payload.mode !== 'delta') return [...(payload.items || [])];
  const removedIds = new Set((payload.removedIds || []).map(String));
  const upserts = [...(payload.upserts || [])].sort((left, right) => left.index - right.index);
  const upsertIds = new Set(upserts.map((entry) => String(entry.item.id)));
  const next = items.filter((item) => !removedIds.has(String(item.id)) && !upsertIds.has(String(item.id)));
  upserts.forEach((entry) => next.splice(Math.min(next.length, entry.index), 0, entry.item));
  return next;
};

test('keeps every object from a full 2500-item board', () => {
  const items = Array.from({ length: 2500 }, (_, index) => ({
    id: `stroke-${index}`,
    type: 'stroke',
    points: [{ x: index, y: index }],
  }));

  const compacted = compactLessonReplayBoardItems(items);

  assert.equal(compacted.length, 2500);
  assert.equal(compacted.at(-1).id, 'stroke-2499');
  assert.ok(LESSON_REPLAY_BOARD_CHECKPOINT_MS < 1000);
});

test('splits an oversized board keyframe without losing or reordering objects', () => {
  const items = Array.from({ length: 180 }, (_, index) => ({
    id: `stroke-${index}`,
    type: 'stroke',
    points: Array.from({ length: 40 }, (__, point) => ({ x: point, y: index + point })),
  }));
  const payloads = splitLessonReplayBoardPayload({ mode: 'snapshot', items }, 18 * 1024);

  assert.ok(payloads.length > 1);
  assert.equal(payloads[0].mode, 'snapshot');
  assert.ok(payloads.slice(1).every((payload) => payload.mode === 'delta'));
  const restored = payloads.reduce(applyBoardPayload, []);
  assert.deepEqual(restored.map((item) => item.id), items.map((item) => item.id));
  assert.ok(payloads.every((payload) => new TextEncoder().encode(JSON.stringify(payload)).byteLength <= 18 * 1024));
});

test('splits a large delta while applying removals exactly once', () => {
  const upserts = Array.from({ length: 120 }, (_, index) => ({
    index,
    item: { id: `new-${index}`, type: 'text', text: 'x'.repeat(200) },
  }));
  const payloads = splitLessonReplayBoardPayload({
    mode: 'delta',
    upserts,
    removedIds: ['old-1', 'old-2'],
  }, 18 * 1024);

  assert.ok(payloads.length > 1);
  assert.deepEqual(payloads[0].removedIds, ['old-1', 'old-2']);
  assert.ok(payloads.slice(1).every((payload) => payload.removedIds.length === 0));
  const restored = payloads.reduce(applyBoardPayload, [
    { id: 'old-1' },
    { id: 'old-2' },
  ]);
  assert.deepEqual(restored.map((item) => item.id), upserts.map((entry) => entry.item.id));
});

test('rejects a passive empty checkpoint after a non-empty board', () => {
  const initial = evaluateLessonReplayBoardPayload(
    createLessonReplayBoardRecordingState(),
    { mode: 'snapshot', items: [{ id: 'kept', type: 'text', text: 'keep' }] }
  );
  const passiveEmpty = evaluateLessonReplayBoardPayload(initial.state, {
    mode: 'snapshot',
    items: [],
    actorVerified: false,
  });

  assert.equal(initial.accepted, true);
  assert.equal(passiveEmpty.accepted, false);
  assert.deepEqual([...passiveEmpty.state.itemIds], ['kept']);
});

test('keeps an explicit verified clear', () => {
  const initial = evaluateLessonReplayBoardPayload(
    createLessonReplayBoardRecordingState(),
    { mode: 'snapshot', items: [{ id: 'removed', type: 'text', text: 'remove' }] }
  );
  const clear = evaluateLessonReplayBoardPayload(initial.state, {
    mode: 'snapshot',
    items: [],
    actorVerified: true,
  });

  assert.equal(clear.accepted, true);
  assert.equal(clear.state.itemIds.size, 0);
});
