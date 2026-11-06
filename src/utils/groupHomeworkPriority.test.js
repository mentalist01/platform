import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionConcurrentHomeworks } from './concurrentHomework.js';
import { getGroupHomeworkPriority } from './groupHomeworkPriority.js';

const now = Date.parse('2026-11-09T09:00:00+03:00');
const work = (studyTrack, dueAt, extra = {}) => ({
  id: studyTrack, source: 'learning-group', learningGroupId: 'g3', studyTrack, dueAt, ...extra,
});
const lesson = (studyTrack, date, extra = {}) => ({ groupId: 'g3', studyTrack, date, time: '19:00', ...extra });

test('the next lesson takes precedence over the deadline order of the two directions', () => {
  const ege = work('ege', '2026-11-10T17:00:00+03:00');
  const python = work('python', '2026-11-10T19:00:00+03:00');
  const active = partitionConcurrentHomeworks([python, ege], now).active;
  assert.equal(active[0], ege);
  assert.deepEqual(getGroupHomeworkPriority(active, [lesson('python', '2026-11-10'), lesson('ege', '2026-11-12')], now).entries, [python]);
  assert.deepEqual(getGroupHomeworkPriority(active, [lesson('python', '2026-11-12'), lesson('ege', '2026-11-10')], now).entries, [ege]);
});

test('a moved lesson can keep its homework even with a later deadline when it is linked', () => {
  const python = work('python', '2026-11-14T19:00:00+03:00', { learningAssignmentLessonId: 'moved' });
  const sameTrackLater = work('python', '2026-11-21T19:00:00+03:00', { id: 'later' });
  const priority = getGroupHomeworkPriority([python, sameTrackLater], [
    lesson('ege', '2026-11-09', { groupHomeworkParticipant: false }),
    lesson('ege', '2026-11-10', { status: 'cancelled' }),
    lesson('python', '2026-11-11', { lessonId: 'moved' }),
  ], now);
  assert.equal(priority.start, Date.parse('2026-11-11T19:00:00+03:00'));
  assert.deepEqual(priority.entries, [python]);
});

test('a different direction or next-week assignment is not labelled as work for the nearest class', () => {
  const later = work('python', '2026-11-17T19:00:00+03:00');
  const other = work('ege', '2026-11-10T19:00:00+03:00');
  const closed = work('python', '2026-11-10T19:00:00+03:00', { id: 'closed', learningAssignmentStatus: 'closed' });
  const active = partitionConcurrentHomeworks([later, other, closed], now).active;
  assert.deepEqual(getGroupHomeworkPriority(active, [lesson('python', '2026-11-10')], now).entries, []);
  assert.deepEqual(getGroupHomeworkPriority(active, [], now), { entries: [other], start: null, track: 'ege' });
});

test('weekly group lessons use Moscow time and skip cancelled dates', () => {
  const homework = work('ege', '2026-11-17T19:00:00+03:00');
  const priority = getGroupHomeworkPriority([homework], [
    { groupId: 'g3', studyTrack: 'ege', weekdayKey: 'tuesday', time: '19:00', cancelledDates: ['2026-11-10'] },
  ], now);
  assert.equal(priority.start, Date.parse('2026-11-17T19:00:00+03:00'));
  assert.deepEqual(priority.entries, [homework]);
});
