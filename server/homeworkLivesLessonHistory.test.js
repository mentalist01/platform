import test from 'node:test';
import assert from 'node:assert/strict';
import { homeworkLivesLessonHistory } from './homeworkLivesLessonHistory.js';

test('changed durations and mirrored group records count as one lesson', () => {
  const history = homeworkLivesLessonHistory(
    [{startMs: 100, endMs: 160}, {startMs: 100, endMs: 190}, {startMs: 200, endMs: 260}],
    [{startMs: 200, endMs: 260}], 300,
  );
  assert.deepEqual(history, {startedLessonTimes: [100, 200], completedLessonTimes: [190, 260]});
});

test('ongoing lessons have started but do not count as completed; future and invalid records are excluded', () => {
  const history = homeworkLivesLessonHistory(
    [{startMs: 100, endMs: 160}, {startMs: 100, endMs: 190}, {startMs: 300, endMs: 360}],
    [{startMs: NaN, endMs: 170}, {startMs: 90, endMs: 80}], 170,
  );
  assert.deepEqual(history, {startedLessonTimes: [100], completedLessonTimes: []});
});
