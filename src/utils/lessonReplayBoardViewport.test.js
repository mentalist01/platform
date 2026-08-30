import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLessonReplayBoardContentBounds,
  resolveLessonReplayBoardViewport,
} from './lessonReplayBoardViewport.js';

test('measures replay content including strokes and positioned cards', () => {
  assert.deepEqual(getLessonReplayBoardContentBounds([
    { id: 'stroke', type: 'stroke', points: [{ x: -20, y: 30 }, { x: 80, y: 130 }] },
    { id: 'task', type: 'task', x: 100, y: 200, width: 700, height: 500 },
  ]), {
    minX: -20,
    minY: 30,
    maxX: 800,
    maxY: 700,
  });
});

test('preserves the recorded world center when fullscreen changes the board size', () => {
  const result = resolveLessonReplayBoardViewport({
    zoom: 2,
    offset: { x: 100, y: 200 },
    width: 900,
    height: 520,
  }, {
    width: 1600,
    height: 900,
  });

  assert.deepEqual(result, {
    zoom: 2,
    offset: { x: -75, y: 105 },
  });
  assert.equal(result.offset.x + 1600 / result.zoom / 2, 325);
  assert.equal(result.offset.y + 900 / result.zoom / 2, 330);
});

test('fits visible content when a legacy recorded viewport points outside the board', () => {
  const result = resolveLessonReplayBoardViewport({
    zoom: 1,
    offset: { x: 50_000, y: 50_000 },
    width: 900,
    height: 520,
  }, {
    width: 1200,
    height: 700,
  }, {
    minX: 100,
    minY: 200,
    maxX: 900,
    maxY: 600,
  });

  const centerX = result.offset.x + 1200 / result.zoom / 2;
  const centerY = result.offset.y + 700 / result.zoom / 2;
  assert.equal(centerX, 500);
  assert.equal(centerY, 400);
  assert.ok(result.zoom >= 0.25);
});

test('fits board content when no recorded viewport exists', () => {
  const result = resolveLessonReplayBoardViewport(null, { width: 1000, height: 600 }, {
    minX: -200,
    minY: 300,
    maxX: 600,
    maxY: 900,
  });

  assert.ok(Number.isFinite(result.zoom));
  assert.ok(Number.isFinite(result.offset.x));
  assert.ok(Number.isFinite(result.offset.y));
  assert.equal(result.offset.x + 1000 / result.zoom / 2, 200);
  assert.equal(result.offset.y + 600 / result.zoom / 2, 600);
});
