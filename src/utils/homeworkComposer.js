const normalizeText = (value) => String(value ?? '').trim();

const uniquePositiveIntegers = (values) => (
  Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0)
  )).sort((left, right) => left - right)
);

export const formatHomeworkQuestionRanges = (values) => {
  const numbers = uniquePositiveIntegers(values);
  if (numbers.length === 0) return '';
  const groups = [];
  let start = numbers[0];
  let end = numbers[0];
  for (let index = 1; index <= numbers.length; index += 1) {
    const value = numbers[index];
    if (value === end + 1) {
      end = value;
      continue;
    }
    groups.push(start === end ? String(start) : `${start}-${end}`);
    start = value;
    end = value;
  }
  return groups.join(', ');
};

const getGoalType = (goal) => {
  const type = normalizeText(goal?.type).toLowerCase();
  if (type === 'mock' || (!type && normalizeText(goal?.mockExamId))) return 'mock';
  return 'task';
};

const getHomeworkGoals = (homework) => {
  if (Array.isArray(homework?.goals) && homework.goals.length > 0) return homework.goals;
  const taskNumber = Number(homework?.taskNumber);
  const levelId = normalizeText(homework?.levelId);
  if (!Number.isFinite(taskNumber) || !levelId) return [];
  return [{
    type: 'task',
    taskNumber,
    levelId,
    includeAll: Boolean(homework?.includeAll),
    targetQuestions: Array.isArray(homework?.targetQuestions) ? homework.targetQuestions : [],
    targetQuestionIds: Array.isArray(homework?.targetQuestionIds) ? homework.targetQuestionIds : [],
  }];
};

const getQuestionList = (testsDb, taskNumber, levelId) => {
  const list = testsDb?.[String(taskNumber)]?.[levelId];
  return Array.isArray(list) ? list : [];
};

export const resolveHomeworkTaskTargetDescriptors = (goal, questions) => {
  const rawStoredIds = (Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [])
    .map(normalizeText);
  const storedNumbers = uniquePositiveIntegers(goal?.targetQuestions);
  const currentNumberById = new Map(
    questions.map((question, index) => [normalizeText(question?.id), index + 1])
  );

  if (rawStoredIds.some(Boolean)) {
    const resolved = [];
    const seenKeys = new Set();
    const snapshotLength = Math.max(rawStoredIds.length, storedNumbers.length);
    for (let index = 0; index < snapshotLength; index += 1) {
      const storedId = rawStoredIds[index] || '';
      let questionId = storedId;
      let questionNumber = storedId ? currentNumberById.get(storedId) || null : null;
      if (!storedId && index < storedNumbers.length) {
        questionNumber = storedNumbers[index];
        questionId = normalizeText(questions[questionNumber - 1]?.id);
      }
      if (!Number.isFinite(questionNumber) || questionNumber <= 0) continue;
      const key = questionId || `number:${questionNumber}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      resolved.push({ questionId, questionNumber });
    }
    return resolved.sort((left, right) => left.questionNumber - right.questionNumber);
  }

  const targetNumbers = goal?.includeAll
    ? questions.map((_, index) => index + 1)
    : storedNumbers;
  return targetNumbers.map((questionNumber) => ({
    questionNumber,
    questionId: normalizeText(questions[questionNumber - 1]?.id),
  }));
};

const parseTimestamp = (value) => {
  const timestamp = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getMockAttemptActivityMs = (attempt) => {
  const timestamps = [
    attempt?.updatedAt,
    attempt?.timerFinishedAt,
    attempt?.timerStartedAt,
    attempt?.modeLockedAt,
    attempt?.timerContinuedAt,
  ]
    .map(parseTimestamp)
    .filter((timestamp) => timestamp != null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

export const isMockAttemptForHomework = (attempt, homework) => {
  if (!attempt || typeof attempt !== 'object') return false;
  if (!homework || typeof homework !== 'object') return true;
  const attemptHomeworkId = normalizeText(attempt?.homeworkId);
  const homeworkId = normalizeText(homework?.id);
  const continuationOfHomeworkId = normalizeText(homework?.continuationOfHomeworkId);
  if (attemptHomeworkId && (homeworkId || continuationOfHomeworkId)) {
    return attemptHomeworkId === homeworkId || attemptHomeworkId === continuationOfHomeworkId;
  }
  if (!attemptHomeworkId && continuationOfHomeworkId) return true;
  const issuedAtMs = parseTimestamp(homework?.issuedAt);
  if (issuedAtMs == null) return true;
  const attemptActivityMs = getMockAttemptActivityMs(attempt);
  return attemptActivityMs != null && attemptActivityMs >= issuedAtMs;
};

const isQuestionCompletedForHomework = ({
  homework,
  studentData,
  taskNumber,
  levelId,
  questionId,
  solvedIds,
}) => {
  if (!questionId) return false;
  const issuedAtMs = parseTimestamp(homework?.issuedAt);
  if (issuedAtMs == null) return solvedIds.has(questionId);

  const answerHistory = studentData
    ?.solvedByTask
    ?.[String(taskNumber)]
    ?.[levelId]
    ?.answerHistory
    ?.[questionId];
  const correctAfterIssue = (Array.isArray(answerHistory) ? answerHistory : []).some((entry) => {
    if (entry?.correct !== true) return false;
    const submittedAtMs = parseTimestamp(entry?.submittedAt);
    return submittedAtMs != null && submittedAtMs >= issuedAtMs;
  });
  if (correctAfterIssue) return true;

  const solvedAfterIssue = (Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents : [])
    .some((event) => {
      if (Number(event?.taskNumber) !== Number(taskNumber)) return false;
      if (normalizeText(event?.levelId) !== levelId) return false;
      if (normalizeText(event?.questionId) !== questionId) return false;
      const solvedAtMs = parseTimestamp(event?.solvedAt);
      return solvedAtMs != null && solvedAtMs >= issuedAtMs;
    });
  return solvedAfterIssue;
};

const buildPendingTaskGoal = ({ goal, goalIndex, homework, studentData, testsDb }) => {
  const taskNumber = Number(goal?.taskNumber);
  const levelId = taskNumber >= 100 ? 'python' : (normalizeText(goal?.levelId) || 'basic');
  if (!Number.isFinite(taskNumber) || !levelId) return null;
  const questions = getQuestionList(testsDb, taskNumber, levelId);
  const targets = resolveHomeworkTaskTargetDescriptors(goal, questions);
  if (targets.length === 0) return null;
  const solved = studentData?.solvedByTask?.[String(taskNumber)]?.[levelId]?.solved;
  const solvedIds = new Set(
    (Array.isArray(solved) ? solved : []).map(normalizeText).filter(Boolean)
  );
  const pending = targets.filter((target) => !isQuestionCompletedForHomework({
    homework,
    studentData,
    taskNumber,
    levelId,
    questionId: target.questionId,
    solvedIds,
  }));
  if (pending.length === 0) return null;
  const sortedPending = [...pending].sort((left, right) => left.questionNumber - right.questionNumber);
  const targetQuestions = uniquePositiveIntegers(sortedPending.map((target) => target.questionNumber));
  const pendingByNumber = new Map(sortedPending.map((target) => [target.questionNumber, target]));
  const targetQuestionIds = targetQuestions
    .map((questionNumber) => normalizeText(pendingByNumber.get(questionNumber)?.questionId))
    .filter(Boolean);
  if (targetQuestions.length === 0) return null;
  return {
    type: 'task',
    taskNumber: String(taskNumber),
    levelId,
    includeAll: false,
    targetInput: formatHomeworkQuestionRanges(targetQuestions),
    targetQuestions,
    targetQuestionIds,
    mockExamId: '',
    origin: 'carryover',
    carryover: {
      sourceHomeworkId: normalizeText(homework?.id),
      sourceGoalIndex: goalIndex,
      originalCount: targets.length,
      remainingCount: targetQuestions.length,
    },
  };
};

const buildPendingMockGoal = ({ goal, goalIndex, homework, studentData, mockExamById }) => {
  const mockExamId = normalizeText(goal?.mockExamId);
  if (!mockExamId) return null;
  const exam = mockExamById[mockExamId];
  const storedTargetKeys = (Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [])
    .map(normalizeText)
    .filter(Boolean);
  const examTaskKeys = exam?.tasks && typeof exam.tasks === 'object'
    ? Object.keys(exam.tasks).map(normalizeText).filter(Boolean)
    : [];
  const targetTaskKeys = storedTargetKeys.length > 0 ? storedTargetKeys : examTaskKeys;
  const attempt = studentData?.mockAttempts?.[mockExamId];
  const issuedAtMs = parseTimestamp(homework?.issuedAt);
  const homeworkContext = {
    ...homework,
    continuationOfHomeworkId: normalizeText(goal?.continuationOfHomeworkId),
  };
  const attemptBelongsToAssignment = isMockAttemptForHomework(attempt, homeworkContext);
  const assignedMode = normalizeText(goal?.mode) || 'timer';
  const finishedTimerNeedsPractice = Boolean(
    attemptBelongsToAssignment
    && assignedMode === 'timer'
    && normalizeText(attempt?.timerFinishedAt)
  );
  const lifetimeSolved = attempt?.solvedEver && typeof attempt.solvedEver === 'object'
    ? attempt.solvedEver
    : (attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {});
  const currentSolved = attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {};
  const solved = attemptBelongsToAssignment
    ? (issuedAtMs == null ? lifetimeSolved : currentSolved)
    : {};
  const continuationOfHomeworkId = attemptBelongsToAssignment && !finishedTimerNeedsPractice
    ? (normalizeText(attempt?.homeworkId)
        || normalizeText(goal?.continuationOfHomeworkId)
        || normalizeText(homework?.id))
    : (finishedTimerNeedsPractice ? '' : normalizeText(homework?.id));
  const remainingTaskKeys = targetTaskKeys.filter((taskKey) => !solved?.[taskKey]);
  const unknownProgress = targetTaskKeys.length === 0;
  if (!unknownProgress && remainingTaskKeys.length === 0) return null;
  return {
    type: 'mock',
    taskNumber: '',
    levelId: 'basic',
    targetInput: '',
    includeAll: false,
    mockExamId,
    mode: finishedTimerNeedsPractice ? 'classic' : assignedMode,
    ...(remainingTaskKeys.length > 0 ? { targetTaskKeys: remainingTaskKeys } : {}),
    ...(continuationOfHomeworkId ? { continuationOfHomeworkId } : {}),
    origin: 'carryover',
    carryover: {
      sourceHomeworkId: normalizeText(homework?.id),
      sourceGoalIndex: goalIndex,
      originalCount: targetTaskKeys.length,
      remainingCount: unknownProgress ? null : remainingTaskKeys.length,
      remainingTaskKeys,
    },
  };
};

const getPendingChecklistLines = (homework) => {
  const stored = Array.isArray(homework?.checklistItems)
    ? homework.checklistItems
        .map((item) => ({
          text: normalizeText(item?.text),
          completed: Boolean(item?.completedAt),
        }))
        .filter((item) => item.text)
    : [];
  if (stored.length > 0) {
    return stored.filter((item) => !item.completed).map((item) => item.text);
  }
  return normalizeText(homework?.homeWork)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

export const buildHomeworkCarryoverDraft = ({
  homework = null,
  studentData = {},
  testsDb = {},
  mockExams = [],
} = {}) => {
  if (!homework || typeof homework !== 'object') {
    return {
      homeWork: '',
      goals: [],
      pendingChecklistLines: [],
      summary: { hasSourceHomework: false, pendingGoalCount: 0, pendingQuestionCount: 0, pendingChecklistCount: 0 },
    };
  }

  const mockExamById = (Array.isArray(mockExams) ? mockExams : []).reduce((result, exam) => {
    const id = normalizeText(exam?.id);
    if (id) result[id] = exam;
    return result;
  }, {});
  const goals = getHomeworkGoals(homework)
    .map((goal, goalIndex) => (
      getGoalType(goal) === 'mock'
        ? buildPendingMockGoal({ goal, goalIndex, homework, studentData, mockExamById })
        : buildPendingTaskGoal({ goal, goalIndex, homework, studentData, testsDb })
    ))
    .filter(Boolean);
  const pendingChecklistLines = getPendingChecklistLines(homework);
  const hasSourceHomework = Boolean(
    normalizeText(homework?.id)
    || normalizeText(homework?.issuedAt)
    || normalizeText(homework?.homeWork)
    || getHomeworkGoals(homework).length > 0
  );
  const pendingQuestionCount = goals.reduce((sum, goal) => {
    const remaining = Number(goal?.carryover?.remainingCount);
    return sum + (Number.isFinite(remaining) && remaining > 0 ? remaining : 0);
  }, 0);

  return {
    homeWork: pendingChecklistLines.join('\n'),
    goals,
    pendingChecklistLines,
    summary: {
      hasSourceHomework,
      sourceHomeworkId: normalizeText(homework?.id),
      pendingGoalCount: goals.length,
      pendingQuestionCount,
      pendingChecklistCount: pendingChecklistLines.length,
    },
  };
};
