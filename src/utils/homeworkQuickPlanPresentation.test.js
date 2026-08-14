import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatQuickHomeworkPlanMinutes,
  getQuickHomeworkPlanPresentation,
} from './homeworkQuickPlanPresentation.js';

test('quick homework plan minutes use natural Russian forms', () => {
  assert.equal(formatQuickHomeworkPlanMinutes(10), '10 минут');
  assert.equal(formatQuickHomeworkPlanMinutes(21), '21 минуту');
  assert.equal(formatQuickHomeworkPlanMinutes(22), '22 минуты');
  assert.equal(formatQuickHomeworkPlanMinutes(31), '31 минуту');
});

test('quick homework plan presentation normalizes progress and includes its duration', () => {
  assert.deepEqual(getQuickHomeworkPlanPresentation({
    completed: 2,
    total: 5,
    budgetMinutes: 10,
  }), {
    active: true,
    total: 5,
    completed: 2,
    budgetMinutes: 10,
    label: 'План на ≈10 минут',
    progressLabel: 'План на ≈10 минут · 2/5',
    percent: 40,
  });
});

test('single fallback task is not presented as a timed plan', () => {
  assert.equal(getQuickHomeworkPlanPresentation({ completed: 0, total: 1 }).active, false);
});

test('a one-task timed choice still keeps its plan context', () => {
  assert.equal(getQuickHomeworkPlanPresentation({
    completed: 0,
    total: 1,
    budgetMinutes: 4,
  }).progressLabel, 'План на ≈4 минуты · 0/1');
});
