import test from 'node:test';
import assert from 'node:assert/strict';
import { applySavedCalendarEdit, createCalendarSnapshotGuard } from './calendarSnapshot.js';

test('late reloads cannot overwrite a confirmed move or a newer reload', async () => {
  const guard = createCalendarSnapshotGuard();
  const old = guard.begin();
  guard.invalidate();
  assert.equal(guard.isCurrent(old), false);
  const firstRefresh = guard.begin(), secondRefresh = guard.begin();
  assert.equal(guard.isCurrent(firstRefresh), false);
  assert.equal(guard.isCurrent(secondRefresh), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(secondRefresh), false);
});

test('confirmed moves appear immediately, can move again, and do not duplicate feed entries', () => {
  const source = { id: 'old', date: '2026-10-18', time: '12:05', durationMinutes: 60, studentId: 'a' };
  const entry = { ...source, id: 'new', time: '12:15', externalEventId: 'uid' };
  const other = { ...source, id: 'other', studentId: 'b' };
  const first = applySavedCalendarEdit([source, other], { source, entry });
  assert.deepEqual(first, [other, entry]);
  const next = { ...entry, id: 'latest', time: '12:25' };
  assert.deepEqual(applySavedCalendarEdit(first, { source: entry, entry: next }), [other, next]);
  assert.deepEqual(applySavedCalendarEdit([entry], { source, entry }), [entry]);
});

test('moving a weekly occurrence preserves every other week and its exclusions', () => {
  const weekly = { id: 'weekly', weekdayKey: 'sunday', time: '12:05', excludedDates: ['2026-10-11'] };
  const entry = { id: 'saved', date: '2026-10-18', time: '12:15', lessonId: 'group-lesson', participantIds: ['a'] };
  const result = applySavedCalendarEdit([weekly], { source: { ...weekly, date: '2026-10-18' }, entry });
  assert.deepEqual(result, [{ ...weekly, excludedDates: ['2026-10-11', '2026-10-18'] }, entry]);
  assert.deepEqual(weekly.excludedDates, ['2026-10-11']);
});
