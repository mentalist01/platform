import { LearningGroupDomainError } from './learningGroups.js';
import { buildHomeworkStatistics } from '../src/utils/homeworkStats.js';
import { getTaskPresentation } from '../src/utils/taskPresentation.js';
import { isMockAttemptForHomework } from '../src/utils/homeworkComposer.js';

const list = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();
const solved = item => ['clean', 'with-errors', 'completed'].includes(item.state);
const fail = (message, code, statusCode) => { throw new LearningGroupDomainError(message, { code, statusCode }); };

// Reuse the ordinary homework timeline: stable question ids, concurrent group
// assignments, carried targets, cancellations and Python practice stay consistent.
export function groupHomeworkReviewSnapshot({ assignment, data, testsDb, mockExams, taskPresentation, answerRules, nowMs = Date.now(), detail = false }) {
  const reviewQuestion = (question = {}, taskNumber, mock = false) => {
    const count = Number(question.answerCountOverride) || answerRules?.count(question, taskNumber, mock) || list(question.answers).length || 1;
    return { ...question, answerCountOverride: count,
      answers: answerRules?.expected(question, count) || question.answers || Array.from({ length: count }, (_, index) => question[index ? `answer${index + 1}` : 'answer'] ?? '') };
  };
  const homework = list(data.homeworks).find(entry => !entry.learningEgeCarryover
    && entry.learningGroupId === assignment.groupId && entry.learningAssignmentId === assignment.id);
  if (!homework) return { status: 'unavailable', summary: null, items: [] };
  if (homework.learningHomeworkTrackExcluded) return { status: 'excluded', summary: null, items: [] };
  const homeworks = list(data.homeworks).filter(entry => entry.learningGroupId === assignment.groupId && entry.learningAssignmentId === assignment.id);
  const stats = buildHomeworkStatistics({ homeworks, studentData: data, testsDb, mockExams, taskPresentation, nowMs })
    .find(entry => entry.id === homework.id);
  if (!stats) return { status: 'unavailable', summary: null, items: [] };
  const summary = {
    total: stats.totalCount, completed: stats.completedCount, clean: stats.cleanCount,
    corrected: stats.withErrorsCount, wrong: stats.wrongCount, untouched: stats.untouchedCount,
    percent: stats.percent, errors: stats.withErrorsCount + stats.wrongCount,
    checklistTotal: stats.checklist.totalCount, checklistCompleted: stats.checklist.completedCount,
  };
  const result = { status: stats.status, homeworkId: homework.id, summary };
  if (!detail) return result;
  const from = Date.parse(homework.issuedAt) || 0;
  const items = [];
  for (const goal of stats.goals) {
    if (goal.type === 'mock') {
      const exam = list(mockExams).find(exam => exam.id === goal.mockExamId);
      const stored = data.mockAttempts?.[goal.mockExamId];
      const attempt = isMockAttemptForHomework(stored, homework) ? stored : null;
      const sourceGoal = list(homework.goals).find(g => g.mockExamId === goal.mockExamId);
      const keys = list(sourceGoal?.targetTaskKeys).length ? sourceGoal.targetTaskKeys : Object.keys(exam?.tasks || {});
      for (const key of keys) {
        const answers = attempt?.answers?.[key], values = Array.isArray(answers) ? answers : answers != null ? [answers] : [];
        const attempted = values.some(value => text(value));
        const correct = attempt?.solved?.[key] === true;
        items.push({ key: `mock:${goal.mockExamId}:${key}`, sourceType: 'mock', mockExamId: goal.mockExamId,
          mockExamTitle: exam?.title || 'Пробник', taskNumber: Number(key), taskDisplay: getTaskPresentation(key, taskPresentation).displayNumber,
          levelId: 'mock', levelLabel: 'Пробник', questionId: key, questionNumber: key, question: reviewQuestion(exam?.tasks?.[key], Number(key), true),
          solved: correct, attempted, hadErrors: attempted && !correct && Boolean(attempt?.finishedAt || attempt?.timerFinishedAt),
          studentAnswers: values, answerHistory: [], solveDurationMs: attempt?.taskDurationsMs?.[key] || null });
      }
      continue;
    }
    const questions = list(testsDb?.[goal.taskNumber]?.[goal.levelId]);
    for (const target of goal.items) {
      const question = questions.find(q => text(q.id) === target.questionId);
      const history = list(data.solvedByTask?.[goal.taskNumber]?.[goal.levelId]?.answerHistory?.[target.questionId])
        .filter(entry => Date.parse(entry.submittedAt) >= from && Date.parse(entry.submittedAt) <= nowMs)
        .slice().sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
      const last = history.at(-1);
      items.push({ key: target.id, sourceType: 'task', taskNumber: goal.taskNumber,
        taskDisplay: getTaskPresentation(goal.taskNumber, taskPresentation).displayNumber,
        levelId: goal.levelId, levelLabel: goal.label, questionId: target.questionId,
        questionNumber: target.questionNumber, question: reviewQuestion(question, goal.taskNumber), solved: solved(target),
        attempted: history.length > 0, hadErrors: target.wrongCount > 0, state: target.state,
        studentAnswers: list(last?.answers || (last?.answer != null ? [last.answer] : [])), answerHistory: history,
        solveDurationMs: last?.solveDurationMs || null });
    }
  }
  return { ...result, items, checklist: stats.checklist.items, goals: stats.goals.filter(goal => goal.type === 'mock') };
}

export function registerGroupHomeworkReview(app, deps) {
  const base = '/api/learning-groups/:groupId/assignments/:assignmentId/homework-review';
  const context = (req, res) => {
    const group = deps.manageGroup(req, res, req.params.groupId);
    if (!group) return null;
    const assignment = deps.assignment(group.id, req.params.assignmentId);
    if (!assignment) fail('Домашняя работа не найдена', 'assignment_not_found', 404);
    return { group, assignment };
  };
  const snapshot = (req, group, assignment, studentId, detail, shared) => {
    if (assignment.status === 'draft' || !list(assignment.recipientIds).includes(studentId)) return { status: 'not-assigned', summary: null };
    const student = deps.student(studentId);
    if (!student || !deps.canReadStudent(req.auth, student)) return { status: 'unavailable', summary: null };
    const data = deps.studentData(studentId);
    return groupHomeworkReviewSnapshot({ assignment, data: deps.prepareData(data, shared.testsDb), ...shared, detail });
  };
  app.get(base, deps.handle((req, res) => {
    const ctx = context(req, res); if (!ctx) return;
    const { group, assignment } = ctx;
    const shared = deps.shared(group.teacherId);
    const ids = [...new Set([...list(assignment.recipientIds), ...list(group.members)
      .filter(member => member.status === 'active').map(member => member.studentId)])];
    const members = ids.map(studentId => ({ studentId, student: deps.summary(studentId, req.auth),
      ...snapshot(req, group, assignment, studentId, false, shared) }));
    res.json({ assignmentId: assignment.id, members, updatedAt: new Date().toISOString() });
  }));
  app.get(`${base}/:studentId`, deps.handle((req, res) => {
    const ctx = context(req, res); if (!ctx) return;
    const { group, assignment } = ctx, studentId = text(req.params.studentId);
    if (assignment.status === 'draft' || !list(assignment.recipientIds).includes(studentId)) fail('Домашка этому ученику не назначена', 'not_assigned', 403);
    const student = deps.student(studentId);
    if (!student || !deps.canReadStudent(req.auth, student)) fail('Нет доступа к работе ученика', 'student_access_denied', 403);
    res.json({ studentId, student: deps.summary(studentId, req.auth),
      ...snapshot(req, group, assignment, studentId, true, deps.shared(group.teacherId)) });
  }));
}
