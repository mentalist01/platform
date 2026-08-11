import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHomeworkQuickTaskQueue,
  completeHomeworkQuickTaskSession,
  pickNextHomeworkQuickTask,
  rankHomeworkQuickTaskQueueByDifficulty,
} from './homeworkQuickStart.js';

test('buildHomeworkQuickTaskQueue keeps only unfinished atomic homework tasks', () => {
  const queue = buildHomeworkQuickTaskQueue([
    {
      type: 'task',
      taskNumber: 8,
      levelId: 'basic',
      taskTitle: 'Системы счисления',
      targetStatus: [
        { num: 1, questionId: 'q-1', solved: true },
        { num: 2, questionId: 'q-2', solved: false },
      ],
    },
    {
      type: 'mock',
      mockExamId: 'mock-1',
      targetStatus: [{ num: 1, solved: false }],
    },
  ]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].questionId, 'q-2');
  assert.equal(queue[0].questionNumber, 2);
  assert.equal(queue[0].key, '8|basic|q-2');
});

test('buildHomeworkQuickTaskQueue deduplicates repeated homework targets', () => {
  const duplicate = {
    type: 'task',
    taskNumber: 5,
    levelId: 'medium',
    targetStatus: [{ num: 3, questionId: 'same', solved: false }],
  };

  assert.equal(buildHomeworkQuickTaskQueue([duplicate, duplicate]).length, 1);
});

test('pickNextHomeworkQuickTask skips current and completed tasks', () => {
  const queue = [
    { key: 'first' },
    { key: 'second' },
    { key: 'third' },
  ];

  assert.deepEqual(
    pickNextHomeworkQuickTask(queue, ['second'], 'first'),
    { key: 'third' }
  );
});

test('required homework targets come before optional targets', () => {
  const queue = buildHomeworkQuickTaskQueue([
    {
      type: 'task',
      assignmentTier: 'optional',
      taskNumber: 9,
      levelId: 'basic',
      targetStatus: [{ num: 1, questionId: 'optional', solved: false }],
    },
    {
      type: 'task',
      assignmentTier: 'required',
      taskNumber: 4,
      levelId: 'basic',
      targetStatus: [{ num: 2, questionId: 'required', solved: false }],
    },
  ]);

  assert.deepEqual(queue.map((item) => item.questionId), ['required', 'optional']);
});

test('reliable difficulty orders quick homework from easiest to hardest', () => {
  const queue = buildHomeworkQuickTaskQueue([{
    type: 'task',
    assignmentTier: 'required',
    taskNumber: 8,
    levelId: 'basic',
    targetStatus: [
      { num: 1, questionId: 'hard', solved: false },
      { num: 2, questionId: 'easy', solved: false },
      { num: 3, questionId: 'medium', solved: false },
    ],
  }]);
  const ranked = rankHomeworkQuickTaskQueueByDifficulty(queue, {
    8: {
      basic: {
        hard: { score: 78, sampleSize: 7 },
        easy: { score: 12, sampleSize: 5 },
        medium: { score: 43, sampleSize: 10 },
      },
    },
  });

  assert.deepEqual(ranked.map((item) => item.questionId), ['easy', 'medium', 'hard']);
  assert.deepEqual(ranked.map((item) => item.difficultyScore), [12, 43, 78]);
});

test('unknown and provisional difficulty stays after reliable estimates in original order', () => {
  const queue = buildHomeworkQuickTaskQueue([{
    type: 'task',
    taskNumber: 6,
    levelId: 'basic',
    targetStatus: [
      { num: 1, questionId: 'unknown-first', solved: false },
      { num: 2, questionId: 'known', solved: false },
      { num: 3, questionId: 'provisional', solved: false },
      { num: 4, questionId: 'unknown-last', solved: false },
    ],
  }]);
  const ranked = rankHomeworkQuickTaskQueueByDifficulty(queue, {
    6: {
      basic: {
        known: { score: 24, sampleSize: 5 },
        provisional: { score: 3, sampleSize: 4 },
      },
    },
  });

  assert.deepEqual(
    ranked.map((item) => item.questionId),
    ['known', 'unknown-first', 'provisional', 'unknown-last']
  );
  assert.equal(ranked[0].difficultyKnown, true);
  assert.equal(ranked[2].difficultyKnown, false);
});

test('required work remains before easier optional work', () => {
  const queue = buildHomeworkQuickTaskQueue([
    {
      type: 'task',
      assignmentTier: 'optional',
      taskNumber: 9,
      levelId: 'basic',
      targetStatus: [{ num: 1, questionId: 'optional-easy', solved: false }],
    },
    {
      type: 'task',
      assignmentTier: 'required',
      taskNumber: 4,
      levelId: 'basic',
      targetStatus: [{ num: 2, questionId: 'required-hard', solved: false }],
    },
  ]);
  const ranked = rankHomeworkQuickTaskQueueByDifficulty(queue, {
    9: { basic: { 'optional-easy': { score: 1, sampleSize: 8 } } },
    4: { basic: { 'required-hard': { score: 90, sampleSize: 8 } } },
  });

  assert.deepEqual(ranked.map((item) => item.questionId), ['required-hard', 'optional-easy']);
});

test('malformed goals and targets are ignored', () => {
  const queue = buildHomeworkQuickTaskQueue([
    { type: 'task', taskNumber: '', levelId: 'basic', targetStatus: [{ num: 1 }] },
    { type: 'task', taskNumber: 5, levelId: '', targetStatus: [{ num: 1 }] },
    { type: 'task', taskNumber: 5, levelId: 'basic', targetStatus: [{ num: 0 }] },
  ]);

  assert.deepEqual(queue, []);
});

test('completing a quick task advances once and becomes complete on the last item', () => {
  const first = { key: 'first' };
  const second = { key: 'second' };
  const initial = {
    status: 'solving',
    currentTask: first,
    completedKeys: [],
    completedCount: 0,
  };
  const afterFirst = completeHomeworkQuickTaskSession(initial, [first, second], first);
  assert.equal(afterFirst.status, 'celebrate');
  assert.equal(afterFirst.completedCount, 1);

  const duplicate = completeHomeworkQuickTaskSession(afterFirst, [first, second], first);
  assert.equal(duplicate, afterFirst);

  const secondSession = { ...afterFirst, status: 'solving', currentTask: second };
  const afterSecond = completeHomeworkQuickTaskSession(secondSession, [first, second], second);
  assert.equal(afterSecond.status, 'complete');
  assert.equal(afterSecond.completedCount, 2);
});
