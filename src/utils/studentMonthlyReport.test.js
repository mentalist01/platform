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
  assert.deepEqual(report.metrics.lessons.topics, ['Системы счисления', 'Python']);
  assert.equal(report.metrics.homework.assignedCount, 3);
  assert.equal(report.metrics.homework.completedCount, 1);
  assert.equal(report.metrics.homework.onTimeCount, 1);
  assert.equal(report.metrics.homework.incompleteCount, 1);
  assert.equal(report.metrics.homework.upcomingCount, 1);
  assert.deepEqual(report.metrics.homework.incompleteLabels, ['Задание 19']);
  assert.equal(report.metrics.mocks.latestScore, 43);
  assert.equal(report.metrics.mocks.previousScore, 27);
  assert.equal(report.metrics.mocks.deltaFromPrevious, 16);
  assert.match(report.text, /Выполнено в срок: 1 из 3/);
  assert.match(report.text, /Сентябрьский пробник: 43 балла/);
  assert.match(report.text, /\+16 баллов/);
});

test('monthly report handles an empty month without inventing results', () => {
  const report = buildStudentMonthlyReport({
    student: { id: 'student-1', name: 'Анна' },
    month: '2026-07',
    nowMs: Date.parse('2026-09-20T12:00:00+03:00'),
  });
  assert.equal(report.metrics.homework.assignedCount, 0);
  assert.equal(report.metrics.mocks.latestScore, null);
  assert.match(report.text, /недостаточно данных/);
  assert.doesNotMatch(report.text, /undefined|null/);
});

test('report month validation rejects malformed values', () => {
  assert.equal(normalizeStudentReportMonth('2026-09'), '2026-09');
  assert.equal(normalizeStudentReportMonth('2026-13'), '');
  assert.equal(normalizeStudentReportMonth('september'), '');
});

test('automatic conclusion does not treat homework with a future deadline as overdue', () => {
  const report = buildStudentMonthlyReport({
    student: { name: 'Анна' },
    month: '2026-09',
    nowMs: Date.parse('2026-09-10T12:00:00+03:00'),
    homeworkEntries: [
      { dueAt: '2026-09-25T18:00:00+03:00', percent: 0, goals: [] },
    ],
  });
  assert.match(report.automaticConclusion, /сроки их выполнения пока не наступили/);
  assert.doesNotMatch(report.automaticConclusion, /зона роста/i);
});
