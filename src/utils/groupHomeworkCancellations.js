const list = value => Array.isArray(value) ? value : [];

export const groupEgeCancellationsForAssignment = (records, groupId, assignmentId) => list(records)
  .filter(record => !record.revokedAt && record.groupId === groupId
    && list(record.sourceAssignmentIds).includes(assignmentId))
  .map(record => ({ taskNumber: record.taskNumber, levelId: record.levelId,
    targetQuestionIds: record.targetQuestionIds }));

export const isCancelledGroupEgeTarget = (cancellations, taskNumber, levelId, questionId) => list(cancellations)
  .some(record => Number(record.taskNumber) === Number(taskNumber)
    && record.levelId === (levelId || 'basic') && list(record.targetQuestionIds).includes(questionId));

export function filterCancelledGroupEgeGoals(entry) {
  const cancellations = list(entry?.learningEgeCancellations);
  return list(entry?.goals).flatMap(goal => {
    if (!cancellations.length || goal.type === 'mock' || goal.mockExamId
      || Number(goal.taskNumber) >= 100) return [goal];
    const ids = list(goal.targetQuestionIds);
    const indexes = ids.map((id, index) => ({ id, index })).filter(({ id }) => (
      !isCancelledGroupEgeTarget(cancellations, goal.taskNumber, goal.levelId, id)
    ));
    if (indexes.length === ids.length) return [goal];
    if (!indexes.length) return [];
    return [{ ...goal, includeAll: false, targetQuestionIds: indexes.map(target => target.id),
      targetQuestions: indexes.map(target => goal.targetQuestions[target.index]) }];
  });
}
