export const STANDARD_QUESTION_TIME_CAP_MS = 20 * 60 * 1000;
export const PYTHON_QUESTION_TIME_CAP_MS = 60 * 60 * 1000;
export const QUESTION_DIFFICULTY_WRONG_ATTEMPTS_CAP = 5;
export const QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE = 5;
export const QUESTION_DIFFICULTY_FULL_CONFIDENCE_SAMPLE_SIZE = 10;

export const QUESTION_DIFFICULTY_TIME_CAP_MS = Object.freeze({
  standard: STANDARD_QUESTION_TIME_CAP_MS,
  python: PYTHON_QUESTION_TIME_CAP_MS,
});

export const QUESTION_DIFFICULTY_WEIGHTS = Object.freeze({
  activeDuration: 0.6,
  wrongAttempts: 0.4,
});

const CATEGORY_ROWS = [
  {
    key: 'very_easy',
    label: 'Очень лёгкое',
    shortLabel: 'Очень легко',
    minScore: 0,
    maxScore: 19,
  },
  {
    key: 'easy',
    label: 'Лёгкое',
    shortLabel: 'Легко',
    minScore: 20,
    maxScore: 39,
  },
  {
    key: 'medium',
    label: 'Среднее',
    shortLabel: 'Средне',
    minScore: 40,
    maxScore: 59,
  },
  {
    key: 'hard',
    label: 'Сложное',
    shortLabel: 'Сложно',
    minScore: 60,
    maxScore: 79,
  },
  {
    key: 'very_hard',
    label: 'Очень сложное',
    shortLabel: 'Очень сложно',
    minScore: 80,
    maxScore: 100,
  },
];

export const QUESTION_DIFFICULTY_META = Object.freeze(
  Object.fromEntries(
    CATEGORY_ROWS.map((entry) => [entry.key, Object.freeze({ ...entry })])
  )
);

export const QUESTION_DIFFICULTY_CATEGORIES = Object.freeze(
  CATEGORY_ROWS.map((entry) => entry.key)
);

const isFiniteNonNegativeNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const average = (values) => (
  values.reduce((sum, value) => sum + value, 0) / values.length
);

const median = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

/**
 * Returns a winsorized mean based on the median absolute deviation (MAD).
 * Values outside three robust standard deviations are pulled to the boundary,
 * rather than discarded. For one or two values there is not enough information
 * to detect an outlier, so the ordinary mean is used.
 */
export const calculateRobustMean = (
  values,
  { minimum = 0, maximum = Number.POSITIVE_INFINITY, minimumScale = 0 } = {}
) => {
  const normalized = (Array.isArray(values) ? values : [])
    .filter(isFiniteNonNegativeNumber)
    .map((value) => clamp(value, minimum, maximum));
  if (normalized.length === 0) return null;
  if (normalized.length <= 2) return average(normalized);

  const center = median(normalized);
  const absoluteDeviations = normalized.map((value) => Math.abs(value - center));
  const mad = median(absoluteDeviations) || 0;
  const robustScale = Math.max(mad * 1.4826, minimumScale);
  if (robustScale <= 0) return center;

  const lowerBoundary = Math.max(minimum, center - (3 * robustScale));
  const upperBoundary = Math.min(maximum, center + (3 * robustScale));
  return average(
    normalized.map((value) => clamp(value, lowerBoundary, upperBoundary))
  );
};

const resolveIsPython = (options = {}) => {
  if (options?.isPython === true) return true;
  if (String(options?.type ?? '').trim().toLowerCase() === 'python') return true;
  if (String(options?.levelId ?? '').trim().toLowerCase() === 'python') return true;
  const taskNumber = Number(options?.taskNumber);
  return Number.isInteger(taskNumber) && taskNumber >= 100;
};

const getObservationDuration = (observation) => {
  if (isFiniteNonNegativeNumber(observation?.activeDurationMs)) {
    return observation.activeDurationMs;
  }
  if (isFiniteNonNegativeNumber(observation?.solveDurationMs)) {
    return observation.solveDurationMs;
  }
  return null;
};

const normalizeObservations = (observations, timeCapMs) => (
  (Array.isArray(observations) ? observations : []).reduce((result, observation) => {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
      return result;
    }
    const activeDurationMs = getObservationDuration(observation);
    const wrongAttempts = observation.wrongAttempts;
    if (activeDurationMs === null || !isFiniteNonNegativeNumber(wrongAttempts)) return result;
    result.push({
      activeDurationMs: Math.min(activeDurationMs, timeCapMs),
      wrongAttempts: Math.min(Math.floor(wrongAttempts), 50),
    });
    return result;
  }, [])
);

export const getQuestionDifficultyCategory = (score) => {
  if (!isFiniteNonNegativeNumber(score)) return null;
  const normalizedScore = clamp(Math.round(score), 0, 100);
  return CATEGORY_ROWS.find((entry) => normalizedScore <= entry.maxScore)?.key || 'very_hard';
};

export const getQuestionDifficultyMeta = (value) => {
  let category = '';
  if (typeof value === 'string') category = value;
  else if (typeof value === 'number') category = getQuestionDifficultyCategory(value) || '';
  else if (value && typeof value === 'object') {
    category = String(value.category ?? value.categoryKey ?? '').trim();
    if (!category && typeof value.score === 'number') {
      category = getQuestionDifficultyCategory(value.score) || '';
    }
  }
  return QUESTION_DIFFICULTY_META[category] || null;
};

export const hasEnoughQuestionDifficultyData = (difficulty, minimumSampleSize = 1) => {
  if (!difficulty || typeof difficulty !== 'object') return false;
  const numericSampleSize = Number(difficulty.sampleSize);
  if (!Number.isFinite(numericSampleSize)) return false;
  const sampleSize = Math.max(0, Math.floor(numericSampleSize));
  const normalizedMinimum = Number.isFinite(Number(minimumSampleSize))
    ? Math.max(1, Math.floor(Number(minimumSampleSize)))
    : 1;
  return sampleSize >= normalizedMinimum;
};

const getConfidenceLevel = (sampleSize) => {
  if (sampleSize < QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE) return 'low';
  if (sampleSize < QUESTION_DIFFICULTY_FULL_CONFIDENCE_SAMPLE_SIZE) return 'medium';
  return 'high';
};

/**
 * Calculates a 0-100 difficulty score from one observation per student.
 * Active solving time contributes 60%, wrong attempts before the first correct
 * answer contribute 40%.
 */
export const calculateQuestionDifficulty = (observations, options = {}) => {
  const isPython = resolveIsPython(options);
  const type = isPython ? 'python' : 'standard';
  const timeCapMs = QUESTION_DIFFICULTY_TIME_CAP_MS[type];
  const normalized = normalizeObservations(observations, timeCapMs);
  if (normalized.length === 0) return null;

  const averageActiveDurationMs = calculateRobustMean(
    normalized.map((entry) => entry.activeDurationMs),
    {
      maximum: timeCapMs,
      // 30 seconds for ordinary tasks, 90 seconds for Python. This prevents a
      // zero MAD in a small sample from turning every small difference into an outlier.
      minimumScale: timeCapMs / 40,
    }
  );
  const averageWrongAttempts = calculateRobustMean(
    normalized.map((entry) => entry.wrongAttempts),
    { maximum: 50, minimumScale: 1 }
  );
  const durationScore = clamp((averageActiveDurationMs / timeCapMs) * 100, 0, 100);
  const wrongAttemptsScore = clamp(
    (averageWrongAttempts / QUESTION_DIFFICULTY_WRONG_ATTEMPTS_CAP) * 100,
    0,
    100
  );
  const score = Math.round(
    (durationScore * QUESTION_DIFFICULTY_WEIGHTS.activeDuration)
      + (wrongAttemptsScore * QUESTION_DIFFICULTY_WEIGHTS.wrongAttempts)
  );
  const category = getQuestionDifficultyCategory(score);
  const sampleSize = normalized.length;
  const confidence = Math.round(
    Math.min(1, sampleSize / QUESTION_DIFFICULTY_FULL_CONFIDENCE_SAMPLE_SIZE) * 100
  ) / 100;

  return {
    score,
    category,
    categoryMeta: getQuestionDifficultyMeta(category),
    type,
    isPython,
    sampleSize,
    confidence,
    confidencePercent: Math.round(confidence * 100),
    confidenceLevel: getConfidenceLevel(sampleSize),
    provisional: sampleSize < QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE,
    averageActiveDurationMs: Math.round(averageActiveDurationMs),
    averageDurationMs: Math.round(averageActiveDurationMs),
    averageWrongAttempts: Math.round(averageWrongAttempts * 100) / 100,
    durationScore: Math.round(durationScore * 10) / 10,
    wrongAttemptsScore: Math.round(wrongAttemptsScore * 10) / 10,
    timeCapMs,
    wrongAttemptsCap: QUESTION_DIFFICULTY_WRONG_ATTEMPTS_CAP,
  };
};

export const formatQuestionDifficultyDuration = (durationMs) => {
  if (!isFiniteNonNegativeNumber(durationMs)) return '—';
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds <= 0) return '0 сек';
  if (totalSeconds < 60) return `${totalSeconds} сек`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return seconds > 0
      ? `${totalMinutes} мин ${seconds} сек`
      : `${totalMinutes} мин`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
};

const formatDecimal = (value) => {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace('.', ',');
};

const getStudentWord = (count) => {
  const absolute = Math.abs(Math.trunc(count));
  const lastTwoDigits = absolute % 100;
  const lastDigit = absolute % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'учеников';
  if (lastDigit === 1) return 'ученик';
  if (lastDigit >= 2 && lastDigit <= 4) return 'ученика';
  return 'учеников';
};

export const formatQuestionDifficultyTooltip = (difficulty) => {
  if (!difficulty || typeof difficulty !== 'object') return 'Недостаточно данных';
  const meta = getQuestionDifficultyMeta(difficulty);
  const score = isFiniteNonNegativeNumber(difficulty.score)
    ? `${clamp(Math.round(difficulty.score), 0, 100)}/100`
    : '—';
  const duration = formatQuestionDifficultyDuration(
    isFiniteNonNegativeNumber(difficulty.averageActiveDurationMs)
      ? difficulty.averageActiveDurationMs
      : difficulty.averageDurationMs
  );
  const wrongAttempts = formatDecimal(Number(difficulty.averageWrongAttempts));
  const sampleSize = Number.isFinite(Number(difficulty.sampleSize))
    ? Math.max(0, Math.floor(Number(difficulty.sampleSize)))
    : 0;
  const prefix = difficulty.provisional ? 'Предварительно: ' : '';
  return `${prefix}${meta?.label || 'Сложность'} · ${score} · Активное время: ${duration} · Ошибок до решения: ${wrongAttempts} · ${sampleSize} ${getStudentWord(sampleSize)}`;
};

// Compact aliases for consumers that do not need the question-specific prefix.
export const calculateDifficulty = calculateQuestionDifficulty;
export const getDifficultyCategory = getQuestionDifficultyCategory;
export const getDifficultyMeta = getQuestionDifficultyMeta;
export const formatDifficultyDuration = formatQuestionDifficultyDuration;
export const formatDifficultyTooltip = formatQuestionDifficultyTooltip;
