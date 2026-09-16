import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurrentPythonProgressMap } from './pythonProgress.js';

test('recalculates progress against the current question bank', () => {
  const questions = Array.from({ length: 18 }, (_, index) => ({ id: `q${index + 1}` }));
  const result = buildCurrentPythonProgressMap({
    taskList: [{ id: 105, number: 105 }],
    testsDb: { 105: { python: questions } },
    studentData: {
      solvedByTask: { 105: { python: { solved: ['q1', 'q2', 'q3', 'q4', 'q5'] } } },
    },
    storedProgress: { 105: 100 },
  });
  assert.equal(result[105], 28);
});

test('ignores solved ids that no longer belong to the bank', () => {
  const result = buildCurrentPythonProgressMap({
    taskList: [{ id: 105, number: 105 }],
    testsDb: { 105: { python: [{ id: 'a' }, { id: 'b' }] } },
    studentData: {
      solvedByTask: { 105: { python: { solved: ['a', 'removed-question'] } } },
    },
    storedProgress: { 105: 100 },
  });
  assert.equal(result[105], 50);
});

test('keeps legacy stored progress when solved ids are unavailable', () => {
  const result = buildCurrentPythonProgressMap({
    taskList: [{ id: 105, number: 105 }],
    testsDb: { 105: { python: [{ id: 'a' }, { id: 'b' }] } },
    studentData: {},
    storedProgress: { 105: 75 },
  });
  assert.equal(result[105], 75);
});
