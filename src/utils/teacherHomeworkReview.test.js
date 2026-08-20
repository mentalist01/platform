import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeacherHomeworkReviewItems,
  filterTeacherHomeworkReviewItems,
  getPendingTeacherHomeworkReviewItems,
  mergeTeacherHomeworkReviewTaskProgress,
  sortTeacherHomeworkReviewItems,
} from './teacherHomeworkReview.js';

test('buildTeacherHomeworkReviewItems keeps homework goal and target order', () => {
  const items = buildTeacherHomeworkReviewItems({
    goalViews: [
      {
        type: 'task',
        taskNumber: 5,
        levelId: 'basic',
        assignmentTier: 'required',
        targetStatus: [
          { num: 2, questionId: 'q-2', solved: false },
          { num: 1, questionId: 'q-1', solved: true },
        ],
      },
      {
        type: 'task',
        taskNumber: 7,
        levelId: 'advanced',
        assignmentTier: 'optional',
        targetStatus: [{ num: 1, questionId: 'q-7', solved: false }],
      },
    ],
    testsDb: {
      5: { basic: [{ id: 'q-1', question: 'One' }, { id: 'q-2', question: 'Two' }] },
      7: { advanced: [{ id: 'q-7', question: 'Seven' }] },
    },
    levels: {
      BASIC: { label: 'Базовый' },
      ADVANCED: { label: 'Сложный' },
    },
    formatTaskNumber: String,
  });

  assert.deepEqual(items.map((item) => item.questionId), ['q-2', 'q-1', 'q-7']);
  assert.deepEqual(items.map((item) => item.question.question), ['Two', 'One', 'Seven']);
  assert.equal(items[1].solved, true);
  assert.equal(items[2].optional, true);
  assert.equal(items[2].levelLabel, 'Сложный');
});

test('buildTeacherHomeworkReviewItems marks an unfinished mock task with an answer as attempted', () => {
  const items = buildTeacherHomeworkReviewItems({
    goalViews: [{
      type: 'mock',
      mockExamId: 'mock-1',
      targetStatus: [
        { taskKey: '3', label: '3', solved: false },
        { taskKey: '4', label: '4', solved: true },
      ],
    }],
    mockExamById: {
      'mock-1': {
        title: 'Пробник августа',
        tasks: {
          3: { question: 'Mock three' },
          4: { question: 'Mock four' },
        },
      },
    },
    mockAttemptsByExam: {
      'mock-1': { answers: { 3: 'wrong answer', 4: '' } },
    },
    formatTaskNumber: String,
  });

  assert.equal(items[0].attempted, true);
  assert.equal(items[0].mockExamTitle, 'Пробник августа');
  assert.equal(items[1].solved, true);
  assert.deepEqual(getPendingTeacherHomeworkReviewItems(items).map((item) => item.questionId), ['3']);
});

test('mergeTeacherHomeworkReviewTaskProgress refreshes solved and attempted states', () => {
  const source = [
    {
      key: 'one',
      sourceType: 'task',
      taskNumber: 5,
      levelId: 'basic',
      questionId: 'q-1',
      solved: false,
      attempted: false,
      studentAnswers: [],
    },
    {
      key: 'two',
      sourceType: 'task',
      taskNumber: 5,
      levelId: 'basic',
      questionId: 'q-2',
      solved: false,
      attempted: false,
      studentAnswers: [],
    },
  ];
  const merged = mergeTeacherHomeworkReviewTaskProgress(source, {
    '5|basic': {
      solvedIds: new Set(['q-1']),
      historyById: {
        'q-1': [{ submittedAt: '2026-08-09T09:00:00.000Z', correct: true, answers: ['12'], solveDurationMs: 42_000 }],
        'q-2': [{ submittedAt: '2026-08-09T10:00:00.000Z', correct: false, answers: ['17'], solveDurationMs: 75_000 }],
      },
    },
  });

  assert.equal(merged[0].solved, true);
  assert.equal(merged[0].solveDurationMs, 42_000);
  assert.equal(merged[1].attempted, true);
  assert.equal(merged[1].solveDurationMs, 75_000);
  assert.deepEqual(merged[1].studentAnswers, ['17']);
  assert.deepEqual(getPendingTeacherHomeworkReviewItems(merged).map((item) => item.key), ['two']);
});

test('review filters and sorts timed work with missing telemetry last', () => {
  const items = [
    { key: 'slow', solved: true, solveDurationMs: 180_000 },
    { key: 'pending', solved: false, solveDurationMs: null },
    { key: 'fast', solved: true, solveDurationMs: 35_000 },
  ];

  assert.deepEqual(
    filterTeacherHomeworkReviewItems(items, 'completed').map((item) => item.key),
    ['slow', 'fast']
  );
  assert.deepEqual(
    sortTeacherHomeworkReviewItems(items, 'fastest').map((item) => item.key),
    ['fast', 'slow', 'pending']
  );
  assert.deepEqual(
    sortTeacherHomeworkReviewItems(items, 'slowest').map((item) => item.key),
    ['slow', 'fast', 'pending']
  );
});

test('review sorts by difficulty and keeps unknown estimates last', () => {
  const items = [
    { key: 'medium', question: { difficulty: { score: 50 } } },
    { key: 'unknown', question: {} },
    { key: 'easy', question: { difficulty: { score: 10 } } },
    { key: 'hard', question: { difficulty: { score: 90 } } },
  ];

  assert.deepEqual(sortTeacherHomeworkReviewItems(items, 'easiest').map((item) => item.key), ['easy', 'medium', 'hard', 'unknown']);
  assert.deepEqual(sortTeacherHomeworkReviewItems(items, 'hardest').map((item) => item.key), ['hard', 'medium', 'easy', 'unknown']);
  assert.deepEqual(sortTeacherHomeworkReviewItems(items, 'assignment').map((item) => item.key), ['medium', 'unknown', 'easy', 'hard']);
});

test('review sorts equally difficult tasks by average solving time', () => {
  const items = [
    { key: 'one-minute', difficulty: { category: 'very_easy', score: 10, averageDurationMs: 60_000 } },
    { key: 'thirty-seconds', difficulty: { category: 'very_easy', score: 10, averageDurationMs: 30_000 } },
    { key: 'forty-seconds', difficulty: { category: 'very_easy', score: 10, averageDurationMs: 40_000 } },
  ];

  assert.deepEqual(
    sortTeacherHomeworkReviewItems(items, 'easiest').map((item) => item.key),
    ['thirty-seconds', 'forty-seconds', 'one-minute']
  );
  assert.deepEqual(
    sortTeacherHomeworkReviewItems(items, 'hardest').map((item) => item.key),
    ['one-minute', 'forty-seconds', 'thirty-seconds']
  );
});

test('mock review items include saved time for every exam task', () => {
  const items = buildTeacherHomeworkReviewItems({
    goalViews: [{
      type: 'mock',
      mockExamId: 'mock-1',
      targetStatus: [{ taskKey: '7', label: '7', solved: true }],
    }],
    mockExamById: { 'mock-1': { title: 'Пробник', tasks: { 7: { question: 'Seven' } } } },
    mockAttemptsByExam: {
      'mock-1': {
        answers: { 7: '42' },
        taskDurationsMs: { 7: 91_500 },
      },
    },
    formatTaskNumber: String,
  });

  assert.equal(items[0].solveDurationMs, 91_500);
});
