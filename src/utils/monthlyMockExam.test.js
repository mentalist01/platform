import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyMockStatus, collectMonthlyMockCompletions, getMonthlyMockMonth, getMonthlyMockPeriod, normalizeMonthlyMockExemptions, prepareMonthlyMockHomeworkGoals } from './monthlyMockExam.js';

const period = getMonthlyMockPeriod('2026-09');
const now = Date.parse('2026-09-07T15:00:00Z');
const exams = [{ id: 'exam', title: 'Сентябрьский пробник', tasks: { 1: {}, 2: {} } }];
const status = (data, month = period) => buildMonthlyMockStatus(data, exams, month, now);
const finished = { attemptId: 'first', status: 'finished', finishedAt: '2026-09-03T12:00:00Z', solved: { 1: false, 2: false } };

test('Moscow calendar boundaries, December rollover and invalid input', () => {
  assert.equal(getMonthlyMockMonth('2026-08-31T21:00:00Z'), '2026-09');
  assert.equal(period.startMs, Date.parse('2026-08-31T21:00:00Z'));
  assert.equal(getMonthlyMockPeriod('2026-12').endMs, Date.parse('2026-12-31T21:00:00Z'));
  for (const value of ['2026-13', '2026-9', '', 'oops']) assert.equal(getMonthlyMockPeriod(value), null);
});
test('September completion counts independently of score and without a migration', () => {
  assert.equal(status({ mockAttempts: { exam: finished } }).status, 'completed');
  assert.equal(status({ mockAttempts: { exam: { ...finished, finishedAt: '2026-08-31T20:59:59Z' } } }).status, 'pending');
  assert.equal(status({ mockAttempts: { exam: { ...finished, finishedAt: '2026-08-31T21:00:00Z' } } }).status, 'completed');
});
test('opening, answering and zero-score explicit completion are different states', () => {
  assert.equal(status({}).status, 'pending');
  assert.equal(status({ mockAttempts: { exam: { status: 'active', updatedAt: '2026-09-03', answers: {} } } }).status, 'pending');
  assert.equal(status({ mockAttempts: { exam: { status: 'active', updatedAt: '2026-09-03', answers: { 1: 'wrong', 2: 'wrong' } } } }).status, 'in_progress');
  assert.equal(status({ mockAttempts: { exam: { ...finished, answers: {} } } }).status, 'completed');
});
test('history survives deletion and restart; duplicated snapshots count once', () => {
  const data = {
    mockAttempts: { exam: finished },
    mockAttemptResults: [{ ...finished, examId: 'exam', examTitle: 'Старый вариант', tasks: exams[0].tasks }],
  };
  assert.equal(status(data).completedCount, 1);
  const ledger = collectMonthlyMockCompletions(data, exams);
  assert.equal(buildMonthlyMockStatus({ monthlyMockCompletions: ledger }, [], period, now).status, 'completed');
  assert.equal(status({ monthlyMockCompletions: ledger, mockAttempts: { exam: { status: 'active' } } }).status, 'completed');
});
test('repeated attempt counts; a partial homework from a mock does not', () => {
  assert.equal(status({ mockAttempts: { exam: { ...finished, attemptNumber: 2 } } }).status, 'completed');
  assert.equal(status({ mockAttempts: { exam: { ...finished, targetTaskKeys: ['1'] } } }).status, 'pending');
  assert.equal(status({ mockAttemptResults: [{ ...finished, examId: 'exam', tasks: exams[0].tasks, targetTaskKeys: ['1'] }] }).status, 'pending');
});
test('old timed, old untimed, teacher-entered and future records', () => {
  assert.equal(status({ mockAttempts: { exam: { mode: 'timer', timerFinishedAt: finished.finishedAt } } }).status, 'completed');
  assert.equal(status({ mockAttempts: { exam: { updatedAt: finished.finishedAt, answers: { 1: 'x', 2: 'y' } } } }).status, 'completed');
  assert.equal(status({ mockAttempts: { exam: { updatedAt: finished.finishedAt, answers: { 1: 'x' } } } }).status, 'in_progress');
  assert.equal(status({ mocks: [{ date: '2026-09-02', score: 0 }] }).status, 'completed');
  assert.equal(status({ mocks: [{ date: '2026-09-02', score: '' }] }).status, 'pending');
  assert.equal(status({ mockAttempts: { exam: { ...finished, finishedAt: '2026-09-20' } } }).status, 'pending');
});
test('old completion edits never turn into a new month completion', () => {
  assert.equal(status({ mockAttempts: { exam: { ...finished, finishedAt: '2026-08-02', updatedAt: '2026-09-03' } } }).status, 'pending');
});

test('a monthly exemption removes an unfinished student from the required list', () => {
  const exemption = { '2026-09': '2026-09-02T12:00:00Z', invalid: '2026-09-02T12:00:00Z' };
  assert.deepEqual(normalizeMonthlyMockExemptions(exemption), { '2026-09': '2026-09-02T12:00:00.000Z' });
  assert.equal(status({ monthlyMockExemptions: exemption }).status, 'exempt');
  assert.equal(status({ monthlyMockExemptions: exemption, mockAttempts: { exam: finished } }).status, 'completed');
  assert.equal(buildMonthlyMockStatus({ monthlyMockExemptions: exemption }, exams, getMonthlyMockPeriod('2026-08'), now).status, 'pending');
});

test('manual result for today counts before noon and invalid dates are ignored', () => {
  assert.equal(buildMonthlyMockStatus({ mocks: [{ date: '2026-09-07', score: 0 }] }, exams, period, Date.parse('2026-09-07T01:00:00Z')).status, 'completed');
  assert.deepEqual(collectMonthlyMockCompletions({ mocks: [{ date: '2026-02-30', score: 50 }] }), []);
});
test('monthly assignment preserves draft goals and reuses an existing mock goal', () => {
  const task = { type: 'task', taskNumber: 4, targetQuestions: [1, 2] };
  const mock = { type: 'mock', mockExamId: 'exam' };
  assert.deepEqual(prepareMonthlyMockHomeworkGoals([task], { type: 'mock' }), [{ type: 'mock' }, task]);
  assert.deepEqual(prepareMonthlyMockHomeworkGoals([task, mock], { type: 'mock' }), [mock, task]);
});
