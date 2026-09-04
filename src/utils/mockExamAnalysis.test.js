import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMockExamAnalysis } from './mockExamAnalysis.js';

const getAnswerCountForTask = (taskKey) => (String(taskKey) === '20' ? 2 : 1);
const getExpectedAnswers = (question, count) => (
  Array.from({ length: count }, (_, index) => question.answers?.[index] ?? question.answer ?? '')
);
const getPrimaryScoreFromSolved = (solved) => Object.entries(solved).reduce((sum, [key, value]) => (
  value ? sum + ([26, 27].includes(Number(key)) ? 2 : 1) : sum
), 0);
const getSecondaryScoreFromPrimary = (primary) => primary * 3;

test('analysis keeps historical topic identities and prefers a new exam title snapshot', () => {
  const taskCatalog = [{ number: 13, slotNumber: 10, title: 'Графы' }, { number: 28, slotNumber: 23, title: 'Новое задание' }];
  const options = { taskCatalog, getAnswerCountForTask, getExpectedAnswers, getPrimaryScoreFromSolved, getSecondaryScoreFromPrimary };
  const legacy = buildMockExamAnalysis({ ...options, exam: { tasks: { 13: { answer: '1' } } } });
  assert.equal(legacy.tasks[0].title, 'Графы');
  const generated = buildMockExamAnalysis({ ...options, exam: { tasks: { 23: { sourceTaskNumber: 28, answer: '2' } } } });
  assert.equal(generated.tasks[0].title, 'Новое задание');
  const snapshot = buildMockExamAnalysis({ ...options, exam: { taskTitleSnapshot: { 13: 'Исполнитель' }, tasks: { 13: { answer: '3' } } } });
  assert.equal(snapshot.tasks[0].title, 'Исполнитель');
});

test('buildMockExamAnalysis separates correct, wrong and unanswered tasks', () => {
  const analysis = buildMockExamAnalysis({
    exam: {
      id: 'exam-1',
      title: 'Июльский пробник',
      tasks: {
        1: { answer: '42', label: { text: 'Логика', color: '#7c3aed' } },
        20: { answers: ['7', '9'] },
        27: { answer: '100' },
      },
    },
    attempt: {
      mode: 'classic',
      answers: { 1: '42', 20: ['7', '8'], 27: '' },
      solved: { 1: true, 20: false, 27: false },
    },
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.equal(analysis.correctCount, 1);
  assert.equal(analysis.incorrectCount, 1);
  assert.equal(analysis.unansweredCount, 1);
  assert.equal(analysis.accuracyPercent, 50);
  assert.equal(analysis.primaryScore, 1);
  assert.equal(analysis.primaryMaximum, 4);
  assert.equal(analysis.tasks[0].title, 'Логика');
  assert.deepEqual(analysis.recommendedTaskKeys, ['27', '20']);
  assert.deepEqual(analysis.tasks.find((task) => task.taskKey === '20').providedAnswers, ['7', '8']);
});

test('unfinished timer analysis does not expose correctness', () => {
  const analysis = buildMockExamAnalysis({
    exam: { id: 'exam-2', tasks: { 1: { answer: '42' }, 2: { answer: '5' } } },
    attempt: {
      mode: 'timer',
      timerStartedAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:30:00.000Z',
      answers: { 1: '42', 2: '' },
      solved: { 1: true, 2: false },
    },
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.equal(analysis.resultsVisible, false);
  assert.equal(analysis.tasks[0].status, 'pending');
  assert.equal(analysis.correctCount, 0);
  assert.equal(analysis.primaryScore, null);
  assert.deepEqual(analysis.recommendedTaskKeys, []);
});

test('timer analysis reports elapsed time and weakest section after finish', () => {
  const analysis = buildMockExamAnalysis({
    exam: {
      tasks: {
        1: { answer: '1' },
        13: { answer: '13' },
        14: { answer: '14' },
        26: { answer: '26' },
      },
    },
    attempt: {
      mode: 'timer',
      timerStartedAt: '2026-07-29T10:00:00.000Z',
      timerFinishedAt: '2026-07-29T12:15:00.000Z',
      updatedAt: '2026-07-29T12:15:00.000Z',
      answers: { 1: '1', 13: '0', 14: '', 26: '0' },
      solved: { 1: true, 13: false, 14: false, 26: false },
    },
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.equal(analysis.elapsedMs, 135 * 60 * 1000);
  assert.equal(analysis.weakestSection.id, 'logic');
  assert.equal(analysis.priorityTasks[0].taskKey, '26');
  assert.equal(analysis.recoverablePrimary, 4);
});

test('targetTaskKeys limits analysis to the assigned mock subset', () => {
  const analysis = buildMockExamAnalysis({
    exam: { tasks: { 1: { answer: '1' }, 2: { answer: '2' }, 3: { answer: '3' } } },
    attempt: { mode: 'classic', answers: { 1: '1', 2: '0', 3: '0' }, solved: { 1: true } },
    targetTaskKeys: ['3', '1', 'missing'],
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.deepEqual(analysis.tasks.map((task) => task.taskKey), ['1', '3']);
  assert.equal(analysis.totalCount, 2);
});

test('homework recommendation includes every problem task', () => {
  const tasks = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [String(index + 1), { answer: String(index + 1) }])
  );
  const analysis = buildMockExamAnalysis({
    exam: { tasks },
    attempt: { mode: 'classic', answers: {}, solved: {} },
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.equal(analysis.recommendedTaskKeys.length, 8);
});

test('task analysis exposes the student active time and teacher aggregate', () => {
  const analysis = buildMockExamAnalysis({
    exam: { id: 'timed', tasks: { 1: { answer: '42' } } },
    attempt: {
      mode: 'classic',
      answers: { 1: '42' },
      solved: { 1: true },
      taskDurationsMs: { 1: 95_000 },
    },
    taskAnalytics: {
      1: { sampleSize: 6, averageDurationMs: 120_000, category: 'medium' },
    },
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.equal(analysis.tasks[0].activeDurationMs, 95_000);
  assert.equal(analysis.tasks[0].analytics.averageDurationMs, 120_000);
});

test('analysis identifies a result corrected by the teacher and keeps the original answer', () => {
  const analysis = buildMockExamAnalysis({
    exam: { id: 'reviewed', tasks: { 7: { answer: '7657' } } },
    attempt: {
      mode: 'classic',
      answers: { 7: '7656' },
      solved: { 7: true },
      resultOverrides: {
        7: { correct: true, reviewedAt: '2026-09-04T10:00:00.000Z', reviewedBy: 'teacher-a' },
      },
    },
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.equal(analysis.tasks[0].status, 'correct');
  assert.equal(analysis.tasks[0].manualOverride, true);
  assert.deepEqual(analysis.tasks[0].providedAnswers, ['7656']);
  assert.equal(analysis.primaryScore, 1);
});

test('analysis exposes every configured accepted answer variant', () => {
  const analysis = buildMockExamAnalysis({
    exam: {
      tasks: {
        7: { answer: '7657', acceptedAnswerVariants: [['7657'], ['7656']] },
      },
    },
    attempt: { mode: 'classic', answers: { 7: '7656' }, solved: { 7: true } },
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  });

  assert.deepEqual(analysis.tasks[0].acceptedAnswerVariants, [['7657'], ['7656']]);
});
