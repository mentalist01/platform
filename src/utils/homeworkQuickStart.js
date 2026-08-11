const normalizeText = (value) => String(value ?? '').trim();

const normalizePositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
};

export const buildHomeworkQuickTaskKey = ({
  taskNumber,
  levelId,
  questionId,
  questionNumber,
}) => {
  const safeTaskNumber = normalizeText(taskNumber);
  const safeLevelId = normalizeText(levelId);
  const safeQuestionTarget = normalizeText(questionId)
    || (normalizePositiveNumber(questionNumber) ? `number-${normalizePositiveNumber(questionNumber)}` : '');
  if (!safeTaskNumber || !safeLevelId || !safeQuestionTarget) return '';
  return [safeTaskNumber, safeLevelId, safeQuestionTarget].join('|');
};

export const buildHomeworkQuickTaskQueue = (goals = []) => {
  const queue = [];
  const seen = new Set();

  const orderedGoals = (Array.isArray(goals) ? goals : [])
    .map((goal, originalIndex) => ({ goal, originalIndex }))
    .sort((left, right) => {
      const leftOptional = normalizeText(left.goal?.assignmentTier) === 'optional' ? 1 : 0;
      const rightOptional = normalizeText(right.goal?.assignmentTier) === 'optional' ? 1 : 0;
      return leftOptional - rightOptional || left.originalIndex - right.originalIndex;
    });

  orderedGoals.forEach(({ goal, originalIndex: goalIndex }) => {
    if (!goal || (goal.type && goal.type !== 'task')) return;
    const taskNumber = normalizePositiveNumber(goal.taskNumber);
    const levelId = normalizeText(goal.levelId);
    if (!taskNumber || !levelId) return;

    const targets = Array.isArray(goal.targetStatus) ? goal.targetStatus : [];
    targets.forEach((target, targetIndex) => {
      if (!target || target.solved) return;
      const questionNumber = normalizePositiveNumber(target.num ?? target.questionNumber);
      const questionId = normalizeText(target.questionId);
      if (!questionNumber && !questionId) return;

      const item = {
        taskNumber,
        levelId,
        questionNumber,
        questionId,
        taskTitle: normalizeText(goal.taskTitle),
        levelLabel: normalizeText(goal.levelLabel),
        assignmentTier: normalizeText(goal.assignmentTier) || 'required',
        goalIndex,
        targetIndex,
      };
      item.key = buildHomeworkQuickTaskKey(item);
      if (!item.key || seen.has(item.key)) return;
      seen.add(item.key);
      queue.push(item);
    });
  });

  return queue;
};

export const pickNextHomeworkQuickTask = (queue = [], completedKeys = [], currentKey = '') => {
  const completed = new Set(
    (Array.isArray(completedKeys) ? completedKeys : [])
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );
  const activeKey = normalizeText(currentKey);
  return (Array.isArray(queue) ? queue : []).find((item) => {
    const key = normalizeText(item?.key);
    return key && key !== activeKey && !completed.has(key);
  }) || null;
};

export const completeHomeworkQuickTaskSession = (session, queue, completedTask) => {
  const current = session && typeof session === 'object' ? session : {};
  const completedKey = normalizeText(completedTask?.key);
  const completedKeys = Array.isArray(current.completedKeys) ? current.completedKeys : [];
  if (
    current.status !== 'solving'
    || !completedKey
    || normalizeText(current.currentTask?.key) !== completedKey
    || completedKeys.includes(completedKey)
  ) {
    return current;
  }

  const nextCompletedKeys = Array.from(new Set([...completedKeys, completedKey]));
  const nextTask = pickNextHomeworkQuickTask(queue, nextCompletedKeys, completedKey);
  return {
    ...current,
    status: nextTask ? 'celebrate' : 'complete',
    completedKeys: nextCompletedKeys,
    completedCount: Math.max(0, Number(current.completedCount) || 0) + 1,
  };
};
