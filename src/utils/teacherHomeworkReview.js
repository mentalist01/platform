import { getQuestionDifficultyCategory } from './questionDifficulty.js';

const normalizeKey = (value) => String(value ?? '').trim();

const DIFFICULTY_CATEGORY_ORDER = Object.freeze({
  very_easy: 0,
  easy: 1,
  medium: 2,
  hard: 3,
  very_hard: 4,
});

export const getTeacherHomeworkReviewDifficultyDetails = (item) => {
  const difficulty = item?.difficulty
    || item?.questionDifficulty
    || item?.question?.difficulty
    || null;
  const scoreCandidate = item?.difficultyScore
    ?? difficulty?.score
    ?? item?.question?.difficultyScore;
  const score = Number(scoreCandidate);
  const categoryCandidate = String(difficulty?.category ?? difficulty?.categoryKey ?? '').trim();
  const category = categoryCandidate || getQuestionDifficultyCategory(score);
  const duration = Number(
    difficulty?.averageDurationMs
      ?? difficulty?.averageActiveDurationMs
      ?? item?.averageDurationMs
  );
  return {
    categoryRank: Number.isInteger(DIFFICULTY_CATEGORY_ORDER[category])
      ? DIFFICULTY_CATEGORY_ORDER[category]
      : null,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : null,
    score: Number.isFinite(score) ? score : null,
  };
};

export const compareTeacherHomeworkReviewDifficulty = (leftItem, rightItem, direction = 1) => {
  const left = getTeacherHomeworkReviewDifficultyDetails(leftItem);
  const right = getTeacherHomeworkReviewDifficultyDetails(rightItem);
  const leftScoreKnown = left.score !== null;
  const rightScoreKnown = right.score !== null;
  if (!leftScoreKnown && !rightScoreKnown) return 0;
  if (!leftScoreKnown) return 1;
  if (!rightScoreKnown) return -1;
  if (left.score !== right.score) return (left.score - right.score) * direction;

  const leftCategoryKnown = left.categoryRank !== null;
  const rightCategoryKnown = right.categoryRank !== null;
  if (leftCategoryKnown && rightCategoryKnown && left.categoryRank !== right.categoryRank) {
    return (left.categoryRank - right.categoryRank) * direction;
  }
  if (!leftCategoryKnown && !rightCategoryKnown) return 0;
  if (!leftCategoryKnown) return 1;
  if (!rightCategoryKnown) return -1;
  if (left.duration !== null && right.duration !== null && left.duration !== right.duration) {
    return (left.duration - right.duration) * direction;
  }
  if (left.duration === null && right.duration !== null) return 1;
  if (left.duration !== null && right.duration === null) return -1;
  return 0;
};

const hasAnswerValue = (value) => {
  if (Array.isArray(value)) return value.some((entry) => normalizeKey(entry));
  if (value && typeof value === 'object') {
    return hasAnswerValue(value.answers ?? value.answer);
  }
  return Boolean(normalizeKey(value));
};

const findQuestion = (questions, questionId, questionNumber) => {
  const list = Array.isArray(questions) ? questions : [];
  const normalizedId = normalizeKey(questionId);
  if (normalizedId) {
    const byId = list.find((question) => normalizeKey(question?.id) === normalizedId);
    if (byId) return byId;
  }
  const index = Math.max(0, Math.floor(Number(questionNumber) || 1) - 1);
  return list[index] || null;
};

const normalizeMockAnswers = (attempt, taskKey) => {
  const answers = attempt?.answers && typeof attempt.answers === 'object'
    ? attempt.answers[taskKey]
    : null;
  if (Array.isArray(answers)) return answers.map((value) => String(value ?? ''));
  return typeof answers === 'undefined' || answers === null ? [] : [String(answers)];
};

const normalizeSolveDurationMs = (value) => {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.max(1, Math.round(durationMs));
};

const getHistorySolveDurationMs = (history) => {
  const entries = Array.isArray(history) ? history : [];
  const firstCorrect = entries.find((entry) => (
    entry?.correct === true && normalizeSolveDurationMs(entry?.solveDurationMs) !== null
  ));
  if (firstCorrect) return normalizeSolveDurationMs(firstCorrect.solveDurationMs);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const durationMs = normalizeSolveDurationMs(entries[index]?.solveDurationMs);
    if (durationMs !== null) return durationMs;
  }
  return null;
};

export const buildTeacherHomeworkReviewItems = ({
  goalViews = [],
  testsDb = {},
  mockExamById = {},
  mockAttemptsByExam = {},
  levels = {},
  formatTaskNumber = (value) => String(value ?? ''),
} = {}) => {
  const result = [];

  (Array.isArray(goalViews) ? goalViews : []).forEach((goalView, goalIndex) => {
    const targetStatus = Array.isArray(goalView?.targetStatus) ? goalView.targetStatus : [];
    if (goalView?.type === 'mock') {
      const mockExamId = normalizeKey(goalView.mockExamId);
      const exam = mockExamById?.[mockExamId];
      const attempt = mockAttemptsByExam?.[mockExamId];
      targetStatus.forEach((target, targetIndex) => {
        const taskKey = normalizeKey(target?.taskKey ?? target?.taskNumber ?? target?.label);
        if (!taskKey) return;
        const question = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks[taskKey] : null;
        const studentAnswers = normalizeMockAnswers(attempt, taskKey);
        result.push({
          key: `mock:${goalIndex}:${mockExamId}:${taskKey}`,
          sourceType: 'mock',
          goalIndex,
          targetIndex,
          mockExamId,
          mockExamTitle: normalizeKey(exam?.title) || 'Пробник',
          taskNumber: Number.isFinite(Number(taskKey)) ? Number(taskKey) : taskKey,
          taskDisplay: formatTaskNumber(taskKey) || taskKey,
          levelId: 'mock',
          levelLabel: 'Пробник',
          questionId: taskKey,
          questionNumber: target?.label || taskKey,
          question: question && typeof question === 'object' ? question : {},
          solved: Boolean(target?.solved),
          attempted: hasAnswerValue(studentAnswers),
          studentAnswers,
          answerHistory: [],
          solveDurationMs: normalizeSolveDurationMs(attempt?.taskDurationsMs?.[taskKey]),
          optional: goalView?.assignmentTier === 'optional',
        });
      });
      return;
    }

    const taskNumber = Number(goalView?.taskNumber);
    const levelId = normalizeKey(goalView?.levelId);
    if (!Number.isFinite(taskNumber) || !levelId) return;
    const questions = testsDb?.[String(taskNumber)]?.[levelId];
    const levelLabel = levels?.[levelId.toUpperCase()]?.label || levelId;
    targetStatus.forEach((target, targetIndex) => {
      const questionId = normalizeKey(target?.questionId);
      const questionNumber = Math.max(1, Math.floor(Number(target?.num) || targetIndex + 1));
      const question = findQuestion(questions, questionId, questionNumber);
      const resolvedQuestionId = normalizeKey(question?.id) || questionId;
      if (!resolvedQuestionId && !question) return;
      result.push({
        key: `task:${goalIndex}:${taskNumber}:${levelId}:${resolvedQuestionId || questionNumber}`,
        sourceType: 'task',
        goalIndex,
        targetIndex,
        taskNumber,
        taskDisplay: formatTaskNumber(taskNumber) || String(taskNumber),
        levelId,
        levelLabel,
        questionId: resolvedQuestionId,
        questionNumber,
        question: question && typeof question === 'object' ? question : {},
        solved: Boolean(target?.solved),
        attempted: false,
        studentAnswers: [],
        answerHistory: [],
        solveDurationMs: null,
        optional: goalView?.assignmentTier === 'optional',
      });
    });
  });

  return result;
};

export const mergeTeacherHomeworkReviewTaskProgress = (items, scopeResults = {}) => (
  (Array.isArray(items) ? items : []).map((item) => {
    if (item?.sourceType !== 'task') return item;
    const scopeKey = `${item.taskNumber}|${item.levelId}`;
    const scope = scopeResults?.[scopeKey] || {};
    const questionId = normalizeKey(item.questionId);
    const solvedIds = scope.solvedIds instanceof Set ? scope.solvedIds : new Set();
    const history = Array.isArray(scope?.historyById?.[questionId])
      ? scope.historyById[questionId]
      : [];
    const latestAttempt = history[history.length - 1] || null;
    const studentAnswers = Array.isArray(latestAttempt?.answers)
      ? latestAttempt.answers.map((value) => String(value ?? ''))
      : item.studentAnswers;
    return {
      ...item,
      solved: solvedIds.has(questionId),
      attempted: history.length > 0,
      studentAnswers,
      answerHistory: history,
      solveDurationMs: getHistorySolveDurationMs(history),
    };
  })
);

export const getPendingTeacherHomeworkReviewItems = (items) => (
  (Array.isArray(items) ? items : []).filter((item) => !item?.solved)
);

export const filterTeacherHomeworkReviewItems = (items, filter = 'all') => {
  const list = Array.isArray(items) ? items : [];
  if (filter === 'completed') return list.filter((item) => item?.solved);
  if (filter === 'pending') return list.filter((item) => !item?.solved);
  return list;
};

export const sortTeacherHomeworkReviewItems = (items, sort = 'assignment') => {
  const list = (Array.isArray(items) ? items : []).map((item, index) => ({ item, index }));
  if (!['fastest', 'slowest', 'easiest', 'hardest'].includes(sort)) return list.map(({ item }) => item);
  if (sort === 'easiest' || sort === 'hardest') {
    const direction = sort === 'easiest' ? 1 : -1;
    return list
      .sort((left, right) => {
        return compareTeacherHomeworkReviewDifficulty(left.item, right.item, direction)
          || left.index - right.index;
      })
      .map(({ item }) => item);
  }
  const direction = sort === 'fastest' ? 1 : -1;
  return list
    .sort((left, right) => {
      const leftDuration = normalizeSolveDurationMs(left.item?.solveDurationMs);
      const rightDuration = normalizeSolveDurationMs(right.item?.solveDurationMs);
      if (leftDuration === null && rightDuration === null) return left.index - right.index;
      if (leftDuration === null) return 1;
      if (rightDuration === null) return -1;
      if (leftDuration !== rightDuration) return (leftDuration - rightDuration) * direction;
      return left.index - right.index;
    })
    .map(({ item }) => item);
};
