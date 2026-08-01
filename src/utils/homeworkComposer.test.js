import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHomeworkCarryoverDraft,
  formatHomeworkQuestionRanges,
  isMockAttemptForHomework,
  resolveHomeworkTaskTargetDescriptors,
} from './homeworkComposer.js';

const testsDb = {
  1: {
    basic: [
      { id: 'q-3' },
      { id: 'q-1' },
      { id: 'q-2' },
      { id: 'q-4' },
    ],
  },
};

test('formatHomeworkQuestionRanges compacts sorted unique ranges', () => {
  assert.equal(formatHomeworkQuestionRanges([7, 2, 3, 4, 7, 10]), '2-4, 7, 10');
});

test('carryover never turns unfinished optional work into a required debt', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      id: 'homework-priority',
      goals: [
        {
          type: 'task',
          assignmentTier: 'required',
          taskNumber: 1,
          levelId: 'basic',
          targetQuestions: [1],
          targetQuestionIds: ['q-3'],
        },
        {
          type: 'task',
          assignmentTier: 'optional',
          taskNumber: 1,
          levelId: 'basic',
          targetQuestions: [2],
          targetQuestionIds: ['q-1'],
        },
      ],
    },
    testsDb,
  });

  assert.equal(result.goals.length, 1);
  assert.equal(result.goals[0].assignmentTier, 'required');
  assert.equal(result.goals[0].carryover.sourceGoalIndex, 0);
});

test('carryover keeps only unfinished task questions and remaps stored ids after reorder', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      id: 'homework-1',
      issuedAt: '2026-07-01T10:00:00.000Z',
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [1, 2, 3],
        targetQuestionIds: ['q-1', 'q-2', 'q-3'],
      }],
    },
    studentData: {
      solvedByTask: {
        1: {
          basic: {
            solved: ['q-1', 'q-3'],
            answerHistory: {
              'q-1': [{ correct: true, submittedAt: '2026-07-02T10:00:00.000Z' }],
              'q-3': [{ correct: true, submittedAt: '2026-07-03T10:00:00.000Z' }],
            },
          },
        },
      },
    },
    testsDb,
  });

  assert.equal(result.goals.length, 1);
  assert.equal(result.goals[0].targetInput, '3');
  assert.deepEqual(result.goals[0].targetQuestions, [3]);
  assert.deepEqual(result.goals[0].targetQuestionIds, ['q-2']);
  assert.equal(result.goals[0].carryover.originalCount, 3);
  assert.equal(result.goals[0].carryover.remainingCount, 1);
});

test('carryover omits a task goal when every assigned question is solved', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      goals: [{ type: 'task', taskNumber: 1, levelId: 'basic', includeAll: true }],
    },
    studentData: {
      solvedByTask: { 1: { basic: { solved: ['q-1', 'q-2', 'q-3', 'q-4'] } } },
    },
    testsDb,
  });
  assert.deepEqual(result.goals, []);
});

test('a solution from before the homework does not close a repeated assignment', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      issuedAt: '2026-07-05T10:00:00.000Z',
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [2],
        targetQuestionIds: ['q-1'],
      }],
    },
    studentData: {
      solvedByTask: {
        1: {
          basic: {
            solved: ['q-1'],
            answerHistory: {
              'q-1': [{ correct: true, submittedAt: '2026-07-01T10:00:00.000Z' }],
            },
          },
        },
      },
    },
    testsDb,
  });
  assert.equal(result.goals.length, 1);
  assert.equal(result.goals[0].targetInput, '2');
  assert.deepEqual(result.goals[0].targetQuestionIds, ['q-1']);
});

test('a deleted stored id is never replaced with the question now at its old number', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [1],
        targetQuestionIds: ['deleted-question'],
      }],
    },
    testsDb,
  });
  assert.deepEqual(result.goals, []);
});

test('stored ids are deduplicated and stay aligned with their current numbers', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [1, 2, 3],
        targetQuestionIds: ['q-2', 'q-2', 'q-1'],
      }],
    },
    testsDb,
  });
  assert.deepEqual(result.goals[0].targetQuestions, [2, 3]);
  assert.deepEqual(result.goals[0].targetQuestionIds, ['q-1', 'q-2']);
});

test('a partially populated id snapshot keeps the remaining numeric targets', () => {
  const descriptors = resolveHomeworkTaskTargetDescriptors({
    targetQuestions: [1, 4],
    targetQuestionIds: ['q-1'],
  }, testsDb[1].basic);

  assert.deepEqual(descriptors, [
    { questionId: 'q-1', questionNumber: 2 },
    { questionId: 'q-4', questionNumber: 4 },
  ]);
});

test('an empty id slot keeps its aligned numeric target without reviving deleted ids', () => {
  const descriptors = resolveHomeworkTaskTargetDescriptors({
    targetQuestions: [1, 3, 4],
    targetQuestionIds: ['q-1', '', 'q-4'],
  }, testsDb[1].basic);

  assert.deepEqual(descriptors, [
    { questionId: 'q-1', questionNumber: 2 },
    { questionId: 'q-2', questionNumber: 3 },
    { questionId: 'q-4', questionNumber: 4 },
  ]);
});

test('python carryover always uses the python level', () => {
  const pythonTests = { 101: { python: [{ id: 'py-1' }] } };
  const result = buildHomeworkCarryoverDraft({
    homework: {
      goals: [{ type: 'task', taskNumber: 101, levelId: 'basic', includeAll: true }],
    },
    testsDb: pythonTests,
  });
  assert.equal(result.goals[0].levelId, 'python');
});

test('carryover keeps only unchecked text lines', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      homeWork: 'Конспект\nФормулы',
      checklistItems: [
        { id: 'one', text: 'Конспект', completedAt: '2026-07-01T10:00:00.000Z' },
        { id: 'two', text: 'Формулы', completedAt: null },
      ],
    },
  });
  assert.equal(result.homeWork, 'Формулы');
  assert.equal(result.summary.pendingChecklistCount, 1);
});

test('carryover keeps an unfinished mock and omits a completed one', () => {
  const base = {
    homework: {
      id: 'homework-mock-1',
      goals: [{ type: 'mock', mockExamId: 'exam-1', mode: 'classic' }],
    },
    mockExams: [{ id: 'exam-1', tasks: { 1: {}, 2: {}, 3: {} } }],
  };
  const unfinished = buildHomeworkCarryoverDraft({
    ...base,
    studentData: { mockAttempts: { 'exam-1': { solvedEver: { 1: true, 2: false, 3: false } } } },
  });
  assert.equal(unfinished.goals.length, 1);
  assert.equal(unfinished.goals[0].carryover.remainingCount, 2);
  assert.deepEqual(unfinished.goals[0].carryover.remainingTaskKeys, ['2', '3']);
  assert.deepEqual(unfinished.goals[0].targetTaskKeys, ['2', '3']);
  assert.equal(unfinished.goals[0].continuationOfHomeworkId, 'homework-mock-1');

  const completed = buildHomeworkCarryoverDraft({
    ...base,
    studentData: { mockAttempts: { 'exam-1': { solvedEver: { 1: true, 2: true, 3: true } } } },
  });
  assert.deepEqual(completed.goals, []);
});

test('a mock attempt from before the homework does not close a repeated assignment', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      issuedAt: '2026-07-10T10:00:00.000Z',
      goals: [{
        type: 'mock',
        mockExamId: 'exam-1',
        mode: 'timer',
        targetTaskKeys: ['1', '2'],
      }],
    },
    mockExams: [{ id: 'exam-1', tasks: { 1: {}, 2: {} } }],
    studentData: {
      mockAttempts: {
        'exam-1': {
          updatedAt: '2026-07-09T10:00:00.000Z',
          solved: { 1: true, 2: true },
          solvedEver: { 1: true, 2: true },
        },
      },
    },
  });

  assert.equal(result.goals.length, 1);
  assert.deepEqual(result.goals[0].targetTaskKeys, ['1', '2']);
});

test('mock carryover uses current progress recorded after the homework was assigned', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      issuedAt: '2026-07-10T10:00:00.000Z',
      goals: [{
        type: 'mock',
        mockExamId: 'exam-1',
        mode: 'classic',
        targetTaskKeys: ['1', '2'],
      }],
    },
    mockExams: [{ id: 'exam-1', tasks: { 1: {}, 2: {} } }],
    studentData: {
      mockAttempts: {
        'exam-1': {
          updatedAt: '2026-07-11T10:00:00.000Z',
          solved: { 1: true, 2: false },
          solvedEver: { 1: true, 2: true },
        },
      },
    },
  });

  assert.equal(result.goals.length, 1);
  assert.deepEqual(result.goals[0].targetTaskKeys, ['2']);
});

test('errors from a finished timer become a fresh classic practice subset', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      id: 'homework-timer',
      issuedAt: '2026-07-10T10:00:00.000Z',
      goals: [{
        type: 'mock',
        mockExamId: 'exam-1',
        mode: 'timer',
        targetTaskKeys: ['1', '2', '3'],
      }],
    },
    mockExams: [{ id: 'exam-1', tasks: { 1: {}, 2: {}, 3: {} } }],
    studentData: {
      mockAttempts: {
        'exam-1': {
          homeworkId: 'homework-timer',
          timerFinishedAt: '2026-07-11T12:00:00.000Z',
          solved: { 1: true, 2: false, 3: false },
        },
      },
    },
  });

  assert.equal(result.goals[0].mode, 'classic');
  assert.deepEqual(result.goals[0].targetTaskKeys, ['2', '3']);
  assert.equal(result.goals[0].continuationOfHomeworkId, undefined);
});

test('mock attempt assignment ids take precedence over a later activity timestamp', () => {
  const attempt = {
    homeworkId: 'homework-old',
    updatedAt: '2026-07-20T10:00:00.000Z',
  };
  const homework = {
    id: 'homework-new',
    issuedAt: '2026-07-10T10:00:00.000Z',
  };

  assert.equal(isMockAttemptForHomework(attempt, homework), false);
  assert.equal(isMockAttemptForHomework({ ...attempt, homeworkId: 'homework-new' }, homework), true);
  assert.equal(isMockAttemptForHomework(attempt, {
    ...homework,
    continuationOfHomeworkId: 'homework-old',
  }), true);
});

test('mock carryover keeps the original attempt lineage across consecutive untouched homeworks', () => {
  const result = buildHomeworkCarryoverDraft({
    homework: {
      id: 'homework-2',
      issuedAt: '2026-07-12T10:00:00.000Z',
      goals: [{
        type: 'mock',
        mockExamId: 'exam-1',
        mode: 'timer',
        targetTaskKeys: ['1', '2'],
        continuationOfHomeworkId: 'homework-1',
      }],
    },
    mockExams: [{ id: 'exam-1', tasks: { 1: {}, 2: {} } }],
    studentData: {
      mockAttempts: {
        'exam-1': {
          homeworkId: 'homework-1',
          updatedAt: '2026-07-11T10:00:00.000Z',
          solved: { 1: true, 2: false },
        },
      },
    },
  });

  assert.equal(result.goals.length, 1);
  assert.equal(result.goals[0].continuationOfHomeworkId, 'homework-1');
  assert.deepEqual(result.goals[0].targetTaskKeys, ['2']);
});
