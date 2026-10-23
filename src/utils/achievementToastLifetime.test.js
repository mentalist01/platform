import test from 'node:test';
import assert from 'node:assert/strict';
import { createAchievementToastLifetime } from './achievementToastLifetime.js';

function fixture(exitDuration = 260) {
  let time = 0, next = 0;
  const timers = new Map(), events = [];
  const clock = createAchievementToastLifetime({
    now: () => time, schedule: (fn, ms) => { timers.set(++next, { fn, at: time + ms }); return next; },
    cancel: id => timers.delete(id), onExit: () => events.push(['exit', time]),
    onDismiss: () => events.push(['dismiss', time]), duration: 6500, exitDuration,
  });
  const advance = ms => {
    const end = time + ms;
    while (true) {
      const pending = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!pending) break;
      time = pending[1].at; timers.delete(pending[0]); pending[1].fn();
    }
    time = end;
  };
  return { clock, advance, events, timers };
}
test('automatic dismissal waits for the full reading time and exit animation', () => {
  const f = fixture(); f.advance(6499); assert.deepEqual(f.events, []);
  f.advance(1); assert.deepEqual(f.events, [['exit', 6500]]);
  f.advance(260); assert.deepEqual(f.events, [['exit', 6500], ['dismiss', 6760]]);
  f.advance(10000); assert.equal(f.events.length, 2);
});
test('hover, focus and hidden-page holds overlap without losing reading time', () => {
  const f = fixture(); f.advance(2000); f.clock.pause('hover'); f.clock.pause('hover');
  f.advance(1000); f.clock.pause('focus'); f.clock.pause('hidden'); f.clock.resume('hover');
  f.advance(10000); f.clock.resume('focus'); assert.equal(f.clock.isPaused(), true);
  f.clock.resume('hidden'); f.clock.resume('unknown'); assert.equal(f.clock.isPaused(), false);
  f.advance(4499); assert.deepEqual(f.events, []); f.advance(1);
  assert.deepEqual(f.events, [['exit', 17500]]);
});
test('manual close while paused is idempotent, including a reduced-motion exit', () => {
  const f = fixture(0); f.clock.pause('focus'); f.clock.dismiss(); f.clock.dismiss(); f.clock.resume('focus');
  f.advance(0); assert.deepEqual(f.events, [['exit', 0], ['dismiss', 0]]);
  f.advance(10000); assert.equal(f.events.length, 2);
});
test('unmounting or replacing a notification cancels its pending deadline', () => {
  const f = fixture(); f.advance(3000); f.clock.dispose(); f.clock.pause('hover'); f.clock.resume('hover'); f.clock.dismiss();
  f.advance(10000); assert.deepEqual(f.events, []); assert.equal(f.timers.size, 0);
});
test('unmounting during exit cannot dismiss the next queued award', () => {
  const f = fixture(); f.clock.dismiss(); f.advance(100); f.clock.dispose(); f.advance(10000);
  assert.deepEqual(f.events, [['exit', 0]]); assert.equal(f.timers.size, 0);
});
