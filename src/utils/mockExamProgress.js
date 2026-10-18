import { getAcademicYearMeta } from './homeworkStats.js';
import { resolveMockExamForAttempt } from './mockExamVersioning.js';
import { isAssignedMockAttempt } from './mockExamAssignment.js';

import {getMockPrimaryScoreFromSolved,getMockSecondaryScoreFromSolved,getMockSecondaryScoreFromPrimary} from './mockExamScore.js';
export {getMockPrimaryScoreFromSolved,getMockSecondaryScoreFromSolved,getMockSecondaryScoreFromPrimary};
import {mockAttemptMonth,getMonthlyMockAttemptPolicy} from './monthlyMockAttemptPolicy.js';

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

const getTaskMap = (tasks) => {
  if (tasks && typeof tasks === 'object' && !Array.isArray(tasks)) return tasks;
  if (!Array.isArray(tasks)) return {};
  return tasks.reduce((result, task, index) => {
    const taskKey = normalizeText(
      task?.taskKey
      ?? task?.key
      ?? task?.taskNumber
      ?? task?.number
      ?? task?.id
      ?? index + 1
    );
    if (taskKey) result[taskKey] = task;
    return result;
  }, {});
};

const getAttemptScope = (exam, attempt) => {
  const solved = attempt?.solved && typeof attempt.solved === 'object'
    ? attempt.solved
    : {};
  const examTasks = getTaskMap(exam?.tasks);
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

const hasSolvedMap = (attempt) => Boolean(
  attempt?.solved
  && typeof attempt.solved === 'object'
  && !Array.isArray(attempt.solved)
);

const isFinishedAttempt = (attempt) => Boolean(
  normalizeText(attempt?.finishedAt)
  || normalizeText(attempt?.timerFinishedAt)
  || normalizeText(attempt?.status).toLowerCase() === 'finished'
);

export const buildMockExamProgressEntries = ({
  studentData = {},
  mockExams = [],
  mockAttemptsByExam = {},
  assignedOnly = false,
  includeRetakes = false,
  studentCreatedAt = '',
  teacherId = '',
} = {}) => {
  const examById = (Array.isArray(mockExams) ? mockExams : []).reduce((result, exam) => {
    const examId = normalizeText(exam?.id);
    if (examId) result[examId] = exam;
    return result;
  }, {});
  const attemptByExamId = mockAttemptsByExam && typeof mockAttemptsByExam === 'object'
    ? mockAttemptsByExam
    : {};
  const frozenResults = Array.isArray(studentData?.mockAttemptResults)
    ? studentData.mockAttemptResults
    : [];
  const frozenAttemptIds = new Set(
    frozenResults.map((result) => normalizeText(result?.attemptId)).filter(Boolean)
  );

  const frozenEntries = frozenResults
    .map((result, index) => {
      if (!result || typeof result !== 'object') return null;
      const examId = normalizeText(result.examId);
      const finishedAtMs = parseDateMs(result.finishedAt);
      if (finishedAtMs == null) return null;
      const currentAttempt = attemptByExamId[examId];
      const currentMatchesResult = Boolean(
        currentAttempt
        && normalizeText(currentAttempt.attemptId)
        && normalizeText(currentAttempt.attemptId) === normalizeText(result.attemptId)
        && isFinishedAttempt(currentAttempt)
      );
      const scoreAttempt = currentMatchesResult && hasSolvedMap(currentAttempt)
        ? currentAttempt
        : result;
      const frozenTasks = getTaskMap(result.tasks);
      const exam = Object.keys(frozenTasks).length > 0
        ? { ...(examById[examId] || {}), tasks: frozenTasks }
        : (examById[examId] || null);
      if (assignedOnly && !isAssignedMockAttempt({ examId, exam, attempt: result, studentData, teacherId })) return null;
      const scope = getAttemptScope(exam, scoreAttempt);
      if (scope.isPartial) return null;
      const resultId = normalizeText(result.resultId ?? result.id)
        || `${normalizeText(result.attemptId) || examId || 'result'}-${index}-${finishedAtMs}`;
      const storedSecondaryScore = clampScore(result.secondaryScore);
      const calculatedSecondaryScore = hasSolvedMap(scoreAttempt)
        ? getMockSecondaryScoreFromSolved(scope.solvedMap)
        : null;
      return {
        id: `online-result:${resultId}`,
        examId,
        attemptId: normalizeText(result.attemptId),
        source: 'online',
        monthlyMockMonth: mockAttemptMonth(scoreAttempt, exam, teacherId) || mockAttemptMonth(result, exam, teacherId),
        mode: normalizeText(result.mode).toLowerCase() || 'classic',
        ...(Number.isInteger(Number(result.attemptNumber)) && Number(result.attemptNumber) > 0
          ? { attemptNumber: Number(result.attemptNumber) }
          : {}),
        ...(typeof result.isFirstAttempt === 'boolean'
          ? { isFirstAttempt: result.isFirstAttempt }
          : {}),
        title: normalizeText(result.examTitle ?? result.title)
          || normalizeText(exam?.title)
          || 'Онлайн-пробник',
        comment: '',
        score: calculatedSecondaryScore ?? storedSecondaryScore ?? 0,
        dateMs: finishedAtMs,
        date: new Date(finishedAtMs).toISOString(),
        academicYear: getAcademicYearMeta(finishedAtMs),
      };
    })
    .filter(Boolean);

  const onlineEntries = Object.entries(attemptByExamId)
    .map(([rawExamId, attempt]) => {
      if (!attempt || typeof attempt !== 'object') return null;
      const attemptId = normalizeText(attempt.attemptId);
      if (attemptId && frozenAttemptIds.has(attemptId)) return null;
      const examId = normalizeText(rawExamId);
      const mode = normalizeText(attempt.mode).toLowerCase() || 'classic';
      const timerFinishedAt = normalizeText(attempt.timerFinishedAt);
      if (mode === 'timer' && !timerFinishedAt) return null;
      const exam = resolveMockExamForAttempt(examById[examId] || null, attempt);
      if (assignedOnly && !isAssignedMockAttempt({ examId, exam: examById[examId] || exam, attempt, studentData, teacherId })) return null;
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
        attemptId,
        source: 'online',
        monthlyMockMonth: mockAttemptMonth(attempt, exam, teacherId),
        mode,
        ...(Number.isInteger(Number(attempt.attemptNumber)) && Number(attempt.attemptNumber) > 0
          ? { attemptNumber: Number(attempt.attemptNumber) }
          : {}),
        ...(typeof attempt.isFirstAttempt === 'boolean'
          ? { isFirstAttempt: attempt.isFirstAttempt }
          : {}),
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

  const onlineByExamHasFirstAttemptMarker = new Set(
    [...frozenEntries, ...onlineEntries]
      .filter((entry) => entry?.examId && (
        entry?.isFirstAttempt === true
        || (Number.isInteger(Number(entry?.attemptNumber)) && Number(entry?.attemptNumber) > 0)
      ))
      .map((entry) => entry.examId)
  );
  const firstAttemptEntries = [...frozenEntries, ...onlineEntries].filter((entry) => (
    !entry?.examId
    || !onlineByExamHasFirstAttemptMarker.has(entry.examId)
    || entry.isFirstAttempt === true
    || Number(entry.attemptNumber) === 1
  ));

  const bestMonthly = new Map();
  for (const entry of [...frozenEntries, ...onlineEntries]) {
    if (!entry.monthlyMockMonth) continue;
    const policy = getMonthlyMockAttemptPolicy({studentData:{...studentData,mockAttempts:attemptByExamId},exams:mockExams,exam:examById[entry.examId] || {id:entry.examId},teacherId,month:entry.monthlyMockMonth,studentCreatedAt});
    if ((Number(entry.attemptNumber) || 1) > policy.maxAttempts) continue;
    const key = `${entry.examId}:${entry.monthlyMockMonth}`;
    const previous = bestMonthly.get(key);
    if (!previous || entry.score > previous.score || entry.score === previous.score && entry.dateMs < previous.dateMs) {
      bestMonthly.set(key,{...entry,isBestAttempt:true,attemptsLimit:policy.maxAttempts,attemptsUsed:policy.usedAttempts});
    }
  }
  return [...storedEntries, ...(includeRetakes ? [...frozenEntries, ...onlineEntries] : [
    ...firstAttemptEntries.filter(entry => !entry.monthlyMockMonth), ...bestMonthly.values(),
  ])]
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
