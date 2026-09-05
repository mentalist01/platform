import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import * as Y from 'yjs';
import { repairDuplicateBoardItems } from './boardItemDeduplication.js';
import { compactLessonReplayBoardItems, splitLessonReplayBoardPayload } from './lessonReplayBoardRecording.js';

// Exercise BoardSection's actual callbacks with two Yjs peers. Extracting the
// callbacks avoids mounting the unrelated lesson UI and WebSocket services.
const app = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
const board = app.slice(app.indexOf('const BoardSection ='));
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing BoardSection callback: ${start}`);
  return source.slice(from, to);
};
const callbacks = [
  between(app, 'const createLessonReplayBoardState =', 'const BoardSection ='),
  between(board, 'const buildBoardSnapshotFromYItems =', 'const getBoardCapacityError ='),
  between(board, 'const flushLessonReplayBoardSnapshot =', 'useEffect(() => () => flushLessonReplayBoardSnapshot()'),
  between(board, 'const updateItems =', 'const handleConnectionClose ='),
].join('\n');

const createBoard = () => {
  const doc = new Y.Doc();
  const peer = new Y.Doc();
  const yItems = doc.getArray('items');
  const events = [];
  const boardItemsRef = { current: [] };
  const boardEstimatedBytesRef = { current: 0 };
  const lessonReplayBoardDirtyRef = { current: false };
  const provider = { synced: false };
  const context = vm.createContext({
    doc, yItems, provider, boardItemsRef, boardEstimatedBytesRef, lessonReplayBoardDirtyRef,
    duplicateRepairOrigin: Symbol('repair'),
    repairDuplicateBoardItems, compactLessonReplayBoardItems, splitLessonReplayBoardPayload,
    useCallback: (fn) => fn,
    window: { setTimeout: () => 1, clearTimeout() {}, clearInterval() {} },
    lessonReplayBoardHeartbeatId: null,
    boardImageUsageRef: { current: new Map() },
    lessonReplayActiveRef: { current: true },
    lessonReplayBoardTimerRef: { current: null },
    lessonReplayPendingBoardRef: { current: null },
    lessonReplayLastBoardStateRef: { current: null },
    lessonReplayLastBoardKeyframeAtRef: { current: 0 },
    lessonReplayEventRef: { current: (type, payload) => { events.push({ type, payload }); return true; } },
    LESSON_REPLAY_BOARD_KEYFRAME_MS: 300_000,
    LESSON_REPLAY_BOARD_CHECKPOINT_MS: 750,
    BOARD_MAX_ITEM_COUNT: 2500,
    isSandbox: false,
    normalizeBoardStoredItem: (item) => item,
    estimateBoardItemBytes: (item) => JSON.stringify(item).length,
    clearCachedBoardImages() {}, trackBoardImageInsert() {}, trackBoardImageRemoval() {},
    commitBoardData: (items, bytes) => { boardItemsRef.current = items; boardEstimatedBytesRef.current = bytes; },
    scheduleBoardRender() {}, scheduleBoardSceneRender() {}, getBoardCapacityError() {},
    setPasteError() {}, setStatus() {},
  });
  const cleanup = between(board, 'yItems.unobserve(updateItems);', "undoManager.off('stack-item-added'");
  vm.runInContext(`${callbacks}\n globalThis.handlers = { updateItems, handleSync,
    flush: flushLessonReplayBoardSnapshot, cleanup: () => { ${cleanup} } };`, context);
  const handlers = context.handlers;
  yItems.observe(handlers.updateItems);
  handlers.updateItems();
  const syncPeer = () => Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
  return {
    doc, peer, yItems, events, provider, handlers, syncPeer,
    dirty: lessonReplayBoardDirtyRef,
    close: () => { handlers.cleanup(); doc.destroy(); peer.destroy(); },
  };
};

test('local drawing and deletion are recorded while the board connection is offline', () => {
  const h = createBoard();
  try {
    h.yItems.push([{ id: 'offline-note', type: 'text', text: 'kept' }]);
    assert.equal(h.dirty.current, true);
    h.handlers.flush();
    assert.equal(h.events[0].payload.items[0].id, 'offline-note');
    assert.equal(h.events[0].payload.actorVerified, true);
    h.yItems.delete(0, 1);
    h.handlers.flush();
    assert.equal(h.events.at(-1).payload.removedIds[0], 'offline-note');
    assert.equal(h.events.at(-1).payload.actorVerified, true);
  } finally { h.close(); }
});

test('reconnect records the merged scene without requiring another local edit', () => {
  const h = createBoard();
  try {
    h.yItems.push([{ id: 'local', type: 'text', text: 'local' }]);
    h.handlers.flush();
    assert.equal(h.dirty.current, false);
    Y.applyUpdate(h.peer, Y.encodeStateAsUpdate(h.doc));
    h.peer.getArray('items').push([{ id: 'remote', type: 'text', text: 'remote' }]);
    h.syncPeer();
    assert.equal(h.events.length, 1, 'remote transaction is not recorded as a local action');
    assert.equal(h.dirty.current, false);
    h.provider.synced = true;
    h.handlers.handleSync(true);
    h.handlers.flush();
    assert.equal(h.events.length, 2);
    assert.equal(h.events[1].payload.upserts[0].item.id, 'remote');
    assert.notEqual(h.events[1].payload.actorVerified, true);
    h.handlers.handleSync(true);
    h.handlers.flush();
    assert.equal(h.events.length, 2, 'unchanged sync must not add a duplicate checkpoint');
  } finally { h.close(); }
});

test('leaving the board flushes offline edits before the debounce timer fires', () => {
  const h = createBoard();
  h.yItems.push([{ id: 'last-stroke', type: 'stroke', points: [{ x: 1, y: 1 }] }]);
  assert.equal(h.events.length, 0);
  h.close();
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].payload.items[0].id, 'last-stroke');
});
