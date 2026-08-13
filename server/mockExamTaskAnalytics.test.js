import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMockExamTaskAnalyticsIndex,
  calculateMockExamTaskDifficulty,
  collectMockExamTaskObservations,
} from './mockExamTaskAnalytics.js';

const exam = {
  id: 'mock-1',
  tasks: {
    1: { id: 'task-version-1', answer: '42' },
    2: { id: 'task-version-2', answer: '7' },
  },
};

const finishedResult = ({
  attemptId,
  taskId = 'task-version-1',
  durationMs = 120_000,
  solved = true,
} = {}) => ({
  attemptId,
  examId: exam.id,
  status: 'finished',
  finishedAt: '2026-08-01T10:00:00.000Z',
  tasks: { 1: { id: taskId, answer: '42' } },
  attemptSnapshot: {
    attemptId,
    status: 'finished',
    answers: { 1: solved ? '42' : '0' },
    solved: { 1: solved },
    taskDurationsMs: { 1: durationMs },
  },
});

test('collector keeps completed attempts and de-duplicates the current snapshot', () => {
  const progressDb = {
    studentA: {
      mockAttemptResults: [finishedResult({ attemptId: 'attempt-a', durationMs: 90_000 })],
      mockAttempts: {
        [exam.id]: {
          attemptId: 'attempt-a',
          status: 'finished',
          answers: { 1: '42' },
          solved: { 1: true },
          taskDurationsMs: { 1: 999_000 },
        },
      },
    },
    studentB: {
      mockAttempts: {
        [exam.id]: {
          attemptId: 'attempt-b',
          mode: 'classic',
          status: 'finished',
          finishedAt: '2026-08-01T11:00:00.000Z',
          answers: { 1: '0' },
          solved: { 1: false },
          taskDurationsMs: { 1: 180_000 },
        },
      },
    },
  };

  const observations = collectMockExamTaskObservations(progressDb, [exam]);
  assert.equal(observations.length, 2);
  assert.deepEqual(observations.map((entry) => entry.activeDurationMs).sort((a, b) => a - b), [90_000, 180_000]);
  assert.equal(observations.filter((entry) => entry.solved).length, 1);
});

test('unfinished attempts, unanswered tasks, malformed durations and old task versions are excluded', () => {
  const progressDb = {
    unfinished: {
      mockAttempts: {
        [exam.id]: {
          attemptId: 'timer-open',
          mode: 'timer',
          status: 'active',
          answers: { 1: '42' },
          solved: {},
          taskDurationsMs: { 1: 60_000 },
        },
      },
    },
    unfinishedClassic: {
      mockAttempts: {
        [exam.id]: {
          attemptId: 'classic-open',
          mode: 'classic',
          status: 'active',
          answers: { 1: '42' },
          solved: { 1: true },
          taskDurationsMs: { 1: 60_000 },
        },
      },
    },
    unanswered: {
      mockAttemptResults: [finishedResult({ attemptId: 'blank' })],
    },
    malformed: {
      mockAttemptResults: [finishedResult({ attemptId: 'bad-duration', durationMs: -1 })],
    },
    oldVersion: {
      mockAttemptResults: [finishedResult({ attemptId: 'old', taskId: 'replaced-task' })],
      mockAttempts: {
        [exam.id]: {
          attemptId: 'old',
          status: 'finished',
          finishedAt: '2026-08-01T10:00:00.000Z',
          answers: { 1: '42' },
          solved: { 1: true },
          taskDurationsMs: { 1: 60_000 },
        },
      },
    },
  };
  progressDb.unanswered.mockAttemptResults[0].attemptSnapshot.answers[1] = '';

  assert.deepEqual(collectMockExamTaskObservations(progressDb, [exam]), []);
});

test('an analytics version change starts a fresh task sample without changing its stable id', () => {
  const versionedExam = {
    ...exam,
    tasks: {
      ...exam.tasks,
      1: { ...exam.tasks[1], analyticsVersion: 'version-2' },
    },
  };
  const previousVersion = finishedResult({ attemptId: 'previous' });
  previousVersion.tasks[1].analyticsVersion = 'version-1';
  const currentVersion = finishedResult({ attemptId: 'current', durationMs: 240_000 });
  currentVersion.tasks[1].analyticsVersion = 'version-2';

  const observations = collectMockExamTaskObservations({
    studentA: { mockAttemptResults: [previousVersion] },
    studentB: { mockAttemptResults: [currentVersion] },
  }, [versionedExam]);

  assert.equal(observations.length, 1);
  assert.equal(observations[0].attemptId, 'current');
  assert.equal(observations[0].activeDurationMs, 240_000);
});

test('difficulty combines robust active time with the incorrect-result rate', () => {
  const difficulty = calculateMockExamTaskDifficulty([
    { activeDurationMs: 15 * 60_000, solved: true },
    { activeDurationMs: 15 * 60_000, solved: false },
    { activeDurationMs: 15 * 60_000, solved: false },
    { activeDurationMs: 15 * 60_000, solved: true },
    { activeDurationMs: 15 * 60_000, solved: true },
  ]);

  assert.equal(difficulty.averageDurationMs, 15 * 60_000);
  assert.equal(difficulty.accuracyPercent, 60);
  assert.equal(difficulty.score, 44);
  assert.equal(difficulty.category, 'medium');
  assert.equal(difficulty.provisional, false);
});

test('builder returns per-exam and per-task analytics', () => {
  const progressDb = {
    studentA: { mockAttemptResults: [finishedResult({ attemptId: 'one', durationMs: 60_000 })] },
    studentB: { mockAttemptResults: [finishedResult({ attemptId: 'two', durationMs: 180_000, solved: false })] },
  };
  const index = buildMockExamTaskAnalyticsIndex(progressDb, [exam]);
  const task = index[exam.id]['1'];

  assert.equal(task.sampleSize, 2);
  assert.equal(task.solvedCount, 1);
  assert.equal(task.accuracyPercent, 50);
  assert.equal(task.averageDurationMs, 120_000);
  assert.equal(typeof task.score, 'number');
  assert.equal(typeof task.category, 'string');
});
