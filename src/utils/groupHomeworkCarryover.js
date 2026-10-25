import { getHomeworkGoalAssignmentTier } from './homeworkAssignmentTier.js';
import { filterCancelledGroupEgeGoals } from './groupHomeworkCancellations.js';

const list = value => Array.isArray(value) ? value : [];
const key = entry => `${entry.learningGroupId}|${entry.learningAssignmentId}`;
const taskKey = goal => `${Number(goal.taskNumber)}|${goal.levelId || 'basic'}|${getHomeworkGoalAssignmentTier(goal)}`;
const isTask = goal => goal?.type !== 'prepared' && goal?.type !== 'mock' && !goal?.mockExamId;

const mergeTargets = (current, extra) => {
  const targets = new Map();
  for (const goal of [current, extra]) {
    const ids = list(goal.targetQuestionIds);
    list(goal.targetQuestions).forEach((number, index) => {
      const id = String(ids[index] || '').trim();
      const targetKey = id ? `id:${id}` : `number:${Number(number)}`;
      if (!targets.has(targetKey)) targets.set(targetKey, { number: Number(number), id });
    });
  }
  const sorted = [...targets.values()].sort((a, b) => a.number - b.number);
  return { ...current, targetQuestions: sorted.map(target => target.number),
    targetQuestionIds: sorted.map(target => target.id) };
};

// Storage retains provenance for deadline/lives checks. Every visible surface
// presents the pupil's old and new targets as one ordinary homework instead.
export function mergeGroupHomeworkCarryover(entries = []) {
  entries = list(entries).map(entry => {
    if (!entry?.learningEgeCancellations?.length) return entry;
    const goals = filterCancelledGroupEgeGoals(entry), primary = goals.find(isTask);
    return { ...entry, goals, taskNumber: primary?.taskNumber ?? null, levelId: primary?.levelId ?? null,
      targetQuestions: primary?.targetQuestions || [], targetQuestionIds: primary?.targetQuestionIds || [],
      includeAll: Boolean(primary?.includeAll) };
  });
  const parents = new Map(list(entries).filter(entry => entry?.source === 'learning-group'
    && !entry.learningEgeCarryover).map(entry => [key(entry), entry]));
  const merged = new Map();
  const folded = new Set();
  for (const child of list(entries)) {
    if (!child?.learningEgeCarryover) continue;
    const parent = parents.get(key(child));
    if (!parent) continue;
    folded.add(child);
    if (child.learningHomeworkCancelledAt || child.learningMembershipEndedAt
      || parent.learningHomeworkCancelledAt || parent.learningMembershipEndedAt
      || parent.studyTrack === 'python') continue;
    const current = merged.get(parent) || { ...parent, goals: [...list(parent.goals)] };
    for (const goal of list(child.goals)) {
      if (!isTask(goal) || Number(goal.taskNumber) >= 100) continue;
      const index = current.goals.findIndex(candidate => isTask(candidate) && taskKey(candidate) === taskKey(goal));
      if (index < 0) current.goals.push({ ...goal });
      else current.goals[index] = mergeTargets(current.goals[index], goal);
    }
    merged.set(parent, current);
  }
  return list(entries).filter(entry => !folded.has(entry)).map(entry => merged.get(entry) || entry);
}
