import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHomeworkQuickTaskQueue,
  completeHomeworkQuickTaskSession,
  pickNextHomeworkQuickTask,
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
