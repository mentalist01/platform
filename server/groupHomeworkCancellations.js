import crypto from 'node:crypto';
import { LearningGroupDomainError } from './learningGroups.js';
import { resolveHomeworkTaskTargetDescriptors } from '../src/utils/homeworkComposer.js';
import { groupEgeCancellationsForAssignment, isCancelledGroupEgeTarget } from '../src/utils/groupHomeworkCancellations.js';

const list = value => Array.isArray(value) ? value : [];
const text = value => String(value || '').trim();
const fail = (message, code, statusCode = 400) => { throw new LearningGroupDomainError(message, { code, statusCode }); };
const issue = assignment => Date.parse(assignment.publishedAt || assignment.createdAt);

export const normalizeGroupHomeworkCancellations = records => list(records).filter(record => (
  record && text(record.id) && text(record.groupId) && text(record.teacherId)
  && text(record.assignmentId) && Number(record.taskNumber) > 0 && Number(record.taskNumber) < 100
  && text(record.levelId) && list(record.targetQuestionIds).length && list(record.sourceAssignmentIds).length
));

export function buildGroupHomeworkCancellationCatalog({ group, assignment, studentData, testsDb, records }) {
  const rows = new Map();
  const add = (goal, originId) => {
    if (goal?.type === 'mock' || goal?.mockExamId || !(Number(goal?.taskNumber) > 0 && Number(goal.taskNumber) < 100)) return;
    const taskNumber = Number(goal.taskNumber), levelId = goal.levelId || 'basic', key = `${taskNumber}|${levelId}`;
    if (!rows.has(key)) rows.set(key, { taskNumber, levelId, questions: new Map() });
    const row = rows.get(key), cancellations = groupEgeCancellationsForAssignment(records, group.id, originId);
    for (const target of resolveHomeworkTaskTargetDescriptors(goal, testsDb?.[taskNumber]?.[levelId] || [])) {
      if (!target.questionId) continue;
      const cancelled = isCancelledGroupEgeTarget(cancellations, taskNumber, levelId, target.questionId);
      const previous = row.questions.get(target.questionId);
      row.questions.set(target.questionId, { id: target.questionId, number: target.questionNumber,
        cancelled: previous ? previous.cancelled && cancelled : cancelled });
    }
  };
  list(assignment.homework?.goals).forEach(goal => add(goal, assignment.id));
  for (const data of list(studentData)) {
    const parent = list(data?.homeworks).find(entry => !entry.learningEgeCarryover && entry.learningAssignmentId === assignment.id);
    for (const snapshot of list(parent?.egeCarryoverSnapshot)) {
      const source = list(data.homeworks).find(entry => entry.id === snapshot.sourceHomeworkId);
      if (!source || source.learningGroupId !== group.id || source.learningHomeworkCancelledAt || source.learningMembershipEndedAt) continue;
      list(snapshot.goals).forEach(goal => add(goal, source.learningAssignmentId));
    }
  }
  return { tasks: [...rows.values()].map(row => ({ ...row, questions: [...row.questions.values()].sort((a, b) => a.number - b.number) }))
    .sort((a, b) => a.taskNumber - b.taskNumber || a.levelId.localeCompare(b.levelId)),
    cancellations: list(records).filter(record => record.groupId === group.id && record.assignmentId === assignment.id && !record.revokedAt)
      .map(record => ({ id: record.id, taskNumber: record.taskNumber, levelId: record.levelId,
        targetQuestions: record.targetQuestions, createdAt: record.createdAt })) };
}

export function registerGroupHomeworkCancellations(app, deps) {
  const base = '/api/learning-groups/:groupId/assignments/:assignmentId/ege-cancellations';
  const context = (req, res) => {
    const group = deps.manageGroup(req, res, req.params.groupId);
    if (!group) return null;
    const assignment = deps.assignments().find(entry => entry.id === req.params.assignmentId
      && entry.groupId === group.id && !entry.deletedAt);
    if (!assignment) fail('Домашняя работа не найдена', 'assignment_not_found', 404);
    if (assignment.status === 'draft' || assignment.homework?.studyTrack === 'python') fail('Выберите выданную домашку ЕГЭ', 'ege_assignment_required');
    const recipients = list(assignment.recipientIds);
    recipients.forEach(deps.syncStudent);
    const records = deps.read();
    return { group, assignment, records, catalog: buildGroupHomeworkCancellationCatalog({ group, assignment,
      records, studentData: recipients.map(deps.studentData), testsDb: deps.testsDb(group.teacherId) }) };
  };
  const refresh = group => {
    const ids = new Set(deps.assignments().filter(entry => entry.groupId === group.id).flatMap(entry => list(entry.recipientIds)));
    for (const id of ids) { deps.syncStudent(id); deps.notify(group, id); }
  };
  app.get(base, deps.handle((req, res) => {
    const value = context(req, res); if (value) res.json(value.catalog);
  }));
  app.post(base, deps.handle((req, res) => {
    const value = context(req, res); if (!value) return;
    const { group, assignment, records, catalog } = value;
    if (group.status === 'completed') fail('Завершённую группу нельзя изменять', 'group_completed', 409);
    const taskNumber = Number(req.body?.taskNumber), levelId = text(req.body?.levelId) || 'basic';
    const tasks = catalog.tasks.filter(row => row.taskNumber === taskNumber && (req.body?.all === true || row.levelId === levelId));
    if (!tasks.length) fail('Задание не найдено в этой домашке', 'homework_task_not_found');
    const selections = tasks.map(task => ({ task, selected: req.body?.all === true
      ? task.questions.filter(question => !question.cancelled).map(question => question.id)
      : [...new Set(list(req.body?.targetQuestionIds).map(text))] })).filter(value => value.selected.length);
    if (!selections.length || selections.some(({task,selected})=>selected.length > 5000
      || selected.some(id=>!task.questions.some(question=>question.id===id&&!question.cancelled)))) {
      fail('Выберите действующие номера этой домашки', 'invalid_homework_targets');
    }
    const sources = deps.assignments().filter(entry => entry.groupId === group.id && !entry.deletedAt && entry.status !== 'draft'
      && entry.homework?.studyTrack !== 'python' && (entry.id === assignment.id || issue(entry) <= issue(assignment))).map(entry => entry.id);
    const actionId=crypto.randomUUID(), createdAt=new Date().toISOString();
    const additions=selections.map(({task,selected})=>({ id: crypto.randomUUID(), actionId,
      groupId: group.id, teacherId: group.teacherId, assignmentId: assignment.id,
      sourceAssignmentIds: sources, taskNumber, levelId:task.levelId, targetQuestionIds: selected,
      targetQuestions: selected.map(id => task.questions.find(question => question.id === id).number).sort((a, b) => a - b),
      createdAt, createdById: req.auth.id }));
    deps.write([...additions, ...records]);
    refresh(group);
    res.status(201).json({ ok: true, cancellation: { id: additions[0].id } });
  }));
  app.delete(base + '/:cancellationId', deps.handle((req, res) => {
    const value = context(req, res); if (!value) return;
    const { group, assignment, records } = value;
    if (group.status === 'completed') fail('Завершённую группу нельзя изменять', 'group_completed', 409);
    const record = records.find(entry => entry.id === req.params.cancellationId && entry.groupId === group.id
      && entry.assignmentId === assignment.id && entry.teacherId === group.teacherId);
    if (!record) fail('Отмена не найдена', 'cancellation_not_found', 404);
    if (!record.revokedAt) {
      deps.write(records.map(entry => entry.groupId === group.id && entry.assignmentId === assignment.id
        && (entry === record || (record.actionId && entry.actionId === record.actionId))
        ? { ...entry, revokedAt: new Date().toISOString(), revokedById: req.auth.id } : entry));
      refresh(group);
    }
    res.json({ ok: true });
  }));
}
