import {
  HOMEWORK_ASSIGNMENT_TIER_OPTIONAL,
  normalizeHomeworkAssignmentTier,
} from './homeworkAssignmentTier.js';

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
  const totalMinutes = Math.max(1, Math.round(numericDurationMs / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
};
