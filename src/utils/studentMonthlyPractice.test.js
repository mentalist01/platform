import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentMonthlyReport } from './studentMonthlyReport.js';
import { monthlyHomeworkPractice, lessonTopicWithNumbers } from './studentMonthlyPractice.js';

test('monthly practice counts dated homework completions once across carryovers, levels and months', () => {
  const goal = (taskNumber, items, levelId = 'basic') => ({ type: 'task', taskNumber, levelId, items });
  const solved = (questionId, completedAt, state = 'clean') => ({ questionId, completedAt, state });
  const entries = [
    { goals: [goal(4, [solved('a', '2026-10-01T10:00:00Z'), solved('old', '2026-09-30T20:59:59Z'), solved('border', '2026-09-30T21:00:00Z'), solved('future', '2026-10-31T20:00:00Z'), solved('no-date', null), solved('wrong', '2026-10-03T10:00:00Z', 'wrong')]), goal(105, [solved('python', '2026-10-04T10:00:00Z')], 'python')] },
    { goals: [goal(4, [solved('a', '2026-10-01T10:00:00Z'), solved('b', Date.parse('2026-10-02T10:00:00Z'), 'with-errors')]), { type: 'mock', items: [solved('exam', '2026-10-01T10:00:00Z')] }] },
  ];
  assert.deepEqual(monthlyHomeworkPractice(entries, '2026-10', Date.parse('2026-10-15T10:00:00Z'), { 4: 'Кодирование', 105: 'Цикл for' }), [
    { taskNumber: 4, displayNumber: '4', archived: false, title: 'Кодирование', solvedCount: 3 }, { taskNumber: 105, displayNumber: '105', archived: false, title: 'Цикл for', solvedCount: 1 },
  ]);
});

test('lesson topics retain every explicit task number and do not guess ambiguous topic names', () => {
  const titles = { 4: 'Кодирование', 7: 'Изображения', 9: 'Excel', 11: 'Информация', 105: 'Цикл for' };
  assert.equal(lessonTopicWithNumbers({ text: 'Задания №4, 7 и ещё 2', taskNumbers: [4, 7, 11, 105] }, titles), 'Задание №4 (Кодирование); Задание №7 (Изображения); Задание №11 (Информация); Python: Цикл for');
  assert.equal(lessonTopicWithNumbers({ text: 'Excel' }, titles), 'Задание №9 (Excel)');
  assert.equal(lessonTopicWithNumbers({ text: 'Электронные таблицы' }, titles), 'Электронные таблицы');
});

test('parent and student reports explain quantities naturally without claiming homework happened in class', () => {
  const report = buildStudentMonthlyReport({ student: { id: 'test', name: 'Егор' }, month: '2026-10', nowMs: Date.parse('2026-10-15T12:00:00Z'), taskTitles: { 4: 'Кодирование', 105: 'Цикл for' },
    lessonEntries: [{ dayKey: '2026-10-01', topic: { text: 'Неуточнённая тема' } }],
    homeworkEntries: [{ dueAt: '2026-10-05T10:00:00Z', percent: 100, goals: [
      { type: 'task', taskNumber: 4, levelId: 'basic', items: [{ questionId: 'a', state: 'clean', completedAt: '2026-10-02T10:00:00Z' }] },
      { type: 'task', taskNumber: 105, levelId: 'python', items: [{ questionId: 'b', state: 'clean', completedAt: '2026-10-02T10:00:00Z' }] },
    ] }],
    mockEntries: [{ id: 'mock', date: '2026-10-10T10:00:00Z', score: 50 }],
  });
  assert.equal(report.metrics.homework.solvedTaskCount, 2);
  assert.match(report.parentText, /Между уроками Егор решил 1 задачу по заданию ЕГЭ №4/);
  assert.match(report.parentText, /По Python Егор решил 1 задачу по теме «Цикл for»/);
  assert.match(report.studentText, /Между уроками ты решил/);
  assert.doesNotMatch(report.parentText, /На уроках разобрали:.*№4/);
  assert.doesNotMatch(report.parentText, /освоил|освоила|хороший объём самостоятельной практики/);
});
