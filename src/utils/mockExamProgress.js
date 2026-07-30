import { getAcademicYearMeta } from './homeworkStats.js';

const PRIMARY_TO_SECONDARY = {
  1: 7,
  2: 14,
  3: 20,
  4: 27,
  5: 34,
  6: 40,
  7: 43,
  8: 46,
  9: 48,
  10: 51,
  11: 54,
  12: 56,
  13: 59,
  14: 62,
  15: 64,
  16: 67,
  17: 70,
  18: 72,
  19: 75,
  20: 78,
  21: 80,
  22: 83,
  23: 85,
  24: 88,
  25: 90,
  26: 93,
  27: 95,
  28: 98,
  29: 100,
};

const normalizeText = (value) => String(value ?? '').trim();

const clampScore = (value) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const parseDateMs = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const calendarDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (calendarDateMatch) {
    const [, year, month, day] = calendarDateMatch;
    const localNoon = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
    if (
      Number.isNaN(localNoon.getTime())
      || localNoon.getFullYear() !== Number(year)
      || localNoon.getMonth() !== Number(month) - 1
      || localNoon.getDate() !== Number(day)
    ) {
      return null;
    }
    return localNoon.getTime();
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const hasAnswerValue = (value) => {
  if (Array.isArray(value)) return value.some(hasAnswerValue);
  if (value == null) return false;
  return normalizeText(value).length > 0;
};

const getAttemptScope = (exam, attempt) => {
  const solved = attempt?.solved && typeof attempt.solved === 'object'
    ? attempt.solved
    : {};
  const examTasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  const availableTaskKeys = Object.keys(examTasks).map(normalizeText).filter(Boolean);
  const availableTaskKeySet = new Set(availableTaskKeys);
  const attemptTargetTaskKeys = Array.from(new Set(
    (Array.isArray(attempt?.targetTaskKeys) ? attempt.targetTaskKeys : [])
      .map(normalizeText)
      .filter(Boolean)
  ));
  const examTargetTaskKeys = Array.from(new Set(
    (Array.isArray(exam?.requiredTargetTaskKeys) ? exam.requiredTargetTaskKeys : [])
      .map(normalizeText)
      .filter(Boolean)
  ));
  const requestedTaskKeys = attemptTargetTaskKeys.length > 0
    ? attemptTargetTaskKeys
    : (normalizeText(attempt?.homeworkId) ? [] : examTargetTaskKeys);
  const scopedTaskKeys = requestedTaskKeys.length > 0
    ? requestedTaskKeys.filter((taskKey) => (
        availableTaskKeySet.size === 0 || availableTaskKeySet.has(taskKey)
      ))
    : (availableTaskKeys.length > 0 ? availableTaskKeys : Object.keys(solved));
  const requestedTaskKeySet = new Set(scopedTaskKeys);
  const isPartial = availableTaskKeys.length > 0
    && requestedTaskKeys.length > 0
    && availableTaskKeys.some((taskKey) => !requestedTaskKeySet.has(taskKey));
  const solvedMap = scopedTaskKeys.reduce((result, taskKey) => {
    result[taskKey] = Boolean(solved[taskKey]);
    return result;
  }, {});

  return {
    availableTaskKeys,
    taskKeys: scopedTaskKeys,
    solvedMap,
    isPartial,
  };
};

export const getMockPrimaryScoreFromSolved = (solvedMap) => {
  const solved = solvedMap && typeof solvedMap === 'object' ? solvedMap : {};
  return Array.from({ length: 27 }, (_, index) => index + 1).reduce((sum, taskNumber) => (
    solved[String(taskNumber)]
      ? sum + ([26, 27].includes(taskNumber) ? 2 : 1)
      : sum
  ), 0);
};

export const getMockSecondaryScoreFromSolved = (solvedMap) => {
  const primaryScore = Math.max(0, Math.min(29, getMockPrimaryScoreFromSolved(solvedMap)));
  return primaryScore > 0 ? PRIMARY_TO_SECONDARY[primaryScore] || 0 : 0;
};

export const buildMockExamProgressEntries = ({
  studentData = {},
  mockExams = [],
  mockAttemptsByExam = {},
} = {}) => {
  const examById = (Array.isArray(mockExams) ? mockExams : []).reduce((result, exam) => {
    const examId = normalizeText(exam?.id);
    if (examId) result[examId] = exam;
    return result;
  }, {});
  const attemptByExamId = mockAttemptsByExam && typeof mockAttemptsByExam === 'object'
    ? mockAttemptsByExam
    : {};

  const onlineEntries = Object.entries(attemptByExamId)
    .map(([rawExamId, attempt]) => {
      if (!attempt || typeof attempt !== 'object') return null;
      const examId = normalizeText(rawExamId);
      const mode = normalizeText(attempt.mode).toLowerCase() || 'classic';
      const timerFinishedAt = normalizeText(attempt.timerFinishedAt);
      if (mode === 'timer' && !timerFinishedAt) return null;
      const exam = examById[examId] || null;
      const scope = getAttemptScope(exam, attempt);
      if (scope.isPartial) return null;
      if (mode !== 'timer') {
        const answers = attempt.answers && typeof attempt.answers === 'object'
          ? attempt.answers
          : {};
        const hasCompleteAnswerSet = scope.availableTaskKeys.length > 0
          && scope.taskKeys.length === scope.availableTaskKeys.length
          && scope.taskKeys.every((taskKey) => hasAnswerValue(answers[taskKey]));
        if (!hasCompleteAnswerSet) return null;
      }
      const completedAtMs = [
        timerFinishedAt,
        attempt.updatedAt,
        attempt.modeLockedAt,
        attempt.timerStartedAt,
      ].map(parseDateMs).find((timestamp) => timestamp != null);
      if (completedAtMs == null) return null;
      return {
        id: `online:${examId}`,
        examId,
        source: 'online',
        mode,
        title: normalizeText(exam?.title) || 'Онлайн-пробник',
        comment: '',
        score: getMockSecondaryScoreFromSolved(scope.solvedMap),
        dateMs: completedAtMs,
        date: new Date(completedAtMs).toISOString(),
        academicYear: getAcademicYearMeta(completedAtMs),
      };
    })
    .filter(Boolean);

  const storedEntries = (Array.isArray(studentData?.mocks) ? studentData.mocks : [])
    .map((entry, index) => {
      const dateMs = parseDateMs(entry?.date || entry?.createdAt);
      const score = clampScore(entry?.score);
      if (dateMs == null || score == null) return null;
      const id = normalizeText(entry?.id) || `stored-${index}-${dateMs}`;
      return {
        id: `stored:${id}`,
        source: 'stored',
        mode: 'recorded',
        title: normalizeText(entry?.title) || 'Пробник',
        comment: normalizeText(entry?.comment),
        score,
        dateMs,
        date: new Date(dateMs).toISOString(),
        academicYear: getAcademicYearMeta(dateMs),
      };
    })
    .filter(Boolean);

  return [...storedEntries, ...onlineEntries]
    .sort((left, right) => (
      left.dateMs - right.dateMs
      || left.source.localeCompare(right.source)
      || left.id.localeCompare(right.id)
    ));
};

export const summarizeMockExamProgress = (entries = []) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (safeEntries.length === 0) {
    return {
      count: 0,
      firstScore: null,
      latestScore: null,
      delta: null,
      bestScore: null,
      averageScore: null,
    };
  }
  const scores = safeEntries.map((entry) => Number(entry?.score) || 0);
  const firstScore = scores[0];
  const latestScore = scores[scores.length - 1];
  return {
    count: safeEntries.length,
    firstScore,
    latestScore,
    delta: latestScore - firstScore,
    bestScore: Math.max(...scores),
    averageScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
  };
};
