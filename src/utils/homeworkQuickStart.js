import {
  QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE,
  getQuestionDifficultyMeta,
  hasEnoughQuestionDifficultyData,
} from './questionDifficulty.js';

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

const getAssignmentTierRank = (value) => (
  normalizeText(value) === 'optional' ? 1 : 0
);

const getReliableDifficultyScore = (difficulty, minimumSampleSize) => {
  if (!hasEnoughQuestionDifficultyData(difficulty, minimumSampleSize)) return null;
  const numericScore = Number(difficulty?.score);
  if (Number.isFinite(numericScore)) return Math.min(100, Math.max(0, numericScore));
  const categoryMeta = getQuestionDifficultyMeta(difficulty);
  return Number.isFinite(Number(categoryMeta?.minScore)) ? Number(categoryMeta.minScore) : null;
};

export const rankHomeworkQuickTaskQueueByDifficulty = (
  queue = [],
  difficultyIndex = {},
  { minimumSampleSize = QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE } = {}
) => (
  (Array.isArray(queue) ? queue : [])
    .map((item, originalIndex) => {
      const taskKey = normalizeText(item?.taskNumber);
      const levelKey = normalizeText(item?.levelId);
      const questionKey = normalizeText(item?.questionId);
      const difficulty = taskKey && levelKey && questionKey
        ? difficultyIndex?.[taskKey]?.[levelKey]?.[questionKey]
        : null;
      const difficultyScore = getReliableDifficultyScore(difficulty, minimumSampleSize);
      return {
        item: {
          ...item,
          difficulty: difficultyScore === null ? null : difficulty,
          difficultyScore,
          difficultyKnown: difficultyScore !== null,
        },
        assignmentTierRank: getAssignmentTierRank(item?.assignmentTier),
        difficultyScore,
        difficultyKnown: difficultyScore !== null,
        originalQuickOrder: originalIndex,
      };
    })
    .sort((left, right) => (
      left.assignmentTierRank - right.assignmentTierRank
      || Number(right.difficultyKnown) - Number(left.difficultyKnown)
      || ((left.difficultyScore ?? 0) - (right.difficultyScore ?? 0))
      || left.originalQuickOrder - right.originalQuickOrder
    ))
    .map((entry) => entry.item)
);

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
