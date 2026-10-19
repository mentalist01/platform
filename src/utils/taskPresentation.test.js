import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskPresentationMap } from './taskPresentation.js';
import { buildStudentMonthlyReport } from './studentMonthlyReport.js';
import { buildHomeworkStatistics } from './homeworkStats.js';
import { lessonTopicWithNumbers } from './studentMonthlyPractice.js';

const catalog = {
  tasks: [
    { taskNumber: 13, slotNumber: 10, title: 'Графы' },
    { taskNumber: 23, slotNumber: 13, title: 'Исполнитель и траектории' },
    { taskNumber: 28, slotNumber: 23, title: 'Новое задание' },
    { taskNumber: 19, slotNumber: 19, title: 'Теория игр' },
  ],
  archivedTasks: [{ taskNumber: 10, lastSlotNumber: 10, title: 'Word' }],
};
const taskPresentation = buildTaskPresentationMap(catalog);
const taskTitles = Object.fromEntries(Object.entries(taskPresentation).map(([key, task]) => [key, task.title]));

test('report text, lesson topics and detail rows share current display numbers without merging banks', () => {
  const homeworkEntries = [{ dueAt: '2026-10-10T12:00:00Z', percent: 100, goals: [23, 28, 13, 10, 19].map(taskNumber => ({
    type: 'task', taskNumber, levelId: 'basic',
    items: [{ questionId: 'same-id-in-every-bank', state: 'clean', completedAt: '2026-10-09T12:00:00Z' }],
  })) }];
  // A carried-over task must be counted once, while different banks remain distinct.
  const copy = structuredClone(homeworkEntries);
  const report = buildStudentMonthlyReport({ student: { name: 'Вероника' }, taskPresentation, taskTitles,
    month: '2026-10', nowMs: Date.parse('2026-10-19T12:00:00Z'), homeworkEntries: [...homeworkEntries, ...copy],
    lessonEntries: [{ dayKey: '2026-10-08', topic: { taskNumbers: [23] } }],
  });
  assert.deepEqual(homeworkEntries, copy, 'presentation must not rewrite stored identities');
  assert.equal(report.metrics.homework.solvedTaskCount, 5);
  const executor = report.metrics.homework.practice.find(group => group.taskNumber === 23);
  assert.equal(executor.displayNumber, '13');
  assert.equal(executor.solvedCount, 1);
  assert.equal(report.metrics.homework.practice.find(group => group.taskNumber === 28).displayNumber, '23');
  assert.deepEqual(report.metrics.lessons.topics, ['Задание №13 (Исполнитель и траектории)']);
  for (const text of [report.parentText, report.studentText]) {
    assert.match(text, /по заданию ЕГЭ №13 \(«Исполнитель и траектории»\)/u);
    assert.match(text, /по заданию ЕГЭ №23 \(«Новое задание»\)/u);
    assert.match(text, /по заданию ЕГЭ №10 \(«Графы»\)/u);
    assert.match(text, /по архивному заданию №10 \(«Word»\)/u);
    assert.match(text, /ЕГЭ №19-21/u);
    assert.doesNotMatch(text, /№28|№23 \(«Исполнитель/u);
  }
});

test('homework statistics change labels only, keeping grades, answers and stable targets intact', () => {
  const options = { nowMs: Date.parse('2026-10-19T12:00:00Z'),
    testsDb: Object.fromEntries([23, 28, 13, 10].map(number => [number, { basic: [{ id: 'q' }] }])),
    homeworks: [{ issuedAt: '2026-10-01T12:00:00Z', dueAt: '2026-10-18T12:00:00Z', goals: [23, 28, 13, 10].map(taskNumber => ({
      type: 'task', taskNumber, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['q'],
    })) }],
    studentData: { solvedEvents: [23, 28, 13].map(taskNumber => ({ taskNumber, levelId: 'basic', questionId: 'q', solvedAt: '2026-10-09T12:00:00Z' })) },
  };
  const [before] = buildHomeworkStatistics(options);
  const [after] = buildHomeworkStatistics({ ...options, taskPresentation });
  assert.equal(after.percent, before.percent);
  assert.equal(after.percent, 75);
  assert.equal(after.checkpointPercent, before.checkpointPercent);
  assert.deepEqual(after.goals.map(goal => goal.taskNumber), [23, 28, 13, 10]);
  assert.deepEqual(after.goals.map(goal => goal.items), before.goals.map(goal => goal.items));
  assert.deepEqual(after.goals.map(goal => goal.label), ['Задание 13 · Базовый', 'Задание 23 · Базовый', 'Задание 10 · Базовый', 'Архивное задание 10 · Базовый']);
});

test('catalogs are explicit and isolated by teacher; named topics and Python do not leak mappings', () => {
  const otherTeacher = buildTaskPresentationMap({ activeTasks: [{ taskNumber: 23, slotNumber: 23, title: 'Другая тема' }] });
  assert.equal(lessonTopicWithNumbers({ taskNumbers: [23] }, taskTitles, taskPresentation), 'Задание №13 (Исполнитель и траектории)');
  assert.equal(lessonTopicWithNumbers({ taskNumbers: [23] }, {}, otherTeacher), 'Задание №23 (Другая тема)');
  assert.equal(lessonTopicWithNumbers('Исполнитель и траектории', taskTitles, taskPresentation), 'Задание №13 (Исполнитель и траектории)');
  assert.equal(lessonTopicWithNumbers({ taskNumbers: [105] }, { 105: 'Цикл for' }, taskPresentation), 'Python: Цикл for');
  assert.equal(lessonTopicWithNumbers('Произвольный текст 23', taskTitles, taskPresentation), 'Произвольный текст 23');
});
