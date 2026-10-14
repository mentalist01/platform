import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupHomeworkQuestionHistory, describeGroupHomeworkQuestionHistory } from './groupHomeworkQuestionHistory.js';

const questions = [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'new' }];
const goal = { type: 'task', taskNumber: 7, levelId: 'basic' };
const assignment = (id, targets, extra = {}) => ({
  id, groupId: 'group-2', status: 'assigned', recipientMode: 'all',
  publishedAt: '2026-10-08T08:00:00.000Z', title: 'Домашка ЕГЭ',
  homework: { goals: [{ ...goal, targetQuestions: targets }] }, ...extra,
});
const build = (assignments, extra = {}) => buildGroupHomeworkQuestionHistory({ assignments, groupId: 'group-2', goal, questions, ...extra });

test('counts current and closed group homework, with no deadlines or solutions filter', () => {
  const result = build([assignment('active', [1]), assignment('closed', [3], { status: 'closed' })]);
  assert.deepEqual([...result.keys()], ['1', '3']);
  assert.equal(result.get('1')[0].assignmentId, 'active');
});
test('does not mix another group, deleted work, drafts or the assignment being edited', () => {
  const result = build([assignment('other', [1], { groupId: 'group-3' }),
    assignment('draft', [2], { status: 'draft' }), assignment('deleted', [3], { deletedAt: '2026-10-10' }),
    assignment('editing', [4])], { excludeAssignmentId: 'editing' });
  assert.equal(result.size, 0);
  assert.equal(build([assignment('a', [1])], { groupId: '' }).size, 0);
});
test('question IDs follow reordered questions without marking replacements for removed IDs', () => {
  const result = build([assignment('old', [1, 2], {
    homework: { goals: [{ ...goal, targetQuestions: [1, 2], targetQuestionIds: ['a', 'removed'] }] },
  })]);
  assert.deepEqual([...result.keys()], ['2']);
});
test('includeAll respects its ID snapshot and handles legacy number-only homework', () => {
  const snapshot = build([assignment('all', [], { homework: { goals: [{ ...goal, includeAll: true, targetQuestionIds: ['a', 'b', 'c'] }] } })]);
  assert.deepEqual([...snapshot.keys()], ['1', '2', '3']);
  assert.deepEqual([...build([assignment('legacy', [], { homework: { goals: [{ ...goal, includeAll: true }] } })]).keys()], ['1', '2', '3', '4']);
});
test('keeps task and level histories separate, including Python', () => {
  const result = build([assignment('wrong', [1], { homework: { goals: [
    { ...goal, levelId: 'advanced', targetQuestions: [1] },
    { ...goal, taskNumber: 8, targetQuestions: [2] },
    { ...goal, taskNumber: 107, levelId: 'basic', targetQuestions: [3] },
  ] } })]);
  assert.equal(result.size, 0);
  const python = build([assignment('python', [], { homework: { goals: [{ type: 'task', taskNumber: 107, levelId: 'basic', targetQuestions: [3] }] } })], { goal: { type: 'task', taskNumber: 107, levelId: 'python' } });
  assert.deepEqual([...python.keys()], ['3']);
});
test('combines repeat assignments only once per assignment and describes subset recipients', () => {
  const selected = assignment('subset', [1], { recipientMode: 'selected', homework: { goals: [
    { ...goal, targetQuestions: [1] }, { ...goal, targetQuestions: [1] },
  ] } });
  const result = build([selected, assignment('all', [1], { publishedAt: '2026-10-12T08:00:00Z' })]);
  assert.equal(result.get('1').length, 2);
  assert.match(describeGroupHomeworkQuestionHistory([result.get('1')[0]]), /отдельным участникам/);
  assert.match(describeGroupHomeworkQuestionHistory(result.get('1')), /Уже задавалось этой группе.*12 окт/);
});
test('mock exam history matches the exact exam and supports selected and entire mocks', () => {
  const mock = { type: 'mock', mockExamId: 'october' };
  const records = [assignment('mock', [], { homework: { goals: [
    { ...mock, targetTaskKeys: ['7', '8'] }, { ...mock, mockExamId: 'september', targetTaskKeys: ['1'] },
  ] } })];
  assert.deepEqual([...build(records, { goal: mock, mockTaskKeys: ['1', '7', '8'] }).keys()], ['7', '8']);
  records.push(assignment('whole', [], { homework: { goals: [mock] } }));
  assert.equal(build(records, { goal: mock, mockTaskKeys: ['1', '7', '8'] }).size, 3);
});
