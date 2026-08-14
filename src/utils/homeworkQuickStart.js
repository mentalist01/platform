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

const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;
const HOMEWORK_TIME_PLAN_FULL_RANGE_MINUTES = 30;
const HOMEWORK_TIME_PLAN_OPTION_COUNT = 3;
// Shorter values are almost always an accidental submit or synthetic data and
// make promises such as "15 tasks in one minute". Difficulty may still use the
// observation, but a time plan must not.
export const HOMEWORK_TIME_PLAN_MIN_TASK_DURATION_MS = 15 * SECOND_MS;
export const HOMEWORK_TIME_PLAN_CONFIRMED_MIN_TASK_DURATION_MS = 3 * SECOND_MS;
export const HOMEWORK_TIME_PLAN_CONFIRMING_SAMPLE_SIZE = 3;

const isRecord = (value) => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

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
    if (!goal) return;
    const goalType = normalizeText(goal.type).toLowerCase();
    const isMockGoal = goalType === 'mock' || (!goalType && normalizeText(goal.mockExamId));
    if (isMockGoal) {
      const mockExamId = normalizeText(goal.mockExamId);
      const mockMode = normalizeText(goal.mode).toLowerCase();
      const requiredMode = normalizeText(goal.requiredMode).toLowerCase();
      if (!mockExamId) return;
      const isClassicMock = mockMode === 'classic' && (!requiredMode || requiredMode === 'classic');
      if (!isClassicMock) {
        const assignmentTier = normalizeText(goal.assignmentTier) || 'required';
        if (getAssignmentTierRank(assignmentTier) === 0 && goal.completed !== true) {
          const key = ['blocker', 'timer-mock', mockExamId].join('|');
          if (!seen.has(key)) {
            seen.add(key);
            queue.push({
              kind: 'blocker',
              blockerKind: 'timer-mock',
              isPlanBlocker: true,
              openable: false,
              status: 'pending',
              assignmentTier,
              mockExamId,
              mockExamTitle: normalizeText(goal.mockExamTitle),
              mode: 'timer',
              goalIndex,
              key,
            });
          }
        }
        return;
      }

      const targets = Array.isArray(goal.taskStatus) ? goal.taskStatus : [];
      targets.forEach((target, targetIndex) => {
        const targetStatus = normalizeText(target?.status).toLowerCase();
        if (
          !target
          || target.solved
          || target.completed
          || ['solved', 'completed', 'complete', 'done', 'correct'].includes(targetStatus)
        ) return;
        const taskKey = normalizeText(
          target.taskKey ?? target.taskNumber ?? target.num ?? target.questionNumber
        );
        if (!taskKey) return;
        const key = ['mock', mockExamId, taskKey].join('|');
        if (seen.has(key)) return;
        seen.add(key);
        const numericTaskNumber = normalizePositiveNumber(target.taskNumber ?? taskKey);
        queue.push({
          kind: 'mock',
          mode: 'classic',
          status: 'pending',
          mockExamId,
          mockExamTitle: normalizeText(goal.mockExamTitle),
          taskKey,
          taskNumber: numericTaskNumber,
          assignmentTier: normalizeText(goal.assignmentTier) || 'required',
          goalIndex,
          targetIndex,
          key,
        });
      });
      return;
    }

    if (goalType && goalType !== 'task') return;
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
        kind: 'question',
        questionKind: levelId.toLowerCase() === 'python' || taskNumber >= 100
          ? 'python'
          : 'standard',
        status: 'pending',
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

const normalizeMeasuredDurationMs = (analytics) => {
  const candidates = [analytics?.averageActiveDurationMs, analytics?.averageDurationMs];
  const durationMs = candidates
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0);
  if (!durationMs) return null;
  return Math.max(SECOND_MS, Math.round(durationMs / SECOND_MS) * SECOND_MS);
};

const getRawMeasuredDurationMs = (analytics) => (
  [analytics?.averageActiveDurationMs, analytics?.averageDurationMs]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0) || null
);

const getLocalSampleSize = (analytics) => {
  const sampleSize = Math.floor(Number(analytics?.sampleSize));
  return Number.isFinite(sampleSize) && sampleSize >= 1 ? sampleSize : 0;
};

const getKnownDifficultyScore = (candidate, analytics) => {
  const difficulty = isRecord(candidate?.difficulty) ? candidate.difficulty : null;
  const analyticsDifficulty = isRecord(analytics?.difficulty) ? analytics.difficulty : null;
  const numericValues = [
    candidate?.difficultyScore,
    analytics?.difficultyScore,
    analytics?.score,
    difficulty?.score,
    analyticsDifficulty?.score,
  ];
  const rawNumericScore = numericValues.find((value) => (
    value !== null
    && normalizeText(value) !== ''
    && Number.isFinite(Number(value))
  ));
  if (rawNumericScore !== undefined) {
    return Math.min(100, Math.max(0, Number(rawNumericScore)));
  }

  const categorySources = [
    candidate?.difficulty,
    analytics?.difficulty,
    difficulty,
    analyticsDifficulty,
    analytics,
    candidate,
  ];
  for (const source of categorySources) {
    const meta = getQuestionDifficultyMeta(source);
    if (meta && Number.isFinite(Number(meta.minScore))) return Number(meta.minScore);
  }
  return null;
};

const isPendingHomeworkCandidate = (candidate) => {
  if (!candidate || candidate.solved === true || candidate.completed === true) return false;
  const status = normalizeText(candidate.status).toLowerCase();
  return !['solved', 'completed', 'complete', 'done', 'correct'].includes(status);
};

const enrichHomeworkTimeCandidate = (candidate, originalIndex) => {
  const analytics = isRecord(candidate?.analytics)
    ? candidate.analytics
    : (isRecord(candidate?.difficulty) ? candidate.difficulty : candidate);
  const rawObservedDurationMs = getRawMeasuredDurationMs(analytics);
  const observedDurationMs = normalizeMeasuredDurationMs(analytics);
  const sampleSize = getLocalSampleSize(analytics);
  const difficultyScore = getKnownDifficultyScore(candidate, analytics);
  const difficultyKnown = sampleSize >= 1 && difficultyScore !== null;
  const minimumDurationMs = sampleSize >= HOMEWORK_TIME_PLAN_CONFIRMING_SAMPLE_SIZE
    ? HOMEWORK_TIME_PLAN_CONFIRMED_MIN_TASK_DURATION_MS
    : HOMEWORK_TIME_PLAN_MIN_TASK_DURATION_MS;
  const estimatedDurationMs = rawObservedDurationMs >= minimumDurationMs
    ? observedDurationMs
    : null;
  const measured = Boolean(
    estimatedDurationMs
    && difficultyKnown
  );
  return {
    ...candidate,
    estimatedDurationMs: measured ? estimatedDurationMs : null,
    estimatedMinutes: measured
      ? Math.round((estimatedDurationMs / MINUTE_MS) * 10) / 10
      : null,
    sampleSize: measured ? sampleSize : 0,
    difficultyScore: difficultyKnown ? difficultyScore : null,
    difficultyKnown,
    measured,
    _homeworkTimeObservedDurationMs: rawObservedDurationMs,
    _homeworkTimeOriginalIndex: originalIndex,
  };
};

const stripInternalCandidateFields = (candidate) => {
  const task = { ...candidate };
  delete task._homeworkTimeOriginalIndex;
  delete task._homeworkTimeObservedDurationMs;
  return task;
};

const buildCumulativeTimePlans = (tasks) => {
  if (tasks.length < HOMEWORK_TIME_PLAN_OPTION_COUNT) return [];
  const prefixes = [];
  let totalDurationMs = 0;
  tasks.forEach((task, index) => {
    totalDurationMs += task.estimatedDurationMs;
    prefixes.push({
      tasks: tasks.slice(0, index + 1),
      totalDurationMs,
    });
  });

  const availableRangeMs = Math.min(totalDurationMs, HOMEWORK_TIME_PLAN_FULL_RANGE_MINUTES * MINUTE_MS);
  const targetMinuteSteps = availableRangeMs < HOMEWORK_TIME_PLAN_FULL_RANGE_MINUTES * MINUTE_MS
    ? [availableRangeMs / 3, availableRangeMs * (2 / 3), availableRangeMs]
    : [10 * MINUTE_MS, 20 * MINUTE_MS, 30 * MINUTE_MS];
  const targetDurationMs = Array.from(
    { length: HOMEWORK_TIME_PLAN_OPTION_COUNT },
    (_, index) => targetMinuteSteps[index]
  );
  const selected = [];
  targetDurationMs.forEach((targetMs) => {
    const best = prefixes.reduce((current, candidate) => {
      if (!current) return candidate;
      const candidateDeviation = Math.abs(candidate.totalDurationMs - targetMs);
      const currentDeviation = Math.abs(current.totalDurationMs - targetMs);
      if (candidateDeviation !== currentDeviation) {
        return candidateDeviation < currentDeviation ? candidate : current;
      }
      const candidateAtOrBelow = candidate.totalDurationMs <= targetMs;
      const currentAtOrBelow = current.totalDurationMs <= targetMs;
      if (candidateAtOrBelow !== currentAtOrBelow) return candidateAtOrBelow ? candidate : current;
      return candidate.tasks.length < current.tasks.length ? candidate : current;
    }, null);
    if (best && !selected.some((entry) => entry.tasks.length === best.tasks.length)) {
      selected.push(best);
    }
  });

  const plans = [];
  selected.forEach((selection) => {
    const displayMinutes = Math.max(1, Math.ceil(selection.totalDurationMs / MINUTE_MS));
    if (plans.some((plan) => plan.displayMinutes === displayMinutes)) return;
    const planTasks = selection.tasks.map(stripInternalCandidateFields);
    plans.push({
      id: `homework-time-${displayMinutes}-${planTasks.length}`,
      key: `${displayMinutes}:${planTasks.map((task) => normalizeText(task.key)).join(',')}`,
      budgetMinutes: displayMinutes,
      displayMinutes,
      estimatedMinutes: Math.round((selection.totalDurationMs / MINUTE_MS) * 10) / 10,
      estimatedDurationMs: selection.totalDurationMs,
      tasks: planTasks,
    });
  });
  return plans;
};

const pickEasiestKnownTask = (tasks) => (
  [...tasks].sort((left, right) => (
    Number(right.difficultyKnown) - Number(left.difficultyKnown)
    || (left.difficultyScore ?? 0) - (right.difficultyScore ?? 0)
    || (left.estimatedDurationMs ?? Number.POSITIVE_INFINITY)
      - (right.estimatedDurationMs ?? Number.POSITIVE_INFINITY)
    || (left._homeworkTimeObservedDurationMs ?? Number.POSITIVE_INFINITY)
      - (right._homeworkTimeObservedDurationMs ?? Number.POSITIVE_INFINITY)
    || left._homeworkTimeOriginalIndex - right._homeworkTimeOriginalIndex
  ))[0] || null
);

/**
 * Builds up to three honest, progressively longer sessions from pending work.
 * This feature deliberately uses a local one-observation threshold; it does not
 * change the platform-wide confidence threshold for difficulty indicators.
 */
export const buildHomeworkTimePlans = (candidates = []) => {
  const eligibleTasksWithInternalFields = (Array.isArray(candidates) ? candidates : [])
    .filter(isPendingHomeworkCandidate)
    .map(enrichHomeworkTimeCandidate);
  const measuredTasksWithInternalFields = eligibleTasksWithInternalFields
    .filter((task) => task.measured);
  const pendingRequiredTasks = eligibleTasksWithInternalFields.filter(
    (task) => getAssignmentTierRank(task.assignmentTier) === 0
  );
  const unknownRequiredTasks = pendingRequiredTasks.filter((task) => !task.measured);
  const hasUnknownRequired = unknownRequiredTasks.length > 0;

  const measuredRequiredTasks = measuredTasksWithInternalFields.filter(
    (task) => getAssignmentTierRank(task.assignmentTier) === 0
  );
  const measuredOptionalTasks = measuredTasksWithInternalFields.filter(
    (task) => getAssignmentTierRank(task.assignmentTier) === 1
  );
  const planningTasks = hasUnknownRequired
    ? measuredRequiredTasks
    : [...measuredRequiredTasks, ...measuredOptionalTasks];
  const plansWithInternalFields = buildCumulativeTimePlans(planningTasks);

  const fallbackWithInternalFields = plansWithInternalFields.length === 0
    ? (() => {
      const openableRequiredTasks = pendingRequiredTasks.filter((task) => task.openable !== false);
      if (openableRequiredTasks.length > 0) return pickEasiestKnownTask(openableRequiredTasks);
      if (pendingRequiredTasks.length > 0) return null;
      const openableTasks = eligibleTasksWithInternalFields.filter((task) => task.openable !== false);
      return pickEasiestKnownTask(openableTasks);
    })()
    : null;

  return {
    availablePlans: plansWithInternalFields,
    fallbackTask: fallbackWithInternalFields
      ? stripInternalCandidateFields(fallbackWithInternalFields)
      : null,
    eligibleTasks: eligibleTasksWithInternalFields.map(stripInternalCandidateFields),
    measuredTasks: measuredTasksWithInternalFields.map(stripInternalCandidateFields),
    measuredTaskCount: measuredTasksWithInternalFields.length,
    excludedShortDurationCount: eligibleTasksWithInternalFields.filter((task) => (
      task.difficultyKnown
      && task._homeworkTimeObservedDurationMs
      && !task.estimatedDurationMs
    )).length,
    hasUnknownRequired,
    blockerTasks: unknownRequiredTasks
      .filter((task) => task.isPlanBlocker)
      .map(stripInternalCandidateFields),
  };
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
      const indexedDifficulty = taskKey && levelKey && questionKey
        ? difficultyIndex?.[taskKey]?.[levelKey]?.[questionKey]
        : null;
      const difficulty = isRecord(item?.analytics) ? item.analytics : indexedDifficulty;
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
    return item?.openable !== false && key && key !== activeKey && !completed.has(key);
  }) || null;
};

const getHomeworkQuickTaskSurfaceKey = (task) => {
  if (!task || task.openable === false) return '';
  if (task.kind === 'mock') {
    const mockExamId = normalizeText(task.mockExamId);
    return mockExamId ? `mock:${mockExamId}:${normalizeText(task.mode) || 'classic'}` : '';
  }
  const taskNumber = normalizePositiveNumber(task.taskNumber);
  const levelId = normalizeText(task.levelId);
  if (!taskNumber || !levelId) return '';
  const isPython = task.questionKind === 'python' || levelId.toLowerCase() === 'python' || taskNumber >= 100;
  return isPython
    ? `python:${normalizeText(task.key)}`
    : `question:${taskNumber}:${levelId}`;
};

export const getHomeworkQuickTaskBatch = (queue = [], currentTask = null, completedKeys = []) => {
  const surfaceKey = getHomeworkQuickTaskSurfaceKey(currentTask);
  if (!surfaceKey) return currentTask ? [currentTask] : [];
  const completed = new Set(
    (Array.isArray(completedKeys) ? completedKeys : [])
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );
  return (Array.isArray(queue) ? queue : []).filter((task) => {
    const key = normalizeText(task?.key);
    return key && !completed.has(key) && getHomeworkQuickTaskSurfaceKey(task) === surfaceKey;
  });
};

export const completeHomeworkQuickTaskSession = (session, queue, completedTask, options = {}) => {
  const current = session && typeof session === 'object' ? session : {};
  const completedKey = normalizeText(completedTask?.key);
  const completedKeys = Array.isArray(current.completedKeys) ? current.completedKeys : [];
  const activeTaskKeys = new Set(
    (Array.isArray(options?.activeTaskKeys) ? options.activeTaskKeys : [])
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );
  if (
    current.status !== 'solving'
    || !completedKey
    || (
      normalizeText(current.currentTask?.key) !== completedKey
      && !activeTaskKeys.has(completedKey)
    )
    || completedKeys.includes(completedKey)
  ) {
    return current;
  }

  const nextCompletedKeys = Array.from(new Set([...completedKeys, completedKey]));
  const nextBatchTask = (Array.isArray(queue) ? queue : []).find((task) => {
    const key = normalizeText(task?.key);
    return task?.openable !== false
      && key
      && activeTaskKeys.has(key)
      && !nextCompletedKeys.includes(key);
  }) || null;
  const nextTask = pickNextHomeworkQuickTask(queue, nextCompletedKeys, completedKey);
  const staysInActiveBatch = Boolean(nextBatchTask);
  return {
    ...current,
    status: staysInActiveBatch ? 'solving' : (nextTask ? 'celebrate' : 'complete'),
    completedKeys: nextCompletedKeys,
    completedCount: Math.max(0, Number(current.completedCount) || 0) + 1,
  };
};
