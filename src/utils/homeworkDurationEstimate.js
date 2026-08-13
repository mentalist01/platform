import {
  HOMEWORK_ASSIGNMENT_TIER_OPTIONAL,
  normalizeHomeworkAssignmentTier,
} from './homeworkAssignmentTier.js';

const MINUTE_MS = 60 * 1000;

const FALLBACK_DURATION_MS = Object.freeze({
  standard: 5 * MINUTE_MS,
  python: 12 * MINUTE_MS,
  mock: 8 * MINUTE_MS,
});

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getPositiveDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const getPositiveSampleSize = (value) => {
  const sampleSize = Math.floor(Number(value));
  return Number.isFinite(sampleSize) && sampleSize > 0 ? sampleSize : null;
};

const getAverageDuration = (entry) => (
  getPositiveDuration(entry?.averageActiveDurationMs)
  || getPositiveDuration(entry?.averageDurationMs)
);

const getTimingEntry = (timingIndex, taskNumber, levelId, questionId) => {
  const questionKey = String(questionId ?? '').trim();
  if (!questionKey) return null;
  const entry = timingIndex?.[String(taskNumber)]?.[String(levelId)]?.[questionKey];
  if (!isRecord(entry)) return null;
  const averageDurationMs = getAverageDuration(entry);
  const sampleSize = getPositiveSampleSize(entry.sampleSize);
  if (!averageDurationMs || !sampleSize) return null;
  return { averageDurationMs, sampleSize };
};

const getLevelTimingFallback = (timingIndex, taskNumber, levelId) => {
  const entries = timingIndex?.[String(taskNumber)]?.[String(levelId)];
  if (!isRecord(entries)) return null;
  let weightedDurationMs = 0;
  let sampleSize = 0;
  Object.values(entries).forEach((entry) => {
    if (!isRecord(entry)) return;
    const duration = getAverageDuration(entry);
    const samples = getPositiveSampleSize(entry.sampleSize);
    if (!duration || !samples) return;
    weightedDurationMs += duration * samples;
    sampleSize += samples;
  });
  if (sampleSize <= 0) return null;
  return {
    averageDurationMs: weightedDurationMs / sampleSize,
    sampleSize,
  };
};

const emptySummary = () => ({
  selectedCount: 0,
  estimatedCount: 0,
  directCount: 0,
  fallbackCount: 0,
  unknownCount: 0,
  estimatedDurationMs: 0,
});

const addToSummary = (summary, item) => {
  summary.selectedCount += 1;
  if (!item.estimatedDurationMs) {
    summary.unknownCount += 1;
    return;
  }
  summary.estimatedCount += 1;
  summary.estimatedDurationMs += item.estimatedDurationMs;
  if (item.source === 'question') summary.directCount += 1;
  else if (item.source === 'task-level') summary.fallbackCount += 1;
};

const getQuestionId = (question, fallback = '') => (
  String(question?.id ?? fallback ?? '').trim()
);

const getSelectedQuestionNumbers = (goal) => (
  Array.from(new Set(
    (Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [])
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0)
  ))
);

export const buildHomeworkDurationEstimate = ({
  goals = [],
  testsDb = {},
  timingIndex = {},
  taskGoalType = 'task',
} = {}) => {
  const itemsByKey = new Map();
  let ignoredGoalCount = 0;

  (Array.isArray(goals) ? goals : []).forEach((goal) => {
    if (String(goal?.type || taskGoalType) !== taskGoalType) {
      ignoredGoalCount += 1;
      return;
    }
    const taskNumber = Number(goal?.taskNumber);
    const levelId = String(goal?.levelId || '').trim();
    if (!Number.isFinite(taskNumber) || taskNumber <= 0 || !levelId) return;
    const questions = Array.isArray(testsDb?.[String(taskNumber)]?.[levelId])
      ? testsDb[String(taskNumber)][levelId]
      : [];
    const storedQuestionIds = Array.isArray(goal?.targetQuestionIds)
      ? goal.targetQuestionIds
      : [];
    const assignmentTier = normalizeHomeworkAssignmentTier(goal?.assignmentTier);

    getSelectedQuestionNumbers(goal).forEach((questionNumber, targetIndex) => {
      const question = questions[questionNumber - 1];
      const questionId = getQuestionId(question, storedQuestionIds[targetIndex]);
      const itemKey = `${taskNumber}\u001f${levelId}\u001f${questionId || `number-${questionNumber}`}`;
      const existing = itemsByKey.get(itemKey);
      if (existing) {
        if (
          existing.assignmentTier === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL
          && assignmentTier !== HOMEWORK_ASSIGNMENT_TIER_OPTIONAL
        ) {
          existing.assignmentTier = assignmentTier;
        }
        return;
      }

      const directTiming = getTimingEntry(timingIndex, taskNumber, levelId, questionId);
      const fallbackTiming = directTiming
        ? null
        : getLevelTimingFallback(timingIndex, taskNumber, levelId);
      const timing = directTiming || fallbackTiming;
      itemsByKey.set(itemKey, {
        key: itemKey,
        taskNumber,
        levelId,
        questionId,
        questionNumber,
        assignmentTier,
        estimatedDurationMs: timing?.averageDurationMs || null,
        sampleSize: timing?.sampleSize || 0,
        source: directTiming ? 'question' : (fallbackTiming ? 'task-level' : 'unknown'),
      });
    });
  });

  const items = Array.from(itemsByKey.values());
  const required = emptySummary();
  const optional = emptySummary();
  const total = emptySummary();
  items.forEach((item) => {
    addToSummary(total, item);
    addToSummary(
      item.assignmentTier === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL ? optional : required,
      item
    );
  });

  const complete = total.selectedCount > 0 && total.unknownCount === 0;
  return {
    items,
    required,
    optional,
    total,
    complete,
    knownDurationMs: total.estimatedDurationMs,
    totalDurationMs: complete ? total.estimatedDurationMs : null,
    ignoredGoalCount,
  };
};

export const formatHomeworkDurationEstimate = (durationMs) => {
  const numericDurationMs = Number(durationMs);
  if (!Number.isFinite(numericDurationMs) || numericDurationMs <= 0) return '';
  const totalMinutes = Math.max(1, Math.round(numericDurationMs / MINUTE_MS));
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
};

const normalizeDurationMs = (value) => {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.max(1, Math.round(durationMs));
};

const getAnalyticsDurationMs = (analytics) => normalizeDurationMs(
  analytics?.averageActiveDurationMs ?? analytics?.averageDurationMs
);

const median = (values) => {
  const normalized = (Array.isArray(values) ? values : [])
    .map(normalizeDurationMs)
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  if (normalized.length === 0) return null;
  const middle = Math.floor(normalized.length / 2);
  return normalized.length % 2 === 0
    ? Math.round((normalized[middle - 1] + normalized[middle]) / 2)
    : normalized[middle];
};

const isPythonGoal = (goal) => (
  String(goal?.levelId || '').trim().toLowerCase() === 'python'
  || Number(goal?.taskNumber) >= 100
);

const isMockGoal = (goal) => Boolean(
  String(goal?.mockExamId || '').trim()
  || String(goal?.type || '').trim().toLowerCase().includes('mock')
);

const isOptionalGoal = (goal) => (
  goal?.optional === true
  || String(goal?.assignmentTier || '').trim().toLowerCase() === 'optional'
);

const collectQuestionAnalyticsDurations = (index) => {
  const byKind = { standard: [], python: [] };
  if (!isRecord(index)) return byKind;
  Object.entries(index).forEach(([taskKey, levels]) => {
    if (!isRecord(levels)) return;
    Object.entries(levels).forEach(([levelId, questions]) => {
      if (!isRecord(questions)) return;
      const kind = String(levelId).trim().toLowerCase() === 'python' || Number(taskKey) >= 100
        ? 'python'
        : 'standard';
      Object.values(questions).forEach((analytics) => {
        const durationMs = getAnalyticsDurationMs(analytics);
        if (durationMs !== null) byKind[kind].push(durationMs);
      });
    });
  });
  return byKind;
};

const collectMockAnalyticsDurations = (index) => {
  const durations = [];
  if (!isRecord(index)) return durations;
  Object.values(index).forEach((tasks) => {
    if (!isRecord(tasks)) return;
    Object.values(tasks).forEach((analytics) => {
      const durationMs = getAnalyticsDurationMs(analytics);
      if (durationMs !== null) durations.push(durationMs);
    });
  });
  return durations;
};

const getDirectDurationMs = ({
  goal,
  target,
  questionDifficultyIndex,
  mockTaskAnalyticsByExam,
}) => {
  if (isMockGoal(goal)) {
    const examId = String(goal?.mockExamId || '').trim();
    const taskKey = String(target?.taskKey ?? target?.taskNumber ?? target?.num ?? '').trim();
    return getAnalyticsDurationMs(mockTaskAnalyticsByExam?.[examId]?.[taskKey]);
  }
  const taskKey = String(goal?.taskNumber ?? '').trim();
  const levelId = String(goal?.levelId || '').trim();
  const questionId = String(target?.questionId ?? target?.id ?? '').trim();
  if (!taskKey || !levelId || !questionId) return null;
  return getAnalyticsDurationMs(questionDifficultyIndex?.[taskKey]?.[levelId]?.[questionId]);
};

export const estimateHomeworkDuration = ({
  goalViews = [],
  questionDifficultyIndex = {},
  mockTaskAnalyticsByExam = {},
} = {}) => {
  const goals = (Array.isArray(goalViews) ? goalViews : []).filter(Boolean);
  const questionDurations = collectQuestionAnalyticsDurations(questionDifficultyIndex);
  const globalFallbacks = {
    standard: median(questionDurations.standard) || FALLBACK_DURATION_MS.standard,
    python: median(questionDurations.python) || FALLBACK_DURATION_MS.python,
    mock: median(collectMockAnalyticsDurations(mockTaskAnalyticsByExam)) || FALLBACK_DURATION_MS.mock,
  };
  const items = [];

  goals.forEach((goal) => {
    const targets = Array.isArray(goal?.targetStatus) ? goal.targetStatus : [];
    if (targets.length === 0) return;
    const kind = isMockGoal(goal) ? 'mock' : (isPythonGoal(goal) ? 'python' : 'standard');
    const directDurations = targets.map((target) => getDirectDurationMs({
      goal,
      target,
      questionDifficultyIndex,
      mockTaskAnalyticsByExam,
    }));
    const goalFallbackMs = median(directDurations) || globalFallbacks[kind];
    targets.forEach((target, index) => {
      const directDurationMs = directDurations[index];
      items.push({
        durationMs: directDurationMs || goalFallbackMs,
        measured: directDurationMs !== null,
        optional: isOptionalGoal(goal),
      });
    });
  });

  if (items.length === 0) return null;
  const requiredItems = items.filter((item) => !item.optional);
  const optionalItems = items.filter((item) => item.optional);
  const requiredDurationMs = requiredItems.reduce((sum, item) => sum + item.durationMs, 0);
  const optionalDurationMs = optionalItems.reduce((sum, item) => sum + item.durationMs, 0);
  const measuredItemCount = items.filter((item) => item.measured).length;

  return {
    requiredMinutes: requiredDurationMs / MINUTE_MS,
    optionalMinutes: optionalDurationMs / MINUTE_MS,
    totalMinutes: (requiredDurationMs + optionalDurationMs) / MINUTE_MS,
    requiredItemCount: requiredItems.length,
    optionalItemCount: optionalItems.length,
    itemCount: items.length,
    measuredItemCount,
    coveragePercent: Math.round((measuredItemCount / items.length) * 100),
    usedFallback: measuredItemCount < items.length,
  };
};

export const formatHomeworkDurationMinutes = (value) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const roundedMinutes = minutes < 10
    ? Math.max(1, Math.round(minutes))
    : Math.max(5, Math.round(minutes / 5) * 5);
  if (roundedMinutes < 60) return `${roundedMinutes} мин`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  return remainder > 0 ? `${hours} ч ${remainder} мин` : `${hours} ч`;
};
