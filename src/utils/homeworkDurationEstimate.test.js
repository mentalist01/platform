import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHomeworkDurationEstimate,
  estimateHomeworkDuration,
  formatHomeworkDurationEstimate,
  formatHomeworkDurationMinutes,
} from './homeworkDurationEstimate.js';

const testsDb = {
  13: {
    basic: [{ id: 'direct' }, { id: 'fallback' }, { id: 'unknown' }],
    advanced: [{ id: 'advanced-question' }],
  },
  14: {
    basic: [{ id: 'other-task' }],
  },
};

test('sums measured durations for required homework tasks', () => {
  const result = estimateHomeworkDuration({
    goalViews: [{
      type: 'task',
      taskNumber: 11,
      levelId: 'basic',
      targetStatus: [{ questionId: 'a' }, { questionId: 'b' }],
    }],
    questionDifficultyIndex: {
      11: {
        basic: {
          a: { averageActiveDurationMs: 4 * 60_000 },
          b: { averageDurationMs: 6 * 60_000 },
        },
      },
    },
  });

  assert.equal(result.requiredMinutes, 10);
  assert.equal(result.optionalMinutes, 0);
  assert.equal(result.measuredItemCount, 2);
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.usedFallback, false);
});

test('fills missing targets from the median of the same goal', () => {
  const result = estimateHomeworkDuration({
    goalViews: [{
      type: 'task',
      taskNumber: 11,
      levelId: 'basic',
      targetStatus: [{ questionId: 'a' }, { questionId: 'b' }, { questionId: 'c' }],
    }],
    questionDifficultyIndex: {
      11: {
        basic: {
          a: { averageActiveDurationMs: 4 * 60_000 },
          b: { averageActiveDurationMs: 8 * 60_000 },
        },
      },
    },
  });

  assert.equal(result.requiredMinutes, 18);
  assert.equal(result.measuredItemCount, 2);
  assert.equal(result.coveragePercent, 67);
  assert.equal(result.usedFallback, true);
});

test('keeps optional workload separate and supports mock analytics', () => {
  const result = estimateHomeworkDuration({
    goalViews: [
      {
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetStatus: [{ questionId: 'required' }],
      },
      {
        type: 'mock',
        mockExamId: 'exam-1',
        assignmentTier: 'optional',
        targetStatus: [{ taskKey: '1' }, { taskKey: '2' }],
      },
    ],
    questionDifficultyIndex: {
      1: { basic: { required: { averageActiveDurationMs: 5 * 60_000 } } },
    },
    mockTaskAnalyticsByExam: {
      'exam-1': {
        1: { averageActiveDurationMs: 7 * 60_000 },
        2: { averageActiveDurationMs: 9 * 60_000 },
      },
    },
  });

  assert.equal(result.requiredMinutes, 5);
  assert.equal(result.optionalMinutes, 16);
  assert.equal(result.itemCount, 3);
});

test('uses data-driven global fallback when the assigned question has no history', () => {
  const result = estimateHomeworkDuration({
    goalViews: [{
      type: 'task',
      taskNumber: 2,
      levelId: 'basic',
      targetStatus: [{ questionId: 'new-question' }],
    }],
    questionDifficultyIndex: {
      1: {
        basic: {
          a: { averageActiveDurationMs: 3 * 60_000 },
          b: { averageActiveDurationMs: 7 * 60_000 },
        },
      },
    },
  });

  assert.equal(result.requiredMinutes, 5);
  assert.equal(result.measuredItemCount, 0);
  assert.equal(result.usedFallback, true);
});

test('formats rounded homework duration for compact UI', () => {
  assert.equal(formatHomeworkDurationMinutes(37), '35 мин');
  assert.equal(formatHomeworkDurationMinutes(60), '1 ч');
  assert.equal(formatHomeworkDurationMinutes(87), '1 ч 25 мин');
  assert.equal(formatHomeworkDurationMinutes(0), '');
});

test('uses the concrete question timing before a task-level fallback', () => {
  const result = buildHomeworkDurationEstimate({
    goals: [{
      type: 'task',
      taskNumber: 13,
      levelId: 'basic',
      targetQuestions: [1],
      targetQuestionIds: ['direct'],
    }],
    testsDb,
    timingIndex: {
      13: {
        basic: {
          direct: { averageDurationMs: 120_000, sampleSize: 1 },
          another: { averageDurationMs: 600_000, sampleSize: 8 },
        },
      },
    },
  });

  assert.equal(result.total.estimatedDurationMs, 120_000);
  assert.equal(result.total.directCount, 1);
  assert.equal(result.total.fallbackCount, 0);
  assert.equal(result.items[0].source, 'question');
});

test('falls back only to the same task number and level', () => {
  const result = buildHomeworkDurationEstimate({
    goals: [{
      type: 'task',
      taskNumber: 13,
      levelId: 'basic',
      targetQuestions: [2],
      targetQuestionIds: ['fallback'],
    }],
    testsDb,
    timingIndex: {
      13: {
        basic: {
          first: { averageDurationMs: 180_000, sampleSize: 2 },
          second: { averageDurationMs: 300_000, sampleSize: 1 },
        },
        advanced: {
          advanced: { averageDurationMs: 1_800_000, sampleSize: 20 },
        },
      },
      14: {
        basic: {
          other: { averageDurationMs: 3_600_000, sampleSize: 30 },
        },
      },
    },
  });

  assert.equal(result.total.estimatedDurationMs, 220_000);
  assert.equal(result.total.fallbackCount, 1);
  assert.equal(result.items[0].sampleSize, 3);
  assert.equal(result.items[0].source, 'task-level');
});

test('keeps a selected question unknown when its task and level have no timing', () => {
  const result = buildHomeworkDurationEstimate({
    goals: [{
      type: 'task',
      taskNumber: 13,
      levelId: 'basic',
      targetQuestions: [3],
    }],
    testsDb,
    timingIndex: {
      13: {
        advanced: {
          advanced: { averageDurationMs: 900_000, sampleSize: 4 },
        },
      },
    },
  });

  assert.equal(result.total.estimatedCount, 0);
  assert.equal(result.total.unknownCount, 1);
  assert.equal(result.items[0].source, 'unknown');
  assert.equal(result.complete, false);
  assert.equal(result.totalDurationMs, null);
  assert.equal(result.knownDurationMs, 0);
});

test('reports a partial estimate as known time instead of a complete total', () => {
  const result = buildHomeworkDurationEstimate({
    goals: [
      {
        type: 'task',
        taskNumber: 13,
        levelId: 'basic',
        targetQuestions: [1],
      },
      {
        type: 'task',
        taskNumber: 14,
        levelId: 'basic',
        targetQuestions: [1],
      },
    ],
    testsDb,
    timingIndex: {
      13: {
        basic: {
          direct: { averageDurationMs: 120_000, sampleSize: 2 },
        },
      },
    },
  });

  assert.equal(result.complete, false);
  assert.equal(result.totalDurationMs, null);
  assert.equal(result.knownDurationMs, 120_000);
  assert.equal(result.total.directCount, 1);
  assert.equal(result.total.unknownCount, 1);
});

test('prefers active duration and ignores invalid timing entries', () => {
  const result = buildHomeworkDurationEstimate({
    goals: [{
      type: 'task',
      taskNumber: 13,
      levelId: 'basic',
      targetQuestions: [1],
    }],
    testsDb,
    timingIndex: {
      13: {
        basic: {
          direct: {
            averageActiveDurationMs: 150_000,
            averageDurationMs: 900_000,
            sampleSize: 1,
          },
          broken: { averageDurationMs: Number.NaN, sampleSize: 10 },
          empty: { averageDurationMs: 300_000, sampleSize: 0 },
        },
      },
    },
  });

  assert.equal(result.totalDurationMs, 150_000);
  assert.equal(result.items[0].sampleSize, 1);
});

test('separates required and optional workload and ignores mock goals', () => {
  const result = buildHomeworkDurationEstimate({
    goals: [
      {
        type: 'task',
        assignmentTier: 'required',
        taskNumber: 13,
        levelId: 'basic',
        targetQuestions: [1],
      },
      {
        type: 'task',
        assignmentTier: 'optional',
        taskNumber: 13,
        levelId: 'basic',
        targetQuestions: [2],
      },
      { type: 'mock', mockExamId: 'mock-1' },
    ],
    testsDb,
    timingIndex: {
      13: {
        basic: {
          direct: { averageDurationMs: 120_000, sampleSize: 2 },
          fallback: { averageDurationMs: 240_000, sampleSize: 3 },
        },
      },
    },
  });

  assert.equal(result.required.estimatedDurationMs, 120_000);
  assert.equal(result.optional.estimatedDurationMs, 240_000);
  assert.equal(result.total.estimatedDurationMs, 360_000);
  assert.equal(result.ignoredGoalCount, 1);
});

test('deduplicates overlapping selected questions and keeps required priority', () => {
  const result = buildHomeworkDurationEstimate({
    goals: [
      {
        type: 'task',
        assignmentTier: 'optional',
        taskNumber: 13,
        levelId: 'basic',
        targetQuestions: [1],
      },
      {
        type: 'task',
        assignmentTier: 'required',
        taskNumber: 13,
        levelId: 'basic',
        targetQuestions: [1],
      },
    ],
    testsDb,
    timingIndex: {
      13: { basic: { direct: { averageDurationMs: 120_000, sampleSize: 2 } } },
    },
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.required.selectedCount, 1);
  assert.equal(result.optional.selectedCount, 0);
});

test('formats approximate duration for minutes and hours', () => {
  assert.equal(formatHomeworkDurationEstimate(89_000), '1 мин');
  assert.equal(formatHomeworkDurationEstimate(3_900_000), '1 ч 5 мин');
  assert.equal(formatHomeworkDurationEstimate(7_200_000), '2 ч');
  assert.equal(formatHomeworkDurationEstimate(0), '');
});
