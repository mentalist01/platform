import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyHomeworkDeadline, weeklyHomeworkLessonChoices, partitionConcurrentHomeworks } from './concurrentHomework.js';

test('Wednesday EGE and Friday Python keep independent weekly deadlines', () => {
  const wed = Date.parse('2026-10-07T18:10:00Z'), fri = Date.parse('2026-10-09T18:10:00Z');
  assert.equal(weeklyHomeworkDeadline(wed), '2026-10-14T18:10:00.000Z');
  assert.equal(weeklyHomeworkDeadline(fri), '2026-10-16T18:10:00.000Z');
  const entries = [{ id: 'python', source: 'learning-group', learningAssignmentStatus: 'assigned', dueAt: weeklyHomeworkDeadline(fri) },
    { id: 'ege', source: 'learning-group', learningAssignmentStatus: 'assigned', dueAt: weeklyHomeworkDeadline(wed) }];
  const result = partitionConcurrentHomeworks(entries, fri);
  assert.deepEqual(result.active.map(x => x.id), ['ege', 'python']);
  assert.equal(result.history.length, 0);
});
test('weekly lesson choices skip the short deadline of the other lesson, use Moscow, preserve time', () => {
  const choices = weeklyHomeworkLessonChoices([{ weekdayKey: 'wednesday', time: '20:00' }, { weekdayKey: 'friday', time: '20:00' }], Date.parse('2026-10-07T18:10Z'));
  assert.deepEqual(choices.map(x => x.dueAt), ['2026-10-14T17:00:00.000Z', '2026-10-16T17:00:00.000Z']);
});
test('closed and expired group work goes to history even if unfinished', () => {
  const now = Date.parse('2026-10-10T00:00Z');
  const entries = [
    { id: 'future', source: 'learning-group', dueAt: '2026-10-14T00:00Z' },
    { id: 'closed', source: 'learning-group', learningAssignmentStatus: 'closed', dueAt: '2026-10-14T00:00Z' },
    { id: 'done', source: 'learning-group', dueAt: '2026-10-09T00:00Z' },
    { id: 'pending', source: 'learning-group', dueAt: '2026-10-09T00:00Z' },
  ];
  const result = partitionConcurrentHomeworks(entries, now, e => e.id !== 'pending');
  assert.deepEqual(result.active.map(x => x.id), ['future']);
  assert.deepEqual(result.history.map(x => x.id), ['closed', 'done', 'pending']);
});

test('a stale open group projection expires exactly on time; undated work stays visible', () => {
  const now = Date.parse('2026-10-09T17:00:00Z');
  const entries = [{ id: 'expires', source: 'learning-group', learningAssignmentStatus: 'assigned', dueAt: '2026-10-09T20:00:00+03:00' }, { id: 'undated', source: 'learning-group' }];
  assert.deepEqual(partitionConcurrentHomeworks(entries, now).active.map(x => x.id), ['undated']);
  assert.deepEqual(partitionConcurrentHomeworks(entries, now).history.map(x => x.id), ['expires']);
});
test('only the latest individual homework stays current even when earlier deadlines are still ahead', () => {
  const entries = [{ id: 'a', dueAt: '2026-10-14T00:00Z' }, { id: 'b', dueAt: '2026-10-16T00:00Z' }, { id: 'old', dueAt: '2026-09-10T00:00Z' }];
  const result = partitionConcurrentHomeworks(entries, Date.parse('2026-10-10T00:00Z'));
  assert.deepEqual(result.active.map(x => x.id), ['a']);
  assert.deepEqual(result.history.map(x => x.id), ['b', 'old']);
});

test('a newer group assignment does not hide the latest individual homework or reactivate its history', () => {
  const now = Date.parse('2026-10-10T00:00Z');
  const entries = [
    { id: 'python', source: 'learning-group', dueAt: '2026-10-16T00:00Z' },
    { id: 'individual-new', dueAt: '2026-10-15T00:00Z' },
    { id: 'ege', source: 'learning-group', dueAt: '2026-10-14T00:00Z' },
    { id: 'individual-old', dueAt: '2026-10-17T00:00Z' },
  ];
  const result = partitionConcurrentHomeworks(entries, now);
  assert.deepEqual(result.active.map(x => x.id), ['ege', 'individual-new', 'python']);
  assert.deepEqual(result.history.map(x => x.id), ['individual-old']);
  assert.deepEqual(entries.map(x => x.id), ['python', 'individual-new', 'ege', 'individual-old']);
});

test('the latest overdue or undated individual homework remains current as before', () => {
  for (const latest of [{ id: 'overdue', dueAt: '2026-09-10T00:00Z' }, { id: 'undated' }]) {
    const older = { id: 'older', dueAt: '2026-10-17T00:00Z' };
    const result = partitionConcurrentHomeworks([latest, older], Date.parse('2026-10-10T00:00Z'));
    assert.deepEqual(result.active.map(x => x.id), [latest.id]);
    assert.deepEqual(result.history.map(x => x.id), ['older']);
  }
});
