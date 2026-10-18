import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardCommandClock, createBoardCommandFreshness } from './boardCommandClock.js';
import { boardPageSummonTarget } from './boardPages.js';

test('a live summon works when teacher and pupil clocks differ by an hour', () => {
  const server = Date.parse('2026-10-18T10:00:00Z');
  let teacherTick = 1000, pupilTick = 3000;
  const teacher = createBoardCommandClock({ wallNow: () => server + 3600000, monotonicNow: () => teacherTick });
  const pupil = createBoardCommandClock({ wallNow: () => server - 3600000, monotonicNow: () => pupilTick });
  for (const clock of [teacher, pupil]) assert.equal(clock.synchronize(new Date(server).toUTCString()), true);
  const command = { id: 'live', ts: teacher.now(), pageId: 'main', studentId: '', zoom: 1.5, offset: { x: 70, y: 90 } };
  pupilTick += 100;
  assert.equal(boardPageSummonTarget(command, 'pupil', [{ id: 'main' }], pupil.now()).id, 'live');
  pupilTick += 15001;
  assert.equal(boardPageSummonTarget(command, 'pupil', [{ id: 'main' }], pupil.now()), null, 'Old persisted commands still expire');
  teacherTick += 1000;
  assert.equal(teacher.now(), server + 1500);
});

test('changing system time during the lesson cannot invalidate a received command', () => {
  let wall = 1000, tick = 0;
  const clock = createBoardCommandClock({ wallNow: () => wall, monotonicNow: () => tick });
  assert.equal(clock.now(), 1000);
  assert.equal(clock.synchronize('not a date'), false);
  clock.synchronize('Sun, 18 Oct 2026 10:00:00 GMT');
  const before = clock.now(); wall += 86400000; tick += 150;
  assert.equal(clock.now() - before, 150);
});

test('a command observed on a live channel is fresh without cross-origin Date headers, while initial history is not', () => {
  let tick = 1000;
  const freshness = createBoardCommandFreshness(() => tick);
  const command = { id: 'live-cross-origin', ts: 1000000 };
  assert.equal(freshness.isFresh(command, 4600000), false, 'Initial document history is never marked live');
  freshness.observeLive(command);
  assert.equal(freshness.isFresh(command, 4600000), true);
  tick += 10000; freshness.observeLive(command); tick += 5001;
  assert.equal(freshness.isFresh(command, 4600000), false, 'Repeated notifications do not renew a command');
  freshness.observeLive(command);
  assert.equal(freshness.isFresh(command, 4600000), false, 'An expired receipt is not renewed either');
});
