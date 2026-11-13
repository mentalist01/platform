import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHomeworkReviewUntil } from './groupHomeworkReviewWindow.js';
import { partitionConcurrentHomeworks } from '../src/utils/concurrentHomework.js';

const dueAt = '2026-11-12T16:00:00.000Z';
const homework = { id: 'hw', source: 'learning-group', learningGroupId: 'group', learningAssignmentLessonId: 'lesson', dueAt };
const lesson = { id: 'lesson', teacherId: 'teacher', groupId: 'group', status: 'active', startAt: dueAt, durationMinutes: 75 };
const classify = (entry, lessons, at, endAt = () => null) => {
  const learningHomeworkReviewUntil = groupHomeworkReviewUntil(entry, 'teacher', lessons, endAt);
  return partitionConcurrentHomeworks([{ ...entry, learningHomeworkReviewUntil }], Date.parse(at), { includeLessonReview: true });
};

test('the same homework stays through an extension and moves to history immediately on finish', () => {
  const originalEnd = '2026-11-12T17:15:00Z';
  const extendedEnd = '2026-11-12T17:30:00Z';
  assert.equal(classify(homework, [lesson], dueAt).review.length, 1);
  assert.equal(classify(homework, [lesson], originalEnd).history.length, 1);
  const extension = classify(homework, [lesson], originalEnd, ({ teacherId, id }) => {
    assert.deepEqual([teacherId, id], ['teacher', 'lesson']);
    return Date.parse(extendedEnd);
  });
  assert.equal(extension.review[0].dueAt, dueAt);
  assert.equal(extension.active.length, 0);
  assert.equal(classify(homework, [lesson], extendedEnd, () => Date.parse(extendedEnd)).history.length, 1);
  assert.equal(classify(homework, [{ ...lesson, status: 'completed' }], '2026-11-12T16:40:00Z').history.length, 1);
});

test('an older assignment without a lesson ID matches only its group and lesson time', () => {
  const legacy = { ...homework, learningAssignmentLessonId: '' };
  const lessons = [
    { ...lesson, groupId: 'different-group', durationMinutes: 90 },
    { ...lesson, teacherId: 'different-teacher', durationMinutes: 90 },
    lesson,
  ];
  assert.equal(groupHomeworkReviewUntil(legacy, 'teacher', lessons, () => null), '2026-11-12T17:15:00.000Z');
  assert.equal(groupHomeworkReviewUntil(legacy, 'teacher', lessons.slice(0, 2), () => null), '');
  assert.equal(groupHomeworkReviewUntil(legacy, 'teacher', [{ ...lesson, status: 'cancelled' }], () => null), '');
});

test('a weekly slot works before its lesson is created and follows a rescheduled occurrence', () => {
  const legacy = { ...homework, learningAssignmentLessonId: '' };
  const findSlot = (groupId, day, time) => {
    assert.deepEqual([groupId, day, time], ['group', '2026-11-12', '19:00']);
    return { id: 'weekly-slot', durationMinutes: 75 };
  };
  assert.equal(groupHomeworkReviewUntil(legacy, 'teacher', [], () => null, findSlot), '2026-11-12T17:15:00.000Z');
  const moved = { ...lesson, status: 'scheduled', scheduleEntryId: 'weekly-slot', startAt: '2026-11-13T17:00:00Z' };
  assert.equal(groupHomeworkReviewUntil(legacy, 'teacher', [moved], () => null, findSlot), '2026-11-13T18:15:00.000Z');
  assert.equal(groupHomeworkReviewUntil(legacy, 'teacher', [{ ...moved, status: 'cancelled' }], () => null, findSlot), '');
});
