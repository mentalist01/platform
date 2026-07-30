import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHomeworkDueAtFromSchedule, resolveNextLessonStart } from './homeworkDueAt.js';

test('uses the next recurring lesson instead of a fixed seven-day homework window', () => {
  const now = new Date(2026, 6, 30, 12, 0, 0); // Thursday
  const result = buildHomeworkDueAtFromSchedule([
    { weekdayKey: 'tuesday', time: '18:30' },
  ], { now });

  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 7);
  assert.equal(result.getDate(), 4);
  assert.equal(result.getHours(), 18);
  assert.equal(result.getMinutes(), 30);
});

test('uses a later same-day lesson and skips an excluded recurring occurrence', () => {
  const sameDayNow = new Date(2026, 6, 30, 12, 0, 0);
  const sameDay = resolveNextLessonStart([
    { weekdayKey: 'thursday', time: '10:00' },
    { weekdayKey: 'thursday', time: '16:00' },
  ], { now: sameDayNow });
  assert.equal(sameDay?.getDate(), 30);
  assert.equal(sameDay?.getHours(), 16);

  const excluded = resolveNextLessonStart([
    {
      weekdayKey: 'tuesday',
      time: '18:30',
      excludedDates: ['2026-08-04'],
    },
  ], { now: sameDayNow });
  assert.equal(excluded?.getDate(), 11);
});

test('prefers the nearest explicit occurrence and falls back to seven days without lessons', () => {
  const now = new Date(2026, 6, 30, 12, 0, 0);
  const explicit = buildHomeworkDueAtFromSchedule([
    { weekdayKey: 'tuesday', time: '18:30' },
    { date: '2026-08-01', time: '11:00' },
  ], { now });
  assert.equal(explicit.getDate(), 1);
  assert.equal(explicit.getHours(), 11);

  const fallback = buildHomeworkDueAtFromSchedule([], { now });
  assert.equal(fallback.getTime(), now.getTime() + (7 * 24 * 60 * 60 * 1000));
});
