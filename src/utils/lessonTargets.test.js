import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLearningGroupTargetValue,
  getStudentActiveLearningGroups,
  isLearningGroupLessonReplayActive,
  parseLessonTargetValue,
  selectLearningGroupWorkspaceLesson,
} from './lessonTargets.js';

test('encodes and parses a learning group lesson target', () => {
  const value = buildLearningGroupTargetValue('group-42');
  assert.equal(value, 'learning-group:group-42');
  assert.deepEqual(parseLessonTargetValue(value), { type: 'group', id: 'group-42' });
});

test('keeps legacy student ids unchanged', () => {
  assert.deepEqual(parseLessonTargetValue('student-7'), { type: 'student', id: 'student-7' });
  assert.deepEqual(parseLessonTargetValue(''), { type: 'student', id: '' });
});

test('selecting a group workspace does not pretend that a Telemost lesson is running', () => {
  const selectedLesson = { lessonId: 'lesson-1', readOnly: false, replayActive: false };
  assert.equal(isLearningGroupLessonReplayActive(selectedLesson), false);
  assert.equal(isLearningGroupLessonReplayActive({ ...selectedLesson, replayActive: true }), true);
  assert.equal(isLearningGroupLessonReplayActive({ ...selectedLesson, replayActive: true, readOnly: true }), false);
});

test('uses only a current active membership for the student workspace', () => {
  const groups = [
    { id: 'past', status: 'completed', members: [{ studentId: 's1', status: 'active' }] },
    { id: 'removed', status: 'active', members: [{ studentId: 's1', status: 'removed' }] },
    { id: 'current', status: 'active', updatedAt: '2026-08-23T10:00:00.000Z', members: [{ studentId: 's1', status: 'active' }] },
  ];
  assert.deepEqual(getStudentActiveLearningGroups(groups, 's1').map((group) => group.id), ['current']);
});

test('prefers a current group lesson and keeps the latest past lesson as a fallback', () => {
  const now = Date.parse('2026-08-23T16:30:00.000Z');
  const lessons = [
    { id: 'past', status: 'completed', startsAt: '2026-08-16T16:00:00.000Z', durationMinutes: 60 },
    { id: 'future', status: 'scheduled', startsAt: '2026-08-30T16:00:00.000Z', durationMinutes: 60 },
    { id: 'current', status: 'scheduled', startsAt: '2026-08-23T16:00:00.000Z', durationMinutes: 60 },
  ];
  assert.equal(selectLearningGroupWorkspaceLesson(lessons, now)?.id, 'current');
  assert.equal(selectLearningGroupWorkspaceLesson([lessons[0]], now)?.id, 'past');
});
