import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTabletStroke, readTabletLink, tabletStrokeToBoard, tabletSocketUrl, tabletFrameState, tabletInkForFrame } from './boardTablet.js';

test('tablet ink uses the original frame, including pan and zoom', () => {
  const stroke = normalizeTabletStroke({ id: 'stroke-1', frameId: 'frame-1', color: '#8247e5', width: 6,
    points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }] });
  const item = tabletStrokeToBoard(stroke, { x: -100, y: 200, width: 1000, height: 500, zoom: 2 }, 'teacher-1');
  assert.deepEqual(item.points, [{ x: -100, y: 200 }, { x: 150, y: 450 }]);
  assert.equal(item.width, 3);
  assert.equal(item.authorId, 'teacher-1');
});

test('reject malformed, oversized and out-of-viewport pen input', () => {
  const valid = { id: 's', frameId: 'f', color: '#123456', width: 3, points: [{ x: 0.2, y: 0.4 }] };
  assert.ok(normalizeTabletStroke(valid));
  for (const change of [{ points: [{ x: -1, y: 0 }] }, { points: [{ x: 0, y: Infinity }] },
    { points: Array(1401).fill({ x: 0, y: 0 }) }, { width: 0 }, { color: 'url(evil)' }, { id: {} }]) {
    assert.equal(normalizeTabletStroke({ ...valid, ...change }), null);
  }
});

test('QR capability stays in fragment and websocket has no account token', () => {
  assert.deepEqual(readTabletLink(`#tablet=${'a'.repeat(32)}.${'b'.repeat(32)}`), { id: 'a'.repeat(32), key: 'b'.repeat(32) });
  assert.equal(readTabletLink('#tablet=bad'), null);
  assert.equal(tabletSocketUrl('wss://example.test/collab?_auth=account-secret'), 'wss://example.test/collab/tablet');
});

const originalFrame = { id: 'original', revision: 0, width: 1000, height: 500, view: { x: 100, y: -200, zoom: 2 } };
const pendingInk = () => ({ frame: originalFrame, revision: null,
  stroke: { id: 'ink', frameId: originalFrame.id, width: 6, color: '#8247e5', points: [{ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.6 }] } });

test('ink survives unrelated frames and acknowledgement until its rendered revision arrives', () => {
  const entry = pendingInk();
  const stale = { ...originalFrame, id: 'different-frame' };
  assert.deepEqual(tabletInkForFrame(entry, stale), entry.stroke);
  entry.revision = 3;
  assert.deepEqual(tabletInkForFrame(entry, stale), entry.stroke);
  assert.ok(tabletInkForFrame(entry, { ...stale, revision: 2 }));
  assert.equal(tabletInkForFrame(entry, { ...stale, revision: 3 }), null);
  assert.equal(tabletInkForFrame(entry, { ...stale, revision: 4 }), null);
});

test('ink follows board coordinates while an unconfirmed frame pans, zooms or resizes', () => {
  const entry = pendingInk();
  const target = { id: 'panned', revision: 0, width: 500, height: 1000, view: { x: 150, y: -150, zoom: 4 } };
  const projected = tabletInkForFrame(entry, target);
  assert.equal(projected.width, 12);
  assert.deepEqual(projected.points, [{ x: 0.4, y: 0.2 }, { x: 2.8, y: 0.4 }]);
  assert.deepEqual(tabletStrokeToBoard(projected, { ...target, ...target.view }, 't').points,
    tabletStrokeToBoard(entry.stroke, { ...originalFrame, ...originalFrame.view }, 't').points);
});

test('a decoded newer image must not clear ink while the displayed frame is locked during drawing', () => {
  const entry = { ...pendingInk(), revision: 1 };
  const latest = { ...originalFrame, id: 'decoded-in-background', revision: 1 };
  assert.ok(tabletInkForFrame(entry, originalFrame));
  assert.equal(tabletInkForFrame(entry, latest), null);
  assert.ok(tabletInkForFrame(pendingInk(), latest), 'an unacknowledged stroke is never assumed to be in the image');
});

test('frame revision and viewport must be valid before replacing optimistic ink', () => {
  assert.deepEqual(tabletFrameState(originalFrame), { revision: 0, view: originalFrame.view });
  for (const changes of [{ revision: -1 }, { revision: 1.5 }, { revision: '1' }, { view: { x: 0, y: 0, zoom: 0 } }, { view: { x: Infinity, y: 0, zoom: 1 } }]) {
    assert.equal(tabletFrameState({ ...originalFrame, ...changes }), null);
  }
});
