import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areMockExamTasksEqual,
  attachMockExamSnapshotToAttempt,
  createMockExamSnapshot,
  resolveMockExamForAttempt,
} from './mockExamVersioning.js';

test('attempt snapshot keeps the original mock content after the definition changes', () => {
  const original = {
    id: 'exam', title: 'Первая редакция', contentRevision: 2,
    tasks: { 1: { question: 'Старый вопрос', answer: '42' } },
  };
  const attempt = attachMockExamSnapshotToAttempt({ attemptId: 'attempt' }, createMockExamSnapshot(original));
  const current = {
    id: 'exam', title: 'Новая редакция', contentRevision: 3,
    tasks: { 1: { question: 'Новый вопрос', answer: '43' }, 2: { answer: '7' } },
  };

  const resolved = resolveMockExamForAttempt(current, attempt);
  assert.equal(resolved.title, 'Первая редакция');
  assert.equal(resolved.tasks['1'].answer, '42');
  assert.equal(Object.hasOwn(resolved.tasks, '2'), false);
  assert.equal(attempt.examRevision, 2);
});

test('historical result snapshot wins over the current attempt and legacy tasks remain usable', () => {
  const current = { id: 'exam', title: 'Сейчас', tasks: { 1: { answer: 'new' } } };
  const result = {
    examId: 'exam', examTitle: 'Тогда', examRevision: 4,
    tasks: { 1: { answer: 'old' } },
  };
  const resolved = resolveMockExamForAttempt(current, {}, result);
  assert.equal(resolved.title, 'Тогда');
  assert.equal(resolved.tasks['1'].answer, 'old');
  assert.equal(resolved.contentRevision, 4);
});

test('task comparison only advances a revision for actual content changes', () => {
  assert.equal(areMockExamTasksEqual({ 1: { answer: '42' } }, { 1: { answer: '42' } }), true);
  assert.equal(areMockExamTasksEqual({ 1: { answer: '42' } }, { 1: { answer: '43' } }), false);
});
