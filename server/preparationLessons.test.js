import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreparationSchedule } from '../src/utils/preparationSchedule.js';
import { createPreparationLessons } from './preparationLessons.js';

const config = { count: 5, startDate: '2026-11-10', durationMinutes: 40, slots: [{ day: 1, time: '16:00' }, { day: 3, time: '18:00' }] };
function fixture() {
  const db = new Map(), student = { id: 'pupil', teacherId: 'teacher', name: 'Тест' }, writes = [], local = [];
  let at = Date.parse('2026-11-09T00:00:00+03:00'), unavailable = false, occupied = [];
  const store = { get: id => structuredClone(db.get(id)), all: () => structuredClone([...db.values()]), put: row => { db.set(row.id, structuredClone(row)); return structuredClone(row); } };
  const deps = { store, getStudent: () => student, now: () => at, getEntries: async () => occupied, applyLocal: row => local.push(structuredClone(row)),
    syncGoogle: async (row, lesson) => { if (unavailable) throw Error('Google недоступен'); writes.push(structuredClone(lesson)); return { iCalUID: lesson.id, calendarId: 'calendar' }; } };
  const runner = createPreparationLessons(deps);
  return { runner, student, writes, local, store, deps, unavailable: value => { unavailable = value; }, at: value => { at = Date.parse(value); }, occupied: value => { occupied = value; } };
}
test('finite plan: exact maximum, Moscow weekdays, partial final week, validation', () => {
  assert.deepEqual(buildPreparationSchedule(config).lessons.map(lesson => lesson.date), ['2026-11-10', '2026-11-12', '2026-11-17', '2026-11-19', '2026-11-24']);
  for (const patch of [{ count: 0 }, { count: 51 }, { slots: [] }, { startDate: '2026-02-30' }, { slots: [{ day: 0, time: '23:50' }] }, { slots: [config.slots[0], config.slots[0]] }]) {
    assert.throws(() => buildPreparationSchedule({ ...config, ...patch }));
  }
});
test('conflicts include weekly rules, dated exclusions and empty trial reservations', async () => {
  const f = fixture();
  for (const entry of [{ date: '2026-11-12' }, { weekdayKey: 'thursday' }, { weekdayKey: 'thursday', trialReservation: true }]) {
    f.occupied([{ ...entry, time: '18:30', durationMinutes: 30 }]);
    await assert.rejects(f.runner.validate(f.student, config), /время занято/);
    assert.equal(f.store.all().length, 0);
  }
  f.occupied([{ date: '2026-11-12', time: '18:00', cancelled: true }, { date: '2026-11-10', time: '16:00', excludedDates: ['2026-11-10'] }]);
  await f.runner.validate(f.student, config);
});
test('create, restart recovery and early finish cancel only future appointments; no duplicate Google writes', async () => {
  const f = fixture();
  await f.runner.create(f.student, await f.runner.validate(f.student, config));
  assert.equal(f.writes.length, 5);
  assert.ok(f.runner.view(f.student).lessons.every(lesson => lesson.syncStatus === 'synced'));
  await assert.rejects(f.runner.validate(f.student, config), /текущий план/);
  f.at('2026-11-12T18:10:00+03:00');
  await f.runner.cancelFuture(f.student);
  assert.equal(f.writes.filter(lesson => lesson.cancelled).length, 3);
  assert.equal(f.runner.view(f.student).lessons.filter(lesson => !lesson.cancelled).length, 2);
  const before = f.writes.length;
  await f.runner.cancelFuture(f.student);
  await createPreparationLessons(f.deps).retryPending();
  assert.equal(f.writes.length, before);
});
test('Google outage: local plan durable, cancellation wins after restart, former teacher cannot retry', async () => {
  const f = fixture(); f.unavailable(true);
  await f.runner.create(f.student, await f.runner.validate(f.student, config));
  assert.equal(f.local.length, 1); assert.equal(f.runner.future(f.student).length, 5);
  await f.runner.cancelFuture(f.student);
  f.unavailable(false); await createPreparationLessons(f.deps).retryPending();
  assert.equal(f.writes.length, 5); assert.ok(f.writes.every(lesson => lesson.cancelled));
  assert.equal(f.runner.future(f.student).length, 0);
  assert.equal(f.runner.managesGoogle('teacher', { externalEventId: f.writes[0].id }), true);
  assert.equal(f.runner.managesGoogle('other', { externalEventId: f.writes[0].id }), false);
  f.unavailable(true);
  f.at('2026-11-01T00:00:00+03:00');
  await f.runner.create(f.student, buildPreparationSchedule(config));
  const count = f.local.length;
  f.student.teacherId = 'other'; f.unavailable(false); await f.runner.retryPending();
  assert.equal(f.local.length, count); assert.equal(f.writes.length, 5);
});
