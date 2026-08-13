import {
  QUESTION_DIFFICULTY_FULL_CONFIDENCE_SAMPLE_SIZE,
  QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE,
  calculateRobustMean,
  getQuestionDifficultyCategory,
  getQuestionDifficultyMeta,
} from '../src/utils/questionDifficulty.js';

export const MOCK_EXAM_TASK_DURATION_MAX_MS = 4 * 60 * 60 * 1000;
export const MOCK_EXAM_TASK_DIFFICULTY_TIME_CAP_MS = 30 * 60 * 1000;

const MOCK_EXAM_TASK_DIFFICULTY_WEIGHTS = Object.freeze({
  activeDuration: 0.4,
  incorrectResult: 0.6,
});

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value) => String(value ?? '').trim();

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const normalizeDurationMs = (value) => {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.min(MOCK_EXAM_TASK_DURATION_MAX_MS, Math.max(1, Math.round(durationMs)));
};

const hasAnswerValue = (value) => {
  if (Array.isArray(value)) return value.some((entry) => normalizeText(entry));
  return Boolean(normalizeText(value));
};

const getTaskVersionId = (task) => {
  if (!isRecord(task)) return '';
  const version = task.analyticsVersion ?? task.id;
  if (version === null || typeof version === 'undefined') return '';
  return normalizeText(version);
};

const hasMatchingTaskVersion = (currentTask, observedTask) => {
  const currentId = getTaskVersionId(currentTask);
  const observedId = getTaskVersionId(observedTask);
  return !currentId || !observedId || currentId === observedId;
};

const isFinishedAttempt = (attempt) => Boolean(
  normalizeText(attempt?.finishedAt)
  || normalizeText(attempt?.timerFinishedAt)
  || normalizeText(attempt?.status).toLowerCase() === 'finished'
);

const isObservableCurrentAttempt = (attempt) => {
  if (!isRecord(attempt)) return false;
  return isFinishedAttempt(attempt);
};

const getConfidenceLevel = (sampleSize) => {
  if (sampleSize < QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE) return 'low';
  if (sampleSize < QUESTION_DIFFICULTY_FULL_CONFIDENCE_SAMPLE_SIZE) return 'medium';
  return 'high';
};

export const calculateMockExamTaskDifficulty = (observations) => {
  const normalized = (Array.isArray(observations) ? observations : []).reduce((result, observation) => {
    if (!isRecord(observation)) return result;
    const activeDurationMs = normalizeDurationMs(observation.activeDurationMs ?? observation.durationMs);
    if (activeDurationMs === null || typeof observation.solved !== 'boolean') return result;
    result.push({ activeDurationMs, solved: observation.solved });
    return result;
  }, []);
  if (normalized.length === 0) return null;

  const averageActiveDurationMs = calculateRobustMean(
    normalized.map((entry) => entry.activeDurationMs),
    {
      maximum: MOCK_EXAM_TASK_DURATION_MAX_MS,
      minimumScale: 45 * 1000,
    }
  );
  const solvedCount = normalized.filter((entry) => entry.solved).length;
  const sampleSize = normalized.length;
  const incorrectCount = sampleSize - solvedCount;
  const accuracyPercent = Math.round((solvedCount / sampleSize) * 100);
  const incorrectRate = incorrectCount / sampleSize;
  const durationScore = clamp(
    (averageActiveDurationMs / MOCK_EXAM_TASK_DIFFICULTY_TIME_CAP_MS) * 100,
    0,
    100
  );
  const incorrectResultScore = incorrectRate * 100;
  const score = Math.round(
    (durationScore * MOCK_EXAM_TASK_DIFFICULTY_WEIGHTS.activeDuration)
      + (incorrectResultScore * MOCK_EXAM_TASK_DIFFICULTY_WEIGHTS.incorrectResult)
  );
  const category = getQuestionDifficultyCategory(score);
  const confidence = Math.round(
    Math.min(1, sampleSize / QUESTION_DIFFICULTY_FULL_CONFIDENCE_SAMPLE_SIZE) * 100
  ) / 100;

  return {
    score,
    category,
    categoryMeta: getQuestionDifficultyMeta(category),
    type: 'mock-exam',
    sampleSize,
    solvedCount,
    incorrectCount,
    accuracyPercent,
    confidence,
    confidencePercent: Math.round(confidence * 100),
    confidenceLevel: getConfidenceLevel(sampleSize),
    provisional: sampleSize < QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE,
    averageActiveDurationMs: Math.round(averageActiveDurationMs),
    averageDurationMs: Math.round(averageActiveDurationMs),
    durationScore: Math.round(durationScore * 10) / 10,
    incorrectResultScore: Math.round(incorrectResultScore * 10) / 10,
    timeCapMs: MOCK_EXAM_TASK_DIFFICULTY_TIME_CAP_MS,
  };
};

const collectAttemptObservations = ({
  observations,
  seenAttemptIds,
  studentId,
  exam,
  attempt,
  observedTasks,
  fallbackAttemptId,
}) => {
  if (!isRecord(attempt)) return;
  const examId = normalizeText(exam?.id);
  const attemptId = normalizeText(attempt.attemptId || fallbackAttemptId);
  const dedupeKey = attemptId ? `${studentId}\u0000${attemptId}` : '';
  if (dedupeKey && seenAttemptIds.has(dedupeKey)) return;
  if (dedupeKey) seenAttemptIds.add(dedupeKey);

  const answers = isRecord(attempt.answers) ? attempt.answers : {};
  const solved = isRecord(attempt.solved) ? attempt.solved : {};
  const taskDurationsMs = isRecord(attempt.taskDurationsMs) ? attempt.taskDurationsMs : {};
  const currentTasks = isRecord(exam?.tasks) ? exam.tasks : {};
  const snapshotTasks = isRecord(observedTasks) ? observedTasks : currentTasks;
  Object.entries(currentTasks).forEach(([rawTaskKey, currentTask]) => {
    const taskKey = normalizeText(rawTaskKey);
    if (!taskKey || !hasMatchingTaskVersion(currentTask, snapshotTasks[taskKey])) return;
    if (!hasAnswerValue(answers[taskKey])) return;
    const activeDurationMs = normalizeDurationMs(taskDurationsMs[taskKey]);
    if (activeDurationMs === null) return;
    observations.push({
      studentId,
      examId,
      attemptId,
      taskKey,
      taskId: getTaskVersionId(currentTask),
      activeDurationMs,
      durationMs: activeDurationMs,
      solved: solved[taskKey] === true,
    });
  });
};

export const collectMockExamTaskObservations = (progressDb, mockExams) => {
  if (!isRecord(progressDb)) return [];
  const exams = (Array.isArray(mockExams) ? mockExams : []).filter((exam) => (
    isRecord(exam) && normalizeText(exam.id) && isRecord(exam.tasks)
  ));
  if (exams.length === 0) return [];

  const examById = new Map(exams.map((exam) => [normalizeText(exam.id), exam]));
  const observations = [];
  const seenAttemptIds = new Set();

  Object.entries(progressDb).forEach(([rawStudentId, studentData]) => {
    const studentId = normalizeText(rawStudentId);
    if (!studentId || !isRecord(studentData)) return;

    const history = Array.isArray(studentData.mockAttemptResults) ? studentData.mockAttemptResults : [];
    history.forEach((result, resultIndex) => {
      if (!isRecord(result) || !isFinishedAttempt(result)) return;
      const examId = normalizeText(result.examId);
      const exam = examById.get(examId);
      if (!exam) return;
      const attempt = isRecord(result.attemptSnapshot)
        ? result.attemptSnapshot
        : {
            ...result,
            taskDurationsMs: result.taskDurationsMs,
          };
      collectAttemptObservations({
        observations,
        seenAttemptIds,
        studentId,
        exam,
        attempt,
        observedTasks: result.tasks,
        fallbackAttemptId: result.attemptId || `history:${resultIndex}`,
      });
    });

    const currentAttempts = isRecord(studentData.mockAttempts) ? studentData.mockAttempts : {};
    Object.entries(currentAttempts).forEach(([rawExamId, attempt]) => {
      const examId = normalizeText(rawExamId);
      const exam = examById.get(examId);
      if (!exam || !isObservableCurrentAttempt(attempt)) return;
      collectAttemptObservations({
        observations,
        seenAttemptIds,
        studentId,
        exam,
        attempt,
        observedTasks: exam.tasks,
        fallbackAttemptId: `current:${examId}`,
      });
    });
  });

  return observations;
};

export const buildMockExamTaskAnalyticsIndex = (progressDb, mockExams) => {
  const buckets = new Map();
  collectMockExamTaskObservations(progressDb, mockExams).forEach((observation) => {
    const bucketKey = JSON.stringify([observation.examId, observation.taskKey, observation.taskId]);
    const bucket = buckets.get(bucketKey) || {
      examId: observation.examId,
      taskKey: observation.taskKey,
      taskId: observation.taskId,
      observations: [],
    };
    bucket.observations.push(observation);
    buckets.set(bucketKey, bucket);
  });

  const index = {};
  buckets.forEach((bucket) => {
    const difficulty = calculateMockExamTaskDifficulty(bucket.observations);
    if (!difficulty) return;
    if (!Object.hasOwn(index, bucket.examId)) index[bucket.examId] = {};
    index[bucket.examId][bucket.taskKey] = {
      examId: bucket.examId,
      taskKey: bucket.taskKey,
      taskId: bucket.taskId,
      ...difficulty,
    };
  });
  return index;
};
