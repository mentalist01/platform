import test from 'node:test';
import assert from 'node:assert/strict';
import { snapCalendarDragStart, createCalendarDragWeekPager, retainCalendarDragSource } from './calendarDrag.js';
test('dragging preserves duration and moves in ten-minute steps relative to the original start', () => {
  const snap = pointerMinutes => snapCalendarDragStart({ pointerMinutes, cursorOffsetMinutes: 20, sourceStartMinutes: 725, durationMinutes: 60 });
  assert.equal(snap(745), 725); assert.equal(snap(754), 735); assert.equal(snap(765), 745);
  assert.equal(snap(795), 775); assert.equal(snap(735), 715);
  assert.equal(snap(-100), 5); assert.equal(snap(1500), 1375);
});


function pagerFixture() {
  let clock = 0, id = 0; const timers = new Map(), turns = [], directions = [];
  const pager = createCalendarDragWeekPager({ onTurn: value => turns.push(value), onDirectionChange: value => directions.push(value),
    now: () => clock, setTimer: (fn, delay) => { timers.set(++id, { fn, at: clock + delay }); return id; }, clearTimer: key => timers.delete(key) });
  const advance = duration => { const until = clock + duration; while (true) { const next = [...timers].sort((a,b) => a[1].at-b[1].at)[0]; if (!next || next[1].at > until) break; clock = next[1].at; timers.delete(next[0]); next[1].fn(); } clock = until; };
  return { pager, turns, directions, timers, advance };
}

test('week paging waits for a deliberate hover and does not restart on every native dragover', () => {
  const f = pagerFixture(); f.pager.update(1); f.advance(300); f.pager.update(1); f.advance(300); f.pager.update(1);
  f.advance(49); assert.deepEqual(f.turns, []); f.advance(1); assert.deepEqual(f.turns, [1]);
  f.advance(500); f.pager.update(1); f.advance(599); assert.deepEqual(f.turns, [1]); f.advance(1); assert.deepEqual(f.turns, [1,1]);
  assert.deepEqual(f.directions, [1]);
});

test('leaving the edge, dropping, cancelling and reversing direction clear the pending page turn', () => {
  const f = pagerFixture(); f.pager.update(1); f.advance(500); f.pager.update(0); f.advance(1000); assert.deepEqual(f.turns, []);
  f.pager.update(1); f.advance(400); f.pager.update(-1); f.advance(649); assert.deepEqual(f.turns, []); f.advance(1); assert.deepEqual(f.turns, [-1]);
  f.pager.stop(); f.advance(5000); assert.deepEqual(f.turns, [-1]); assert.equal(f.timers.size, 0); assert.equal(f.directions.at(-1),0);
});

test('paging stops when dragover events cease outside the calendar', () => {
  const f = pagerFixture(); f.pager.update(1); f.advance(650); assert.deepEqual(f.turns,[1]); f.advance(5000);
  assert.deepEqual(f.turns,[1]); assert.equal(f.timers.size,0); assert.equal(f.directions.at(-1),0);
});

test('another week retains the original native source without duplicating a visible recurring lesson', () => {
  const original={id:'weekly',time:'18:00',durationMinutes:60,startMinutes:1080};
  const drag={eventId:'weekly',sourceDayIndex:2,sourceDayKey:'2026-10-28',entry:original};
  const other=[{id:'other'}]; assert.equal(retainCalendarDragSource(other,drag,1),other);
  const retained=retainCalendarDragSource(other,drag,2); assert.equal(retained.length,2); assert.equal(retained[1].id,original.id);
  assert.equal(retained[1].calendarDragPlaceholder,true); assert.equal(original.calendarDragPlaceholder,undefined); assert.equal(other.length,1);
  const recurring=[{...original,date:'2026-11-04'}]; assert.equal(retainCalendarDragSource(recurring,drag,2),recurring);
  assert.equal(drag.sourceDayKey,'2026-10-28'); assert.equal(retainCalendarDragSource(other,null,2),other);
});
