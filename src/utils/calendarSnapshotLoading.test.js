import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarSnapshotGuard, loadCalendarSnapshot } from './calendarSnapshot.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture(guard = createCalendarSnapshotGuard()) {
  const schedule = deferred(), trials = deferred(), events = [];
  const pending = loadCalendarSnapshot({ guard, schedule: () => schedule.promise, trials: () => trials.promise,
    onSchedule: value => events.push(['schedule', value]), onTrials: value => events.push(['trials', value]),
    onScheduleError: error => events.push(['schedule-error', error.message]), onTrialsError: error => events.push(['trials-error', error.message]),
    onScheduleSettled: () => events.push(['ready']),
  });
  return { schedule, trials, events, pending, guard };
}

test('timetable and payment metadata appear before slow trial bookings; loading ends independently', async () => {
  const f = fixture();
  const schedule = [{ id: 'lesson', time: '16:00', paid: true, participantIds: ['student-a'] }];
  f.schedule.resolve(schedule);
  await f.schedule.promise;
  assert.deepEqual(f.events, [['schedule', schedule], ['ready']]);
  f.trials.resolve({ slots: [], bookings: [] });
  await f.pending;
  assert.equal(f.events[2][0], 'trials');
});

test('a failed source does not discard the successful schedule or trial bookings', async () => {
  for (const failed of ['schedule', 'trials']) {
    const f = fixture(), succeeded = failed === 'schedule' ? 'trials' : 'schedule';
    f[failed].reject(Error('offline'));
    f[succeeded].resolve({ id: 'retained' });
    await f.pending;
    assert.ok(f.events.some(([type]) => type === succeeded));
    assert.ok(f.events.some(([type]) => type === failed + '-error'));
    assert.equal(f.events.filter(([type]) => type === 'ready').length, 1);
  }
});

test('responses pending before an edit or teacher change cannot overwrite the new snapshot', async () => {
  const old = fixture();
  old.guard.invalidate();
  const current = fixture(old.guard);
  current.schedule.resolve([{ id: 'saved', time: '17:00', paid: false }]);
  current.trials.resolve({ id: 'new-teacher' });
  await current.pending;
  old.schedule.resolve([{ id: 'old', time: '16:00', paid: true }]);
  old.trials.resolve({ id: 'old-teacher' });
  await old.pending;
  assert.deepEqual(old.events, []);
  assert.equal(current.events[0][1][0].time, '17:00');
});

test('stale failures cannot clear a newer calendar or end its loading indicator', async () => {
  const old = fixture(), current = fixture(old.guard);
  old.schedule.reject(Error('late failure'));
  old.trials.reject(Error('late failure'));
  await old.pending;
  assert.deepEqual(old.events, []);
  current.schedule.resolve([]); current.trials.resolve({ slots: [] });
  await current.pending;
  assert.equal(current.events.filter(([type]) => type === 'ready').length, 1);
});
