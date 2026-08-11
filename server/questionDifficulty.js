import { calculateQuestionDifficulty } from '../src/utils/questionDifficulty.js';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isSafeKey = (value) => {
  const key = String(value ?? '').trim();
  return Boolean(key) && key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
};

const asTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const isValidDuration = (value) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

const isValidWrongAttempts = (value) => (
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
);

export const isPythonDifficultyTarget = (taskNumber, levelId) => {
  if (String(levelId ?? '').trim().toLowerCase() === 'python') return true;
  const numericTaskNumber = Number(taskNumber);
  return Number.isInteger(numericTaskNumber) && numericTaskNumber >= 100;
};

const normalizeChronologicalHistory = (answerHistory) => {
  const seenIds = new Set();
  return (Array.isArray(answerHistory) ? answerHistory : [])
    .map((entry, sourceIndex) => {
      if (!isRecord(entry)) return null;
      const submittedAtMs = asTimestamp(entry.submittedAt);
      if (submittedAtMs === null) return null;
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';
      if (id && seenIds.has(id)) return null;
      if (id) seenIds.add(id);
      return { entry, sourceIndex, submittedAtMs };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.submittedAtMs - right.submittedAtMs || left.sourceIndex - right.sourceIndex
    ));
};

/**
 * Extracts at most one observation from one student's history for one question.
 * The first chronologically correct answer is authoritative. If that answer has
 * no valid active solveDurationMs, later correct answers are intentionally not
 * used as a substitute.
 */
export const extractFirstSolveObservation = (answerHistory) => {
  const chronological = normalizeChronologicalHistory(answerHistory);
  const firstCorrectIndex = chronological.findIndex(({ entry }) => entry.correct === true);
  if (firstCorrectIndex < 0) return null;

  const firstCorrect = chronological[firstCorrectIndex];
  if (!isValidDuration(firstCorrect.entry.solveDurationMs)) return null;

  const wrongAttempts = chronological
    .slice(0, firstCorrectIndex)
    .reduce((count, { entry }) => count + (entry.correct === false ? 1 : 0), 0);

  return {
    activeDurationMs: firstCorrect.entry.solveDurationMs,
    solveDurationMs: firstCorrect.entry.solveDurationMs,
    wrongAttempts,
    solvedAt: new Date(firstCorrect.submittedAtMs).toISOString(),
  };
};

export const extractFirstSolveTelemetryObservation = (telemetry) => {
  if (!isRecord(telemetry)) return null;
  if (!isValidDuration(telemetry.solveDurationMs)) return null;
  if (!isValidWrongAttempts(telemetry.wrongAttempts)) return null;
  const solvedAtMs = asTimestamp(telemetry.solvedAt);
  if (solvedAtMs === null) return null;
  return {
    activeDurationMs: telemetry.solveDurationMs,
    solveDurationMs: telemetry.solveDurationMs,
    wrongAttempts: telemetry.wrongAttempts,
    solvedAt: new Date(solvedAtMs).toISOString(),
  };
};

/**
 * Flattens progress.json into one valid first-solve observation per student and
 * question. Histories without a correct answer or without solveDurationMs on the
 * first correct answer do not take part in the statistic.
 */
export const collectQuestionDifficultyObservations = (progressDb) => {
  if (!isRecord(progressDb)) return [];
  const observations = [];

  Object.entries(progressDb).forEach(([studentId, studentData]) => {
    if (!isSafeKey(studentId) || !isRecord(studentData?.solvedByTask)) return;
    Object.entries(studentData.solvedByTask).forEach(([taskKey, taskEntry]) => {
      if (!isSafeKey(taskKey) || !isRecord(taskEntry)) return;
      Object.entries(taskEntry).forEach(([levelId, levelEntry]) => {
        if (!isSafeKey(levelId) || levelId.startsWith('_') || !isRecord(levelEntry)) return;
        const firstSolveTelemetry = isRecord(levelEntry.firstSolveTelemetry)
          ? levelEntry.firstSolveTelemetry
          : {};
        const answerHistory = isRecord(levelEntry.answerHistory) ? levelEntry.answerHistory : {};
        const isPython = isPythonDifficultyTarget(taskKey, levelId);
        const questionIds = new Set([
          ...Object.keys(firstSolveTelemetry),
          ...Object.keys(answerHistory),
        ]);
        questionIds.forEach((questionId) => {
          if (!isSafeKey(questionId)) return;
          const observation = extractFirstSolveTelemetryObservation(firstSolveTelemetry[questionId])
            || extractFirstSolveObservation(answerHistory[questionId]);
          if (!observation) return;
          observations.push({
            studentId,
            taskKey,
            taskNumber: Number.isFinite(Number(taskKey)) ? Number(taskKey) : taskKey,
            levelId,
            questionId,
            type: isPython ? 'python' : 'standard',
            isPython,
            ...observation,
          });
        });
      });
    });
  });

  return observations;
};

const getBucketKey = ({ taskKey, levelId, questionId }) => (
  JSON.stringify([taskKey, levelId, questionId])
);

const ensureNestedTarget = (index, taskKey, levelId) => {
  if (!Object.hasOwn(index, taskKey)) index[taskKey] = {};
  if (!Object.hasOwn(index[taskKey], levelId)) index[taskKey][levelId] = {};
  return index[taskKey][levelId];
};

export const buildQuestionDifficultyIndex = (progressDb, options = {}) => {
  const buckets = new Map();
  collectQuestionDifficultyObservations(progressDb).forEach((observation) => {
    const bucketKey = getBucketKey(observation);
    const bucket = buckets.get(bucketKey) || {
      taskKey: observation.taskKey,
      taskNumber: observation.taskNumber,
      levelId: observation.levelId,
      questionId: observation.questionId,
      type: observation.type,
      isPython: observation.isPython,
      observations: [],
    };
    bucket.observations.push(observation);
    buckets.set(bucketKey, bucket);
  });

  const result = {};
  buckets.forEach((bucket) => {
    const difficulty = calculateQuestionDifficulty(bucket.observations, {
      isPython: bucket.isPython,
      taskNumber: bucket.taskNumber,
      levelId: bucket.levelId,
    });
    if (!difficulty) return;
    if (options?.includeProvisional === false && difficulty.provisional) return;
    const levelIndex = ensureNestedTarget(result, bucket.taskKey, bucket.levelId);
    levelIndex[bucket.questionId] = {
      ...difficulty,
      taskNumber: bucket.taskNumber,
      levelId: bucket.levelId,
      questionId: bucket.questionId,
    };
  });

  return result;
};

export const getQuestionDifficultyFromIndex = (
  index,
  taskNumber,
  levelId,
  questionId
) => {
  const taskKey = String(taskNumber ?? '').trim();
  const levelKey = String(levelId ?? '').trim();
  const questionKey = String(questionId ?? '').trim();
  if (!isSafeKey(taskKey) || !isSafeKey(levelKey) || !isSafeKey(questionKey)) return null;
  return index?.[taskKey]?.[levelKey]?.[questionKey] || null;
};

export const buildDifficultyIndex = buildQuestionDifficultyIndex;
