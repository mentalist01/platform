import test from 'node:test';
import assert from 'node:assert/strict';
import { snapCalendarDragStart } from './calendarDrag.js';
test('dragging preserves duration and moves in ten-minute steps relative to the original start', () => {
  const snap = pointerMinutes => snapCalendarDragStart({ pointerMinutes, cursorOffsetMinutes: 20, sourceStartMinutes: 725, durationMinutes: 60 });
  assert.equal(snap(745), 725); assert.equal(snap(754), 735); assert.equal(snap(765), 745);
  assert.equal(snap(795), 775); assert.equal(snap(735), 715);
  assert.equal(snap(-100), 5); assert.equal(snap(1500), 1375);
});
