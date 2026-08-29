import { isMockAttemptForHomework, resolveHomeworkTaskTargetDescriptors } from './homeworkComposer.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const HOMEWORK_STAT_STATE = Object.freeze({
  CLEAN: 'clean',
  WITH_ERRORS: 'with-errors',
  WRONG: 'wrong',
  UNTOUCHED: 'untouched',
});

const LEVEL_LABELS = {
  basic: 'Базовый',
  advanced: 'Продвинутый',
  expert: 'Экспертный',
  python: 'Python',
};

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const asTimestamp = (value) => {
  const timestamp = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(timestamp) ? timestamp : null;
};

const normalizeText = (value) => String(value ?? '').trim();

const hasAnswerValue = (value) => {
  if (Array.isArray(value)) return value.some((item) => normalizeText(item));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => hasAnswerValue(item));
  }
  return Boolean(normalizeText(value));
};

const isCompletedState = (state) => (
  state === HOMEWORK_STAT_STATE.CLEAN || state === HOMEWORK_STAT_STATE.WITH_ERRORS
);

const getHomeworkTitle = (entry, chronologicalIndex) => {
  const firstLine = normalizeText(entry?.homeWork)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine) {
    const compact = firstLine.replace(/\s+/g, ' ');
    return compact.length > 92 ? `${compact.slice(0, 89)}…` : compact;
  }
  return `Домашняя работа №${chronologicalIndex + 1}`;
};

const resolveHomeworkDueAtMs = (entry, issuedAtMs) => {
  const explicit = asTimestamp(entry?.dueAt);
  if (explicit != null) return explicit;
  if (issuedAtMs == null) return null;
  const rawDays = Number(entry?.daysToComplete);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.round(rawDays) : 7;
  return issuedAtMs + (days * DAY_MS);
};

const getGoalType = (goal) => {
  const type = normalizeText(goal?.type).toLowerCase();
  if (type === 'mock' || (!type && normalizeText(goal?.mockExamId))) return 'mock';
  return 'task';
};

const getHomeworkGoals = (entry) => {
  if (Array.isArray(entry?.goals) && entry.goals.length > 0) return entry.goals;
  const taskNumber = Number(entry?.taskNumber);
  const levelId = normalizeText(entry?.levelId);
  if (!Number.isFinite(taskNumber) || !levelId) return [];
  return [{
    type: 'task',
    taskNumber,
    levelId,
    includeAll: Boolean(entry?.includeAll),
    targetQuestions: Array.isArray(entry?.targetQuestions) ? entry.targetQuestions : [],
  }];
};

const getStoredTargetQuestionIds = (goal) => (
  Array.from(new Set(
    (Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [])
      .map(normalizeText)
      .filter(Boolean)
  ))
);

const getStoredTargetQuestionIdSnapshot = (goal) => {
  const snapshot = (Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [])
    .map(normalizeText);
  return snapshot.some(Boolean) ? snapshot : [];
};

const getTaskTargetDescriptors = (goal, testsDb) => {
  const taskNumber = Number(goal?.taskNumber);
  if (!Number.isFinite(taskNumber)) return [];
  const levelId = taskNumber >= 100 ? 'python' : normalizeText(goal?.levelId);
  if (!levelId) return [];
  const questions = testsDb?.[String(taskNumber)]?.[levelId];
  if (!Array.isArray(questions) || questions.length === 0) return [];

  return resolveHomeworkTaskTargetDescriptors(goal, questions)
    .filter((item) => item.questionId);
};

const getAnswerHistory = (studentData, taskNumber, levelId, questionId) => {
  const history = studentData
    ?.solvedByTask
    ?.[String(taskNumber)]
    ?.[levelId]
    ?.answerHistory
    ?.[questionId];
  return (Array.isArray(history) ? history : [])
    .map((entry) => ({
      submittedAt: asTimestamp(entry?.submittedAt),
      correct: entry?.correct === true,
    }))
    .filter((entry) => entry.submittedAt != null)
    .sort((left, right) => left.submittedAt - right.submittedAt);
};

const buildSolvedEventIndex = (studentData) => {
  const result = new Map();
  (Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents : []).forEach((event) => {
    const taskNumber = Number(event?.taskNumber);
    const levelId = normalizeText(event?.levelId);
    const questionId = normalizeText(event?.questionId);
    const solvedAt = asTimestamp(event?.solvedAt);
    if (!Number.isFinite(taskNumber) || !levelId || !questionId || solvedAt == null) return;
    const key = `${taskNumber}\u001f${levelId}\u001f${questionId}`;
    const list = result.get(key) || [];
    list.push(solvedAt);
    result.set(key, list);
  });
  result.forEach((list) => list.sort((left, right) => left - right));
  return result;
};

const filterTimesToWindow = (times, startMs, endMs) => (
  (Array.isArray(times) ? times : []).filter((timestamp) => (
    (startMs == null || timestamp >= startMs)
    && (endMs == null || timestamp < endMs)
  ))
);

const classifyAttempts = ({
  attempts,
  solvedEventTimes,
  checkpointMs,
  fallbackSolved = false,
}) => {
  const limitedAttempts = checkpointMs == null
    ? attempts
    : attempts.filter((entry) => entry.submittedAt <= checkpointMs);
  const limitedSolvedEvents = checkpointMs == null
    ? solvedEventTimes
    : solvedEventTimes.filter((timestamp) => timestamp <= checkpointMs);
  const correctAttempts = limitedAttempts.filter((entry) => entry.correct);
  const wrongAttempts = limitedAttempts.filter((entry) => !entry.correct);
  const completedAt = correctAttempts[0]?.submittedAt ?? limitedSolvedEvents[0] ?? null;
  const completed = completedAt != null || fallbackSolved;
  const wrongCount = wrongAttempts.length;
  let state = HOMEWORK_STAT_STATE.UNTOUCHED;
  if (completed) {
    state = wrongCount > 0 ? HOMEWORK_STAT_STATE.WITH_ERRORS : HOMEWORK_STAT_STATE.CLEAN;
  } else if (wrongCount > 0) {
    state = HOMEWORK_STAT_STATE.WRONG;
  }
  return {
    state,
    completedAt,
    attemptCount: limitedAttempts.length + (limitedAttempts.length === 0 && limitedSolvedEvents.length > 0 ? 1 : 0),
    wrongCount,
  };
};

const buildTaskGoal = ({
  goal,
  goalIndex,
  studentData,
  testsDb,
  solvedEventIndex,
  windowStartMs,
  windowEndMs,
  checkpointMs,
  dueAtMs,
  isLatest,
}) => {
  const taskNumber = Number(goal?.taskNumber);
  if (!Number.isFinite(taskNumber)) return null;
  const levelId = taskNumber >= 100 ? 'python' : normalizeText(goal?.levelId);
  if (!levelId) return null;
  const targets = getTaskTargetDescriptors(goal, testsDb);
  if (targets.length === 0) return null;
  const solvedList = studentData?.solvedByTask?.[String(taskNumber)]?.[levelId]?.solved;
  const solvedSet = new Set(
    (Array.isArray(solvedList) ? solvedList : []).map(normalizeText).filter(Boolean)
  );

  const items = targets.map((target) => {
    const history = getAnswerHistory(studentData, taskNumber, levelId, target.questionId);
    const attempts = history.filter((entry) => (
      (windowStartMs == null || entry.submittedAt >= windowStartMs)
      && (windowEndMs == null || entry.submittedAt < windowEndMs)
    ));
    const eventKey = `${taskNumber}\u001f${levelId}\u001f${target.questionId}`;
    const eventTimes = filterTimesToWindow(
      solvedEventIndex.get(eventKey),
      windowStartMs,
      windowEndMs
    );
    const hasTimestampedCompletion = attempts.some((entry) => entry.correct) || eventTimes.length > 0;
    const useLifetimeFallback = isLatest && !hasTimestampedCompletion && solvedSet.has(target.questionId);
    const current = classifyAttempts({
      attempts,
      solvedEventTimes: eventTimes,
      checkpointMs: null,
      fallbackSolved: useLifetimeFallback,
    });
    const atCheckpoint = classifyAttempts({
      attempts,
      solvedEventTimes: eventTimes,
      checkpointMs,
      fallbackSolved: useLifetimeFallback,
    });
    return {
      id: `${taskNumber}-${levelId}-${target.questionId}`,
      label: `№${target.questionNumber}`,
      questionNumber: target.questionNumber,
      questionId: target.questionId,
      ...current,
      checkpointState: atCheckpoint.state,
      checkpointWrongCount: atCheckpoint.wrongCount,
      completedLate: current.completedAt != null && dueAtMs != null && current.completedAt > dueAtMs,
      estimated: useLifetimeFallback,
    };
  });

  const levelLabel = LEVEL_LABELS[levelId] || levelId;
  return {
    id: `task-${goalIndex}-${taskNumber}-${levelId}`,
    type: 'task',
    label: taskNumber >= 100
      ? `Python · тема ${taskNumber}`
      : `Задание ${taskNumber} · ${levelLabel}`,
    taskNumber,
    levelId,
    items,
    estimated: items.some((item) => item.estimated) || getStoredTargetQuestionIds(goal).length === 0,
  };
};

const getMockAttemptActivityMs = (attempt) => {
  const candidates = [
    attempt?.updatedAt,
    attempt?.timerFinishedAt,
    attempt?.timerStartedAt,
    attempt?.modeLockedAt,
  ]
    .map(asTimestamp)
    .filter((timestamp) => timestamp != null);
  return candidates.length > 0 ? Math.max(...candidates) : null;
};

const getMockTargetKeys = (goal, exam) => {
  const stored = Array.from(new Set(
    (Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [])
      .map(normalizeText)
      .filter(Boolean)
  ));
  if (stored.length > 0) return stored;
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  return Object.keys(tasks).map(normalizeText).filter(Boolean);
};

export const snapshotHomeworkGoalTargets = ({
  goals = [],
  testsDb = {},
  mockExams = [],
} = {}) => {
  const examById = (Array.isArray(mockExams) ? mockExams : []).reduce((result, exam) => {
    const id = normalizeText(exam?.id);
    if (id) result[id] = exam;
    return result;
  }, {});

  return (Array.isArray(goals) ? goals : []).map((goal) => {
    if (!goal || typeof goal !== 'object') return goal;
    if (getGoalType(goal) === 'mock') {
      const storedTaskKeys = getMockTargetKeys(goal, null);
      const mockExamId = normalizeText(goal.mockExamId);
      const targetTaskKeys = storedTaskKeys.length > 0
        ? storedTaskKeys
        : getMockTargetKeys(goal, examById[mockExamId]);
      return targetTaskKeys.length > 0 ? { ...goal, targetTaskKeys } : { ...goal };
    }

    const storedQuestionIds = getStoredTargetQuestionIdSnapshot(goal);
    if (storedQuestionIds.length > 0) {
      return { ...goal, targetQuestionIds: storedQuestionIds };
    }
    const targetQuestionIds = getTaskTargetDescriptors(goal, testsDb)
      .map((target) => target.questionId)
      .filter(Boolean);
    return targetQuestionIds.length > 0 ? { ...goal, targetQuestionIds } : { ...goal };
  });
};

const buildMockGoal = ({
  goal,
  goalIndex,
  examById,
  attemptByExamId,
  windowStartMs,
  windowEndMs,
  checkpointMs,
  dueAtMs,
  homework,
}) => {
  const mockExamId = normalizeText(goal?.mockExamId);
  if (!mockExamId) return null;
  const exam = examById[mockExamId];
  const targetKeys = getMockTargetKeys(goal, exam);
  if (targetKeys.length === 0) return null;
  const attempt = attemptByExamId?.[mockExamId];
  const activityMs = getMockAttemptActivityMs(attempt);
  const isInsideWindow = activityMs != null
    && (windowStartMs == null || activityMs >= windowStartMs)
    && (windowEndMs == null || activityMs < windowEndMs);
  const homeworkContext = homework
    ? { ...homework, continuationOfHomeworkId: goal?.continuationOfHomeworkId }
    : null;
  const attemptMatchesHomework = !homeworkContext || isMockAttemptForHomework(attempt, homeworkContext);
  const hasAssignmentId = Boolean(normalizeText(attempt?.homeworkId));
  const canUseAttempt = Boolean(attempt)
    && attemptMatchesHomework
    && (hasAssignmentId || isInsideWindow);
  const resultAtMs = canUseAttempt ? activityMs : null;
  const answers = canUseAttempt && attempt?.answers && typeof attempt.answers === 'object'
    ? attempt.answers
    : {};
  const solved = canUseAttempt && attempt?.solved && typeof attempt.solved === 'object'
    ? attempt.solved
    : {};
  const solvedEver = canUseAttempt && attempt?.solvedEver && typeof attempt.solvedEver === 'object'
    ? attempt.solvedEver
    : solved;
  const useLifetimeFallback = windowStartMs == null && !hasAssignmentId;

  const items = targetKeys.map((taskKey) => {
    const answered = hasAnswerValue(answers?.[taskKey]);
    const solvedNow = Boolean(solved?.[taskKey]);
    const completedEver = Boolean(solvedEver?.[taskKey]);
    const completed = solvedNow || (useLifetimeFallback && completedEver);
    const hasWrongResult = answered && !solvedNow;
    const state = completed
      ? (hasWrongResult ? HOMEWORK_STAT_STATE.WITH_ERRORS : HOMEWORK_STAT_STATE.CLEAN)
      : (hasWrongResult ? HOMEWORK_STAT_STATE.WRONG : HOMEWORK_STAT_STATE.UNTOUCHED);
    const isKnownAtCheckpoint = resultAtMs == null || checkpointMs == null || resultAtMs <= checkpointMs;
    const checkpointState = isKnownAtCheckpoint ? state : HOMEWORK_STAT_STATE.UNTOUCHED;
    return {
      id: `mock-${mockExamId}-${taskKey}`,
      label: `№${taskKey}`,
      questionNumber: taskKey,
      questionId: taskKey,
      state,
      checkpointState,
      completedAt: completed ? resultAtMs : null,
      attemptCount: answered ? 1 : 0,
      wrongCount: hasWrongResult ? 1 : 0,
      checkpointWrongCount: isKnownAtCheckpoint && hasWrongResult ? 1 : 0,
      completedLate: completed && resultAtMs != null && dueAtMs != null && resultAtMs > dueAtMs,
      estimated: true,
    };
  });

  return {
    id: `mock-${goalIndex}-${mockExamId}`,
    type: 'mock',
    label: `Пробник · ${normalizeText(exam?.title) || 'без названия'}`,
    mockExamId,
    items,
    estimated: true,
  };
};

const buildChecklist = (entry, windowEndMs, checkpointMs, dueAtMs) => {
  const items = (Array.isArray(entry?.checklistItems) ? entry.checklistItems : [])
    .map((item, index) => {
      const text = normalizeText(item?.text);
      if (!text) return null;
      const completedAt = asTimestamp(item?.completedAt);
      const completedInWindow = completedAt != null && (windowEndMs == null || completedAt < windowEndMs);
      const completedAtCheckpoint = completedInWindow
        && (checkpointMs == null || completedAt <= checkpointMs);
      return {
        id: normalizeText(item?.id) || `checklist-${index}`,
        label: text,
        state: completedInWindow ? HOMEWORK_STAT_STATE.CLEAN : HOMEWORK_STAT_STATE.UNTOUCHED,
        checkpointState: completedAtCheckpoint
          ? HOMEWORK_STAT_STATE.CLEAN
          : HOMEWORK_STAT_STATE.UNTOUCHED,
        completedAt: completedInWindow ? completedAt : null,
        attemptCount: completedInWindow ? 1 : 0,
        wrongCount: 0,
        checkpointWrongCount: 0,
        completedLate: completedInWindow && dueAtMs != null && completedAt > dueAtMs,
        estimated: false,
      };
    })
    .filter(Boolean);
  return {
    totalCount: items.length,
    completedCount: items.filter((item) => isCompletedState(item.state)).length,
    items,
  };
};

const summarizeItems = (items, stateField = 'state') => {
  const list = Array.isArray(items) ? items : [];
  const counts = {
    totalCount: list.length,
    completedCount: 0,
    cleanCount: 0,
    withErrorsCount: 0,
    wrongCount: 0,
    untouchedCount: 0,
  };
  list.forEach((item) => {
    const state = item?.[stateField] || HOMEWORK_STAT_STATE.UNTOUCHED;
    if (state === HOMEWORK_STAT_STATE.CLEAN) {
      counts.cleanCount += 1;
      counts.completedCount += 1;
    } else if (state === HOMEWORK_STAT_STATE.WITH_ERRORS) {
      counts.withErrorsCount += 1;
      counts.completedCount += 1;
    } else if (state === HOMEWORK_STAT_STATE.WRONG) {
      counts.wrongCount += 1;
    } else {
      counts.untouchedCount += 1;
    }
  });
  counts.percent = counts.totalCount > 0
    ? clampPercent((counts.completedCount / counts.totalCount) * 100)
    : null;
  return counts;
};

const getEntryStatus = (summary) => {
  if (!summary || summary.totalCount <= 0) return 'no-data';
  if (summary.percent === 100 && summary.withErrorsCount === 0 && summary.wrongCount === 0) {
    return 'excellent';
  }
  if (summary.percent === 100) return 'complete';
  if (summary.wrongCount > 0) return 'attention';
  if (summary.completedCount > 0) return 'in-progress';
  return 'not-started';
};

export const getAcademicYearMeta = (value) => {
  const timestamp = typeof value === 'number' ? value : asTimestamp(value);
  const date = timestamp == null ? null : new Date(timestamp);
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 8 ? year : year - 1;
  return {
    key: String(startYear),
    startYear,
    endYear: startYear + 1,
    label: `${startYear}/${String(startYear + 1).slice(-2)}`,
  };
};

export const buildHomeworkStatistics = ({
  homeworks = [],
  studentData = {},
  testsDb = {},
  mockExams = [],
  mockAttemptsByExam = {},
  nowMs = Date.now(),
} = {}) => {
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const sorted = (Array.isArray(homeworks) ? homeworks : [])
    .map((entry, sourceIndex) => ({
      entry: entry && typeof entry === 'object' ? entry : {},
      sourceIndex,
      issuedAtMs: asTimestamp(entry?.issuedAt),
    }))
    .sort((left, right) => {
      if (left.issuedAtMs != null && right.issuedAtMs != null) {
        return left.issuedAtMs - right.issuedAtMs || right.sourceIndex - left.sourceIndex;
      }
      if (left.issuedAtMs != null) return 1;
      if (right.issuedAtMs != null) return -1;
      return right.sourceIndex - left.sourceIndex;
    });
  const solvedEventIndex = buildSolvedEventIndex(studentData);
  const examById = (Array.isArray(mockExams) ? mockExams : []).reduce((result, exam) => {
    const id = normalizeText(exam?.id);
    if (id) result[id] = exam;
    return result;
  }, {});
  const attemptByExamId = {
    ...(studentData?.mockAttempts && typeof studentData.mockAttempts === 'object'
      ? studentData.mockAttempts
      : {}),
    ...(mockAttemptsByExam && typeof mockAttemptsByExam === 'object' ? mockAttemptsByExam : {}),
  };

  return sorted.map((prepared, chronologicalIndex) => {
    const { entry, issuedAtMs } = prepared;
    const nextIssuedAtMs = sorted[chronologicalIndex + 1]?.issuedAtMs ?? null;
    const windowStartMs = issuedAtMs;
    const windowEndMs = nextIssuedAtMs != null && nextIssuedAtMs > (issuedAtMs ?? Number.NEGATIVE_INFINITY)
      ? nextIssuedAtMs
      : safeNowMs + 1;
    const dueAtMs = resolveHomeworkDueAtMs(entry, issuedAtMs);
    const checkpointMs = dueAtMs == null
      ? windowEndMs - 1
      : Math.min(dueAtMs, windowEndMs - 1, safeNowMs);
    const isLatest = chronologicalIndex === sorted.length - 1;
    const goals = getHomeworkGoals(entry)
      .map((goal, goalIndex) => (
        getGoalType(goal) === 'mock'
          ? buildMockGoal({
              goal,
              goalIndex,
              examById,
              attemptByExamId,
              windowStartMs,
              windowEndMs,
              checkpointMs,
              dueAtMs,
              homework: entry,
            })
          : buildTaskGoal({
              goal,
              goalIndex,
              studentData,
              testsDb,
              solvedEventIndex,
              windowStartMs,
              windowEndMs,
              checkpointMs,
              dueAtMs,
              isLatest,
            })
      ))
      .filter(Boolean);
    const goalItems = goals.flatMap((goal) => goal.items);
    const checklist = buildChecklist(entry, windowEndMs, checkpointMs, dueAtMs);
    const measuredItems = goalItems.length > 0 ? goalItems : checklist.items;
    const summary = summarizeItems(measuredItems);
    const checkpointSummary = summarizeItems(measuredItems, 'checkpointState');
    const completedTimes = measuredItems
      .map((item) => item.completedAt)
      .filter((timestamp) => timestamp != null);
    const completedAtMs = summary.percent === 100 && completedTimes.length > 0
      ? Math.max(...completedTimes)
      : null;
    const academicYear = getAcademicYearMeta(issuedAtMs ?? safeNowMs);

    return {
      id: normalizeText(entry?.id) || normalizeText(entry?.issuedAt) || `homework-${chronologicalIndex + 1}`,
      number: chronologicalIndex + 1,
      title: getHomeworkTitle(entry, chronologicalIndex),
      issuedAt: issuedAtMs == null ? '' : new Date(issuedAtMs).toISOString(),
      dueAt: dueAtMs == null ? '' : new Date(dueAtMs).toISOString(),
      windowEndAt: new Date(windowEndMs - 1).toISOString(),
      academicYear,
      isLatest,
      isOverdue: dueAtMs != null && dueAtMs < safeNowMs && summary.percent !== 100,
      completedAt: completedAtMs == null ? '' : new Date(completedAtMs).toISOString(),
      completedOnTime: summary.percent === 100 && (
        dueAtMs == null
          ? null
          : (completedAtMs == null ? null : completedAtMs <= dueAtMs)
      ),
      lateCompletedCount: measuredItems.filter((item) => item.completedLate).length,
      totalWrongAttempts: measuredItems.reduce((sum, item) => sum + (Number(item.wrongCount) || 0), 0),
      status: getEntryStatus(summary),
      estimated: issuedAtMs == null || goals.some((goal) => goal.estimated),
      goals,
      checklist,
      ...summary,
      checkpointPercent: checkpointSummary.percent,
      checkpointCompletedCount: checkpointSummary.completedCount,
      checkpointWrongCount: checkpointSummary.wrongCount,
    };
  });
};

export const summarizeHomeworkStatistics = (entries = []) => {
  const measurable = (Array.isArray(entries) ? entries : []).filter((entry) => entry.totalCount > 0);
  const averagePercent = measurable.length > 0
    ? clampPercent(
        measurable.reduce((sum, entry) => sum + (Number(entry.percent) || 0), 0) / measurable.length
      )
    : 0;
  const fullyCompletedCount = measurable.filter((entry) => entry.percent === 100).length;
  const onTimeCount = measurable.filter((entry) => entry.completedOnTime === true).length;
  const withErrorsCount = measurable.filter((entry) => (
    entry.withErrorsCount > 0 || entry.wrongCount > 0
  )).length;
  const incompleteCount = measurable.filter((entry) => entry.percent < 100).length;
  const recent = measurable.slice(-3);
  const previous = measurable.slice(-6, -3);
  const recentAverage = recent.length > 0
    ? recent.reduce((sum, entry) => sum + entry.percent, 0) / recent.length
    : 0;
  const previousAverage = previous.length > 0
    ? previous.reduce((sum, entry) => sum + entry.percent, 0) / previous.length
    : recentAverage;

  return {
    homeworkCount: measurable.length,
    averagePercent,
    fullyCompletedCount,
    onTimeCount,
    withErrorsCount,
    incompleteCount,
    trend: Math.round(recentAverage - previousAverage),
  };
};

export const isHomeworkReadyForOverallStatistics = (entry, nowMs = Date.now()) => {
  if (!entry || Number(entry.totalCount) <= 0) return false;
  if (Number(entry.percent) >= 100) return true;
  if (entry.isOverdue === true) return true;
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const dueAtMs = asTimestamp(entry.dueAt);
  if (dueAtMs != null) return dueAtMs <= safeNowMs;
  const windowEndAtMs = asTimestamp(entry.windowEndAt);
  return windowEndAtMs != null && windowEndAtMs < safeNowMs;
};
