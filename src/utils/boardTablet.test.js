import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTabletStroke, readTabletLink, tabletStrokeToBoard, tabletSocketUrl } from './boardTablet.js';

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
