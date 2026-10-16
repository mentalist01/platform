import test from 'node:test';
import assert from 'node:assert/strict';
import { isAssignedMockAttempt } from './mockExamAssignment.js';
import { buildMockExamProgressEntries } from './mockExamProgress.js';

const finished = { mode: 'timer', timerStartedAt: '2026-10-12T10:00:00Z', timerFinishedAt: '2026-10-12T11:00:00Z', finishedAt: '2026-10-12T11:00:00Z', solved: { 1: true }, answers: { 1: '1' } };
const exam = { id: 'exam', tasks: { 1: {} }, monthlyAssignments: { own: ['2026-10'], other: ['2026-09'] }, monthlyPublicationDays: { own: { '2026-10': 10 } } };
test('legacy monthly evidence belongs to the right teacher, month and publication date', () => {
  assert.equal(isAssignedMockAttempt({ exam, attempt: finished, teacherId: 'own' }), true);
  assert.equal(isAssignedMockAttempt({ exam, attempt: finished, teacherId: 'other' }), false);
  assert.equal(isAssignedMockAttempt({ exam, attempt: { ...finished, timerStartedAt: '2026-10-09T10:00:00Z' }, teacherId: 'own' }), false);
  assert.equal(isAssignedMockAttempt({ exam: { ...exam, monthlyAssignedMonths: ['2026-10'], monthlyPublicationDay: 10 }, attempt: finished }), true);
});
test('teacher homework counts only when assigned before the attempt; stored provenance survives later removal', () => {
  const studentData = { homeworks: [{ id: 'hw', issuedAt: '2026-10-11', goals: [{ type: 'mock', mockExamId: 'exam' }] }] };
  assert.equal(isAssignedMockAttempt({ examId: 'exam', attempt: finished, studentData }), true);
  studentData.homeworks[0].issuedAt = '2026-10-13';
  assert.equal(isAssignedMockAttempt({ examId: 'exam', attempt: finished, studentData }), false);
  assert.equal(isAssignedMockAttempt({ attempt: { ...finished, homeworkId: 'removed-hw' } }), true);
  assert.equal(isAssignedMockAttempt({ attempt: { ...finished, assignmentSource: 'monthly' } }), true);
  assert.equal(isAssignedMockAttempt({ examId: 'exam', attempt: { ...finished, assignmentSource: 'self' }, studentData }), false);
});
test('historical monthly assignment survives a later change to the exam catalogue', () => {
  assert.equal(isAssignedMockAttempt({
    exam: { id: 'exam', monthlyAssignments: {} },
    attempt: { ...finished, examSnapshot: exam },
    teacherId: 'own',
  }), true);
  assert.equal(isAssignedMockAttempt({
    exam: { id: 'exam', monthlyAssignments: {} },
    attempt: { ...finished, examSnapshot: exam },
    teacherId: 'other',
  }), false);
  // The server sends this decision with answer-free student snapshots.
  assert.equal(isAssignedMockAttempt({ attempt: { ...finished, assignedForStatistics: true } }), true);
  assert.equal(isAssignedMockAttempt({ exam, attempt: { ...finished, assignedForStatistics: false }, teacherId: 'own' }), false);
});
test('aggregate statistics exclude self attempts without mutating history, but retain assigned zeroes and manual scores', () => {
  const studentData = { mocks: [{ id: 'manual', score: 50, date: '2026-10-13' }], mockAttemptResults: [
    { ...finished, examId: 'self', attemptId: 'self-1', tasks: { 1: {} }, secondaryScore: 100 },
    { ...finished, examId: 'assigned', attemptId: 'hw-1', tasks: { 1: {} }, solved: { 1: false }, homeworkId: 'hw' },
  ] };
  const before = structuredClone(studentData);
  const entries = buildMockExamProgressEntries({ assignedOnly: true, studentData });
  assert.deepEqual(entries.map(entry => entry.score), [0, 50]);
  assert.deepEqual(studentData, before);
});
