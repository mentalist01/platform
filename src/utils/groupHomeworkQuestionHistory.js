import { resolveHomeworkTaskTargetDescriptors } from './homeworkComposer.js';

const text = value => String(value ?? '').trim();
const goalType = goal => goal?.type === 'mock' || (!goal?.type && goal?.mockExamId) ? 'mock' : 'task';
const level = goal => Number(goal?.taskNumber) >= 100 ? 'python' : text(goal?.levelId) || 'basic';

// Group assignment templates are the history source, independently of pupils'
// solutions and current membership. Stored question IDs survive bank reordering.
export function buildGroupHomeworkQuestionHistory({
  assignments = [], groupId = '', goal = null, questions = [], mockTaskKeys = [], excludeAssignmentId = '',
} = {}) {
  const history = new Map();
  if (!text(groupId) || !goal) return history;
  for (const assignment of assignments) {
    if (text(assignment?.groupId) !== text(groupId) || assignment.deletedAt
      || (excludeAssignmentId && text(assignment.id) === text(excludeAssignmentId))
      || !['assigned', 'closed'].includes(assignment.acceptanceStatus || assignment.status)) continue;
    const template = assignment.homework || assignment.homeworkTemplate;
    const seen = new Set();
    for (const previous of Array.isArray(template?.goals) ? template.goals : []) {
      if (goalType(previous) !== goalType(goal)) continue;
      let keys;
      if (goalType(goal) === 'mock') {
        if (!text(goal.mockExamId) || text(previous.mockExamId) !== text(goal.mockExamId)) continue;
        const targets = Array.isArray(previous.targetTaskKeys) ? previous.targetTaskKeys.map(text).filter(Boolean) : [];
        keys = (targets.length ? targets : mockTaskKeys).map(text);
      } else {
        if (Number(previous.taskNumber) !== Number(goal.taskNumber) || level(previous) !== level(goal)) continue;
        keys = resolveHomeworkTaskTargetDescriptors(previous, questions).map(item => String(item.questionNumber));
      }
      for (const key of keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = {
          assignmentId: assignment.id,
          title: text(assignment.title),
          assignedAt: text(assignment.publishedAt || assignment.createdAt),
          recipientMode: assignment.recipientMode === 'selected' ? 'selected' : 'all',
        };
        history.set(key, [...(history.get(key) || []), entry]);
      }
    }
  }
  return history;
}

export function describeGroupHomeworkQuestionHistory(entries = []) {
  if (!entries.length) return '';
  const allGroup = entries.some(entry => entry.recipientMode === 'all');
  const latest = [...entries].sort((a, b) => (Date.parse(b.assignedAt) || 0) - (Date.parse(a.assignedAt) || 0))[0];
  const date = new Date(latest.assignedAt);
  const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', year: 'numeric',
  });
  return [allGroup ? 'Уже задавалось этой группе' : 'Уже задавалось отдельным участникам этой группы',
    dateLabel && `Последний раз: ${dateLabel}`, latest.title].filter(Boolean).join(' · ');
}
