import { buildHomeworkCarryoverDraft, resolveHomeworkTaskTargetDescriptors } from '../src/utils/homeworkComposer.js';
import { isOptionalHomeworkGoal } from '../src/utils/homeworkAssignmentTier.js';

const list = value => Array.isArray(value) ? value : [];
const isEgeGoal = goal => goal?.type !== 'mock' && !goal?.mockExamId
  && Number(goal?.taskNumber) > 0 && Number(goal.taskNumber) < 100;
const questionsFor = (goal, testsDb) => list(testsDb?.[String(goal.taskNumber)]?.[goal.levelId || 'basic']);
const targetKey = (goal, target) => `${goal.taskNumber}|${goal.levelId || 'basic'}|${target.questionId || `number:${target.questionNumber}`}`;
const eligible = entry => entry?.source === 'learning-group' && !entry.learningEgeCarryover
  && !entry.learningHomeworkCancelledAt && !entry.learningMembershipEndedAt
  && entry.studyTrack !== 'python';

// Snapshot each pupil's unfinished required EGE targets at publication, rather
// than changing the shared template or the old deadline/lives ledger.
export function projectGroupEgeCarryover(homeworks, studentData, testsDb) {
  const originals = list(homeworks).filter(entry => !entry.learningEgeCarryover)
    .map(entry => { const copy = { ...entry }; delete copy.learningCarryoverSupersededBy; return copy; });
  const parents = originals.filter(entry => eligible(entry) && entry.carryoverEge === true)
    .sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt));
  for (const parent of parents) {
    if (Array.isArray(parent.egeCarryoverSnapshot)) continue;
    const seen = new Set();
    for (const goal of list(parent.goals).filter(isEgeGoal)) {
      for (const target of resolveHomeworkTaskTargetDescriptors(goal, questionsFor(goal, testsDb))) seen.add(targetKey(goal, target));
    }
    const sources = originals.filter(entry => eligible(entry) && entry.id !== parent.id
      && entry.learningGroupId === parent.learningGroupId && Date.parse(entry.issuedAt) < Date.parse(parent.issuedAt))
      .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
    parent.egeCarryoverSnapshot = sources.flatMap(source => {
      const requiredSource = { ...source, goals: list(source.goals).filter(isEgeGoal) };
      if (!requiredSource.goals.length) return [];
      const pending = buildHomeworkCarryoverDraft({ homework: requiredSource, studentData, testsDb }).goals;
      const goals = pending.flatMap(goal => {
        const targets = resolveHomeworkTaskTargetDescriptors(goal, questionsFor(goal, testsDb))
          .filter(target => !seen.has(targetKey(goal, target)));
        targets.forEach(target => seen.add(targetKey(goal, target)));
        return targets.length ? [{ type: 'task', assignmentTier: 'required', taskNumber: Number(goal.taskNumber),
          levelId: goal.levelId, includeAll: false, targetQuestions: targets.map(target => target.questionNumber),
          targetQuestionIds: targets.map(target => target.questionId) }] : [];
      });
      // A later explicit repeat owns a question even if it is already complete.
      for (const goal of requiredSource.goals) {
        for (const target of resolveHomeworkTaskTargetDescriptors(goal, questionsFor(goal, testsDb))) seen.add(targetKey(goal, target));
      }
      return goals.length ? [{ sourceHomeworkId: source.id, sourceIssuedAt: source.issuedAt,
        sourceTitle: source.learningAssignmentTitle || source.title || 'Домашняя работа · ЕГЭ', goals }] : [];
    });
  }
  const latestParent = new Map(parents.map(parent => [parent.learningGroupId, parent]));
  const supplements = [];
  for (const parent of parents) {
    // New EGE work replaces earlier EGE cards even when an explicit new
    // target already covers the entire remainder or the old work is complete.
    for (const source of originals) {
      if (eligible(source) && source.learningGroupId === parent.learningGroupId
        && Date.parse(source.issuedAt) < Date.parse(parent.issuedAt)
        && list(source.goals).some(goal => isEgeGoal(goal) && !isOptionalHomeworkGoal(goal))) {
        source.learningCarryoverSupersededBy = parent.id;
      }
    }
    for (const snapshot of parent.egeCarryoverSnapshot) {
      const source = originals.find(entry => entry.id === snapshot.sourceHomeworkId);
      // A withdrawn assignment or a pupil's transfer must not revive old work.
      if (!source || !eligible(source) || source.learningGroupId !== parent.learningGroupId) continue;
      source.learningCarryoverSupersededBy = parent.id;
      supplements.push({
        id: `${parent.id}--ege-${source.id}`,
        source: 'learning-group', learningEgeCarryover: true,
        learningGroupId: parent.learningGroupId, learningGroupName: parent.learningGroupName,
        learningAssignmentId: parent.learningAssignmentId,
        learningAssignmentTitle: 'Доделать прошлую домашку · ЕГЭ',
        learningAssignmentStatus: parent.learningAssignmentStatus,
        learningAssignmentUpdatedAt: parent.learningAssignmentUpdatedAt,
        learningHomeworkCancelledAt: parent.learningHomeworkCancelledAt || '',
        learningMembershipEndedAt: parent.learningMembershipEndedAt || '',
        learningCarryoverSupersededBy: latestParent.get(parent.learningGroupId)?.id !== parent.id
          ? latestParent.get(parent.learningGroupId).id : '',
        teacherId: parent.teacherId, studyTrack: 'ege',
        issuedAt: parent.issuedAt, updatedAt: parent.updatedAt,
        dueAt: parent.dueAt, dueAtMode: 'manual', daysToComplete: parent.daysToComplete,
        carryoverOriginalHomeworkId: source.id, carryoverOriginalIssuedAt: snapshot.sourceIssuedAt,
        carryoverOriginalTitle: snapshot.sourceTitle,
        homeWork: '', checklistItems: [], goals: snapshot.goals,
        taskNumber: snapshot.goals[0]?.taskNumber ?? null, levelId: snapshot.goals[0]?.levelId ?? null,
        targetQuestions: snapshot.goals[0]?.targetQuestions || [], targetQuestionIds: snapshot.goals[0]?.targetQuestionIds || [],
      });
    }
  }
  return [...originals, ...supplements];
}
