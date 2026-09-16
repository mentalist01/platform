import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudentMonthlyReport, normalizeStudentReportMonth } from './studentMonthlyReport.js';

test('monthly report combines lessons, homework deadlines and mock progress', () => {
  const report = buildStudentMonthlyReport({
    student: { id: 'student-1', name: 'Илья' },
    month: '2026-09',
    nowMs: Date.parse('2026-09-20T12:00:00+03:00'),
    lessonEntries: [
      { dayKey: '2026-09-02', durationMinutes: 60, topic: { title: 'Системы счисления' }, startMs: Date.parse('2026-09-02T12:00:00+03:00') },
      { dayKey: '2026-09-09', durationMinutes: 90, subject: 'Python', startMs: Date.parse('2026-09-09T12:00:00+03:00') },
      { dayKey: '2026-10-01', durationMinutes: 60 },
    ],
    homeworkEntries: [
      { id: 'h1', dueAt: '2026-09-08T18:00:00+03:00', percent: 100, completedOnTime: true, goals: [] },
      { id: 'h2', dueAt: '2026-09-15T18:00:00+03:00', percent: 40, goals: [{ label: 'Задание 19', items: [{ state: 'untouched' }] }] },
      { id: 'h3', dueAt: '2026-09-28T18:00:00+03:00', percent: 0, goals: [] },
      { id: 'h4', dueAt: '2026-08-28T18:00:00+03:00', percent: 0, goals: [] },
    ],
    mockEntries: [
      { id: 'm0', title: 'Август', score: 27, dateMs: Date.parse('2026-08-20T12:00:00+03:00'), date: '2026-08-20T09:00:00.000Z' },
      { id: 'm1', title: 'Сентябрьский пробник', score: 43, dateMs: Date.parse('2026-09-10T12:00:00+03:00'), date: '2026-09-10T09:00:00.000Z' },
    ],
  });

  assert.equal(report.month, '2026-09');
  assert.equal(report.metrics.lessons.count, 2);
  assert.equal(report.metrics.lessons.minutes, 150);
  assert.deepEqual(report.metrics.lessons.topics, ['Системы счисления']);
  assert.equal(report.metrics.homework.assignedCount, 3);
  assert.equal(report.metrics.homework.completedCount, 1);
  assert.equal(report.metrics.homework.onTimeCount, 1);
  assert.equal(report.metrics.homework.incompleteCount, 1);
  assert.equal(report.metrics.homework.upcomingCount, 1);
  assert.equal(report.metrics.homework.evaluatedCount, 2);
  assert.equal(report.metrics.homework.averagePercent, 70);
  assert.equal(report.metrics.mocks.latestScore, 43);
  assert.equal(report.metrics.mocks.previousScore, 27);
  assert.equal(report.metrics.mocks.deltaFromPrevious, 16);
  assert.match(report.text, /70%/);
  assert.match(report.text, /пробник на 43 балла/);
  assert.match(report.text, /на 16 баллов выше предыдущего результата/);
  assert.doesNotMatch(report.text, /Python|Сентябрьский пробник|Ещё в работе|2 ч 30 мин|просроч|в срок|[—–]/u);
});

test('monthly report handles an empty month without inventing results', () => {
  const report = buildStudentMonthlyReport({
    student: { id: 'student-1', name: 'Анна' },
    month: '2026-07',
    nowMs: Date.parse('2026-09-20T12:00:00+03:00'),
  });
  assert.equal(report.metrics.homework.assignedCount, 0);
  assert.equal(report.metrics.mocks.latestScore, null);
  assert.match(report.text, /пока мало данных/);
  assert.doesNotMatch(report.text, /undefined|null/);
});

test('report month validation rejects malformed values', () => {
  assert.equal(normalizeStudentReportMonth('2026-09'), '2026-09');
  assert.equal(normalizeStudentReportMonth('2026-13'), '');
  assert.equal(normalizeStudentReportMonth('september'), '');
});

test('automatic conclusion does not judge homework whose deadline has not arrived', () => {
  const report = buildStudentMonthlyReport({
    student: { name: 'Анна' },
    month: '2026-09',
    nowMs: Date.parse('2026-09-10T12:00:00+03:00'),
    homeworkEntries: [
      { dueAt: '2026-09-25T18:00:00+03:00', percent: 0, goals: [] },
    ],
  });
  assert.doesNotMatch(report.automaticConclusion, /домаш|срок|регулярн|зона роста/i);
  assert.doesNotMatch(report.text, /срок не наступил/i);
});

test('homework progress uses a human percentage and never asks to finish overdue work', () => {
  const report = buildStudentMonthlyReport({
    student: { id: 'student-ivan', name: 'Иван' },
    month: '2026-09',
    nowMs: Date.parse('2026-09-20T12:00:00+03:00'),
    homeworkEntries: [
      { dueAt: '2026-09-05T18:00:00+03:00', percent: 73, completedOnTime: false },
      { dueAt: '2026-09-27T18:00:00+03:00', percent: 0 },
    ],
  });

  assert.equal(report.metrics.homework.evaluatedCount, 1);
  assert.equal(report.metrics.homework.averagePercent, 73);
  assert.match(report.text, /Иван/u);
  assert.match(report.text, /более чем на 70%|73%/u);
  assert.doesNotMatch(report.text, /просроч|закончить|из 2|в срок/ui);
});

test('parent-facing copy uses only saved lesson topics and explains a first mock naturally', () => {
  const nowMs = Date.parse('2026-09-14T18:00:00+03:00');
  const report = buildStudentMonthlyReport({
    student: { id: 'danil', name: 'Данил' },
    month: '2026-09',
    nowMs,
    lessonEntries: [
      { dayKey: '2026-09-02', durationMinutes: 60, subject: 'Данил', startMs: nowMs - 10_000 },
      { dayKey: '2026-09-06', durationMinutes: 60, topic: { text: 'Задания №7, 4', source: 'notes' }, startMs: nowMs - 9_000 },
      { dayKey: '2026-09-10', durationMinutes: 30, subject: 'Данил пробное', startMs: nowMs - 8_000 },
    ],
    homeworkEntries: [
      { dueAt: '2026-09-05T18:00:00+03:00', percent: 100, completedOnTime: true },
      { dueAt: '2026-09-12T18:00:00+03:00', percent: 100, completedOnTime: true },
      { dueAt: '2026-09-20T18:00:00+03:00', percent: 0 },
    ],
    mockEntries: [
      { id: 'mock-1', title: 'ВАРИАНТ ПРЕДСКАЗАНИЕ на ЕГЭ 2026', score: 27, dateMs: nowMs - 7_000 },
    ],
  });

  assert.deepEqual(report.metrics.lessons.topics, ['Задания №7 и 4']);
  assert.match(report.text, /мы провели 3 занятия|прошло 3 занятия/u);
  assert.match(report.text, /задания №7 и 4/u);
  assert.match(report.text, /Данил (?:написал первый пробник|написал первый пробник на)|Первый пробник/u);
  assert.match(report.text, /27 баллов/u);
  assert.doesNotMatch(report.text, /Данил пробное|ВАРИАНТ ПРЕДСКАЗАНИЕ|2 ч 30 мин|срок не наступил|[—–]/u);
});

test('a fresh generation changes wording while keeping the same facts', () => {
  const base = {
    student: { id: 'student-1', name: 'Анна' },
    month: '2026-09',
    lessonEntries: [
      { dayKey: '2026-09-02', topic: { text: 'Системы счисления' }, startMs: 1 },
    ],
  };
  const first = buildStudentMonthlyReport({ ...base, nowMs: Date.parse('2026-09-14T12:00:00.001+03:00') });
  const second = buildStudentMonthlyReport({ ...base, nowMs: Date.parse('2026-09-14T12:00:00.002+03:00') });
  assert.notEqual(first.text, second.text);
  assert.deepEqual(first.metrics, second.metrics);
});

test('lesson task topics merge repeated task numbers from differently worded topics', () => {
  const nowMs = Date.parse('2026-09-16T12:00:00+03:00');
  const report = buildStudentMonthlyReport({
    student: { id: 'roman', name: 'Роман' },
    month: '2026-09',
    nowMs,
    lessonEntries: [
      { dayKey: '2026-09-01', topic: { text: 'Задания №18, 9' }, startMs: nowMs - 4_000 },
      { dayKey: '2026-09-05', topic: { text: 'Задание №18, 11' }, startMs: nowMs - 3_000 },
      { dayKey: '2026-09-10', topic: { text: 'Задание №11' }, startMs: nowMs - 2_000 },
      { dayKey: '2026-09-15', topic: { text: 'Задание №7' }, startMs: nowMs - 1_000 },
    ],
  });

  assert.deepEqual(report.metrics.lessons.topics, ['Задания №18, 9, 11 и 7']);
  assert.match(report.text, /задания №18, 9, 11 и 7/u);
  assert.doesNotMatch(report.text, /№18.*№18|№11.*№11/u);
});

test('very low homework completion is evaluated honestly and calls for finding the cause', () => {
  const report = buildStudentMonthlyReport({
    student: { id: 'student-low', name: 'Иван' },
    month: '2026-09',
    nowMs: Date.parse('2026-09-16T12:00:00+03:00'),
    homeworkEntries: [
      { dueAt: '2026-09-05T18:00:00+03:00', percent: 0 },
      { dueAt: '2026-09-12T18:00:00+03:00', percent: 20 },
    ],
  });

  assert.equal(report.metrics.homework.averagePercent, 10);
  assert.match(report.text, /очень плохо|очень слабый|очень мало/u);
  assert.match(report.text, /причин|почему/u);
});
