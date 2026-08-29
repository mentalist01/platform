import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOMEWORK_STAT_STATE,
  buildHomeworkStatistics,
  getAcademicYearMeta,
  isHomeworkReadyForOverallStatistics,
  snapshotHomeworkGoalTargets,
  summarizeHomeworkStatistics,
} from './homeworkStats.js';

const testsDb = {
  1: {
    basic: [
      { id: 'q-1' },
      { id: 'q-2' },
      { id: 'q-3' },
    ],
  },
};

const answer = (submittedAt, correct) => ({
  id: `${submittedAt}-${correct}`,
  submittedAt,
  correct,
  answers: ['answer'],
});

test('buildHomeworkStatistics keeps attempts inside each homework window', () => {
  const homeworks = [
    {
      id: 'new',
      issuedAt: '2026-01-10T12:00:00.000Z',
      dueAt: '2026-01-17T12:00:00.000Z',
      homeWork: 'Повторение',
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [1, 2],
      }],
    },
    {
      id: 'old',
      issuedAt: '2026-01-01T12:00:00.000Z',
      dueAt: '2026-01-05T12:00:00.000Z',
      homeWork: 'Первая домашняя',
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [1, 2, 3],
      }],
    },
  ];
  const studentData = {
    solvedByTask: {
      1: {
        basic: {
          solved: ['q-1', 'q-2', 'q-3'],
          answerHistory: {
            'q-1': [
              answer('2026-01-02T12:00:00.000Z', false),
              answer('2026-01-03T12:00:00.000Z', true),
              answer('2026-01-11T12:00:00.000Z', true),
            ],
            'q-2': [answer('2026-01-04T12:00:00.000Z', true)],
            'q-3': [
              answer('2026-01-04T12:00:00.000Z', false),
              answer('2026-01-07T12:00:00.000Z', true),
            ],
          },
        },
      },
    },
  };

  const result = buildHomeworkStatistics({
    homeworks,
    studentData,
    testsDb,
    nowMs: Date.parse('2026-01-12T12:00:00.000Z'),
  });

  assert.deepEqual(result.map((entry) => entry.id), ['old', 'new']);
  assert.equal(result[0].percent, 100);
  assert.equal(result[0].checkpointPercent, 67);
  assert.equal(result[0].cleanCount, 1);
  assert.equal(result[0].withErrorsCount, 2);
  assert.equal(result[0].lateCompletedCount, 1);
  assert.equal(result[0].totalWrongAttempts, 2);

  assert.equal(result[1].percent, 100);
  assert.equal(result[1].cleanCount, 2);
  assert.equal(result[1].goals[0].items[0].attemptCount, 1);
  assert.equal(result[1].goals[0].items[1].estimated, true);
});

test('buildHomeworkStatistics distinguishes wrong and untouched targets', () => {
  const [entry] = buildHomeworkStatistics({
    homeworks: [{
      id: 'homework',
      issuedAt: '2026-09-01T10:00:00.000Z',
      goals: [{
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [1, 2, 3],
      }],
    }],
    studentData: {
      solvedByTask: {
        1: {
          basic: {
            answerHistory: {
              'q-1': [answer('2026-09-02T10:00:00.000Z', true)],
              'q-2': [answer('2026-09-02T11:00:00.000Z', false)],
            },
          },
        },
      },
    },
    testsDb,
    nowMs: Date.parse('2026-09-03T10:00:00.000Z'),
  });

  assert.equal(entry.percent, 33);
  assert.equal(entry.cleanCount, 1);
  assert.equal(entry.wrongCount, 1);
  assert.equal(entry.untouchedCount, 1);
  assert.deepEqual(
    entry.goals[0].items.map((item) => item.state),
    [
      HOMEWORK_STAT_STATE.CLEAN,
      HOMEWORK_STAT_STATE.WRONG,
      HOMEWORK_STAT_STATE.UNTOUCHED,
    ]
  );
});

test('checklist is used as the percentage fallback when there are no measurable goals', () => {
  const [entry] = buildHomeworkStatistics({
    homeworks: [{
      id: 'checklist',
      issuedAt: '2026-09-01T10:00:00.000Z',
      checklistItems: [
        { id: 'one', text: 'Конспект', completedAt: '2026-09-02T10:00:00.000Z' },
        { id: 'two', text: 'Повторить формулы', completedAt: null },
      ],
    }],
    nowMs: Date.parse('2026-09-03T10:00:00.000Z'),
  });

  assert.equal(entry.totalCount, 2);
  assert.equal(entry.completedCount, 1);
  assert.equal(entry.percent, 50);
  assert.equal(entry.checklist.completedCount, 1);
});

test('mock goals expose correct, wrong and untouched tasks', () => {
  const [entry] = buildHomeworkStatistics({
    homeworks: [{
      id: 'mock-homework',
      issuedAt: '2026-09-01T10:00:00.000Z',
      goals: [{ type: 'mock', mockExamId: 'exam-1' }],
    }],
    mockExams: [{
      id: 'exam-1',
      title: 'Вариант 1',
      tasks: { 1: {}, 2: {}, 3: {} },
    }],
    mockAttemptsByExam: {
      'exam-1': {
        updatedAt: '2026-09-02T10:00:00.000Z',
        answers: { 1: '42', 2: '11', 3: '' },
        solved: { 1: true, 2: false, 3: false },
        solvedEver: { 1: true, 2: false, 3: false },
      },
    },
    nowMs: Date.parse('2026-09-03T10:00:00.000Z'),
  });

  assert.equal(entry.percent, 33);
  assert.equal(entry.cleanCount, 1);
  assert.equal(entry.wrongCount, 1);
  assert.equal(entry.untouchedCount, 1);
  assert.equal(entry.goals[0].label, 'Пробник · Вариант 1');
});

test('mock homework statistics ignore lifetime solutions from an earlier assignment', () => {
  const [entry] = buildHomeworkStatistics({
    homeworks: [{
      id: 'homework-2',
      issuedAt: '2026-09-05T10:00:00.000Z',
      goals: [{ type: 'mock', mockExamId: 'exam-1', targetTaskKeys: ['1', '2'] }],
    }],
    mockExams: [{
      id: 'exam-1',
      title: 'Вариант 1',
      tasks: { 1: {}, 2: {} },
    }],
    mockAttemptsByExam: {
      'exam-1': {
        homeworkId: 'homework-2',
        updatedAt: '2026-09-06T10:00:00.000Z',
        answers: { 1: 'old answer', 2: 'new answer' },
        solved: { 1: false, 2: true },
        solvedEver: { 1: true, 2: true },
      },
    },
    nowMs: Date.parse('2026-09-07T10:00:00.000Z'),
  });

  assert.equal(entry.percent, 50);
  assert.deepEqual(
    entry.goals[0].items.map((item) => item.state),
    [HOMEWORK_STAT_STATE.WRONG, HOMEWORK_STAT_STATE.CLEAN]
  );
});

test('mock homework statistics keep a continued attempt outside the new homework time window', () => {
  const [entry] = buildHomeworkStatistics({
    homeworks: [{
      id: 'homework-2',
      issuedAt: '2026-09-05T10:00:00.000Z',
      goals: [{
        type: 'mock',
        mockExamId: 'exam-1',
        targetTaskKeys: ['1', '2'],
        continuationOfHomeworkId: 'homework-1',
      }],
    }],
    mockExams: [{ id: 'exam-1', title: 'Вариант 1', tasks: { 1: {}, 2: {} } }],
    mockAttemptsByExam: {
      'exam-1': {
        homeworkId: 'homework-1',
        updatedAt: '2026-09-04T10:00:00.000Z',
        answers: { 1: '', 2: 'new answer' },
        solved: { 1: false, 2: true },
        solvedEver: { 1: true, 2: true },
      },
    },
    nowMs: Date.parse('2026-09-07T10:00:00.000Z'),
  });

  assert.equal(entry.percent, 50);
  assert.deepEqual(
    entry.goals[0].items.map((item) => item.state),
    [HOMEWORK_STAT_STATE.UNTOUCHED, HOMEWORK_STAT_STATE.CLEAN]
  );
});

test('academic year starts in September and summaries include the recent trend', () => {
  assert.deepEqual(getAcademicYearMeta('2026-08-31T12:00:00.000Z'), {
    key: '2025',
    startYear: 2025,
    endYear: 2026,
    label: '2025/26',
  });
  assert.equal(getAcademicYearMeta('2026-09-01T12:00:00.000Z').key, '2026');

  const summary = summarizeHomeworkStatistics([
    { totalCount: 3, percent: 40, completedOnTime: false, withErrorsCount: 0, wrongCount: 1 },
    { totalCount: 3, percent: 50, completedOnTime: false, withErrorsCount: 1, wrongCount: 0 },
    { totalCount: 3, percent: 60, completedOnTime: false, withErrorsCount: 0, wrongCount: 0 },
    { totalCount: 3, percent: 70, completedOnTime: false, withErrorsCount: 0, wrongCount: 0 },
    { totalCount: 3, percent: 80, completedOnTime: false, withErrorsCount: 0, wrongCount: 0 },
    { totalCount: 3, percent: 100, completedOnTime: true, withErrorsCount: 0, wrongCount: 0 },
  ]);

  assert.equal(summary.averagePercent, 67);
  assert.equal(summary.fullyCompletedCount, 1);
  assert.equal(summary.onTimeCount, 1);
  assert.equal(summary.withErrorsCount, 2);
  assert.equal(summary.incompleteCount, 5);
  assert.equal(summary.trend, 33);
});

test('overall homework statistics do not penalize an unfinished assignment before its due date', () => {
  const nowMs = Date.parse('2026-09-10T12:00:00.000Z');
  const entries = [
    {
      id: 'completed-1',
      totalCount: 3,
      percent: 100,
      dueAt: '2026-09-01T12:00:00.000Z',
      completedOnTime: true,
      withErrorsCount: 0,
      wrongCount: 0,
    },
    {
      id: 'completed-2',
      totalCount: 3,
      percent: 100,
      dueAt: '2026-09-08T12:00:00.000Z',
      completedOnTime: true,
      withErrorsCount: 0,
      wrongCount: 0,
    },
    {
      id: 'current',
      totalCount: 3,
      percent: 0,
      dueAt: '2026-09-15T12:00:00.000Z',
      completedOnTime: false,
      withErrorsCount: 0,
      wrongCount: 0,
    },
  ];

  const included = entries.filter((entry) => isHomeworkReadyForOverallStatistics(entry, nowMs));
  const summary = summarizeHomeworkStatistics(included);

  assert.deepEqual(included.map((entry) => entry.id), ['completed-1', 'completed-2']);
  assert.equal(summary.averagePercent, 100);
  assert.equal(summary.fullyCompletedCount, 2);
  assert.equal(summary.incompleteCount, 0);
  assert.equal(isHomeworkReadyForOverallStatistics({ ...entries[2], dueAt: '2026-09-09T12:00:00.000Z' }, nowMs), true);
});

test('snapshotHomeworkGoalTargets freezes task ids and mock task keys at assignment time', () => {
  const goals = snapshotHomeworkGoalTargets({
    goals: [
      {
        type: 'task',
        taskNumber: 1,
        levelId: 'basic',
        targetQuestions: [1, 3],
      },
      {
        type: 'mock',
        mockExamId: 'exam-1',
      },
    ],
    testsDb,
    mockExams: [{
      id: 'exam-1',
      tasks: { 1: {}, 4: {}, 7: {} },
    }],
  });

  assert.deepEqual(goals[0].targetQuestionIds, ['q-1', 'q-3']);
  assert.deepEqual(goals[1].targetTaskKeys, ['1', '4', '7']);

  const preserved = snapshotHomeworkGoalTargets({
    goals: [{
      type: 'task',
      taskNumber: 1,
      levelId: 'basic',
      targetQuestions: [2],
      targetQuestionIds: ['historic-question'],
    }],
    testsDb,
  });
  assert.deepEqual(preserved[0].targetQuestionIds, ['historic-question']);

  const partialSnapshot = snapshotHomeworkGoalTargets({
    goals: [{
      type: 'task',
      taskNumber: 1,
      levelId: 'basic',
      targetQuestions: [1, 2, 3],
      targetQuestionIds: ['q-1', '', 'q-3'],
    }],
    testsDb,
  });
  assert.deepEqual(partialSnapshot[0].targetQuestionIds, ['q-1', '', 'q-3']);
});
