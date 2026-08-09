const normalizeKey = (value) => String(value ?? '').trim();

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
    };
  })
);

export const getPendingTeacherHomeworkReviewItems = (items) => (
  (Array.isArray(items) ? items : []).filter((item) => !item?.solved)
);
