import assert from 'node:assert/strict';
import test from 'node:test';
import { minimapGrab, minimapOffset } from './boardMinimap.js';
const geometry = { minX: -100, minY: -200, maxX: 900, maxY: 1800, scale: 0.05, pad: 8, offset: { x: 0, y: 0 }, viewWidth: 400, viewHeight: 300 };
test('dragging the viewport keeps the grabbed point without jumping and maps pixels to world coordinates', () => {
  const point = { x: 18, y: 23 };
  const grab = minimapGrab(geometry, point);
  assert.deepEqual(minimapOffset(geometry, point, grab), geometry.offset);
  assert.deepEqual(minimapOffset(geometry, { x: 28, y: 43 }, grab), { x: 200, y: 400 });
});
test('clicking elsewhere centers the viewport and dragging clamps at content edges including negative coordinates', () => {
  assert.deepEqual(minimapOffset(geometry, { x: 43, y: 73 }, minimapGrab(geometry, { x: 43, y: 73 })), { x: 400, y: 950 });
  assert.deepEqual(minimapOffset(geometry, { x: -999, y: -999 }, { x: 0, y: 0 }), { x: -100, y: -200 });
  assert.deepEqual(minimapOffset(geometry, { x: 999, y: 999 }, { x: 0, y: 0 }), { x: 500, y: 1500 });
});
