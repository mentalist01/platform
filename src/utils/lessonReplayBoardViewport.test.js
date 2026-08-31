import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLessonReplayBoardContentBounds,
  getLessonReplayInitialBoardViewport,
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

test('initial camera frames the recovered first area instead of the whole tall board', () => {
  const bounds = { minX: 100, minY: 6900, maxX: 900, maxY: 8200 };
  const events = [{
    type: 'board', offsetMs: 0,
    payload: {
      initialState: true, initialFocusBounds: bounds,
      items: [
        { id: 'first-task', x: 100, y: 6900, width: 800, height: 1300 },
        { id: 'last-task', x: 100, y: 14800, width: 800, height: 600 },
      ],
    },
  }];
  const viewport = getLessonReplayInitialBoardViewport(events);
  assert.equal(viewport.surface, 'board');
  assert.equal(viewport.offset.x + viewport.width / viewport.zoom / 2, 500);
  assert.equal(viewport.offset.y + viewport.height / viewport.zoom / 2, 7550);
  viewport.offset.y = -10_000;
  assert.equal(getLessonReplayInitialBoardViewport(events).offset.y > 6000, true);
  assert.deepEqual(bounds, { minX: 100, minY: 6900, maxX: 900, maxY: 8200 });
});

test('does not invent an initial camera when a recording has no valid initial focus', () => {
  assert.equal(getLessonReplayInitialBoardViewport(null), null);
  assert.equal(getLessonReplayInitialBoardViewport([{ type: 'board', payload: { items: [] } }]), null);
  assert.equal(getLessonReplayInitialBoardViewport([{
    type: 'board', payload: { initialState: true, initialFocusBounds: { minX: 100, maxX: 90 } },
  }]), null);
});
