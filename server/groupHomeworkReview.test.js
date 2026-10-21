import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHomeworkReviewSnapshot } from './groupHomeworkReview.js';

const assignment = { id: 'assignment', groupId: 'group' };
const issuedAt = '2026-10-01T12:00:00Z', nowMs = Date.parse('2026-10-21T12:00:00Z');
const homework = { id: 'homework', source: 'learning-group', issuedAt, dueAt: '2026-10-31T12:00:00Z',
  learningGroupId: 'group', learningAssignmentId: 'assignment', goals: [{ type: 'task', taskNumber: 23, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['one'] }] };
const testsDb = { 23: { basic: [{ id: 'one', answer: '17' }] } };

test('review keeps teacher display numbering and shows no invented progress for missing/excluded homework', () => {
  const snapshot = groupHomeworkReviewSnapshot({ assignment, data: { homeworks: [homework] }, testsDb,
    taskPresentation: { 23: { displayNumber: '13' } }, nowMs, detail: true });
  assert.equal(snapshot.items[0].taskNumber, 23); assert.equal(snapshot.items[0].taskDisplay, '13');
  assert.equal(snapshot.summary.untouched, 1);
  assert.equal(groupHomeworkReviewSnapshot({ assignment, data: {}, testsDb, nowMs }).status, 'unavailable');
  assert.equal(groupHomeworkReviewSnapshot({ assignment, data: { homeworks: [{ ...homework, learningHomeworkTrackExcluded: true }] }, testsDb, nowMs }).status, 'excluded');
});

test('checklist-only homework retains each independently completed action', () => {
  const h = { ...homework, goals: [], checklistItems: [{ id: 'a', text: 'Посмотреть урок', completedAt: '2026-10-20T12:00:00Z' }, { id: 'b', text: 'Прочитать заметки' }] };
  const result = groupHomeworkReviewSnapshot({ assignment, data: { homeworks: [h] }, testsDb, nowMs, detail: true });
  assert.equal(result.summary.total, 2); assert.equal(result.summary.completed, 1);
  assert.equal(result.items.length, 0); assert.equal(result.checklist.length, 2);
});

test('mock review includes only the assigned attempt and targets', () => {
  const h = { ...homework, goals: [{ type: 'mock', mockExamId: 'mock', targetTaskKeys: ['1', '2'] }] };
  const attempt = { homeworkId: 'homework', finishedAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z', solved: { 1: true }, answers: { 1: ['17'], 2: ['8'] } };
  const result = groupHomeworkReviewSnapshot({ assignment, data: { homeworks: [h], mockAttempts: { mock: attempt } }, testsDb,
    mockExams: [{ id: 'mock', title: 'Пробник', tasks: { 1: { answer: '17' }, 2: { answer: '9' }, 3: { answer: '5' } } }], nowMs, detail: true });
  assert.equal(result.items.length, 2); assert.equal(result.items[0].solved, true); assert.equal(result.items[1].hadErrors, true);
  const foreign = groupHomeworkReviewSnapshot({ assignment, data: { homeworks: [h], mockAttempts: { mock: { ...attempt, homeworkId: 'another' } } },
    testsDb, mockExams: [{ id: 'mock', tasks: { 1: {} } }], nowMs, detail: true });
  assert.equal(foreign.items[0].attempted, false);
});
