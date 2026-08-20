import { createHash } from 'node:crypto';

export const MOCK_EXAM_FOLLOWUP_DEFAULT_LEVEL_ID = 'basic';
export const MOCK_EXAM_FOLLOWUP_LEVEL_IDS = Object.freeze(['basic', 'advanced', 'expert']);

const START_ANCHOR_KEY = '\u0000start';
const MOCK_GAME_THEORY_ANSWER_COUNTS = Object.freeze({
  19: 1,
  20: 2,
  21: 1,
});

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneValue = (value) => {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  if (!isRecord(value)) return value;
  return Object.entries(value).reduce((result, [key, entry]) => {
    result[key] = cloneValue(entry);
    return result;
  }, {});
};

const normalizeText = (value) => String(value ?? '').trim();

const normalizeTimestamp = (value) => {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
};

const normalizeTaskNumber = (value) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 27) return null;
  return number;
};

const getDestinationTaskNumber = (sourceTaskNumber) => (
  sourceTaskNumber === 20 || sourceTaskNumber === 21 ? 19 : sourceTaskNumber
);

const normalizeLevelId = (value) => {
  const levelId = normalizeText(value).toLowerCase();
  return MOCK_EXAM_FOLLOWUP_LEVEL_IDS.includes(levelId)
    ? levelId
    : MOCK_EXAM_FOLLOWUP_DEFAULT_LEVEL_ID;
};

const compareTaskKeys = (left, right) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), 'ru');
};

const uniqueTaskKeys = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean)
)).sort(compareTaskKeys);

const getQuestionId = (question) => {
  if (question?.id === null || typeof question?.id === 'undefined') return '';
  return normalizeText(question.id);
};

const buildStableSuffix = (value) => (
  createHash('sha256').update(String(value)).digest('hex').slice(0, 24)
);

export const buildMockExamFollowupSourceKey = ({ examId, attemptId, taskNumber } = {}) => {
  const normalizedExamId = normalizeText(examId);
  const normalizedAttemptId = normalizeText(attemptId);
  const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
  if (!normalizedExamId || !normalizedAttemptId || normalizedTaskNumber === null) return '';
  return `mock-exam:${normalizedExamId}:${normalizedAttemptId}:${normalizedTaskNumber}`;
};

export const buildMockExamFollowupQuestionId = (sourceKey) => {
  const normalizedSourceKey = normalizeText(sourceKey);
  if (!normalizedSourceKey) return '';
  return `mock-followup-question-${buildStableSuffix(normalizedSourceKey)}`;
};

export const normalizeMockExamFollowupHistory = (value) => {
  const source = Array.isArray(value) ? value : [];
  const seenAttemptIds = new Set();
  const normalized = [];

  source.forEach((entry) => {
    if (!isRecord(entry)) return;
    const attemptId = normalizeText(entry.attemptId);
    if (!attemptId || seenAttemptIds.has(attemptId)) return;
    seenAttemptIds.add(attemptId);
    normalized.push({
      ...cloneValue(entry),
      attemptId,
      examId: normalizeText(entry.examId),
      examTitle: normalizeText(entry.examTitle) || 'Пробник',
      finishedAt: normalizeTimestamp(entry.finishedAt) || normalizeText(entry.finishedAt),
      targetTaskKeys: uniqueTaskKeys(entry.targetTaskKeys),
    });
  });

  return normalized;
};

export const normalizeMockExamFollowupQueue = (value) => {
  const source = Array.isArray(value) ? value : [];
  const seenSourceKeys = new Set();
  const normalized = [];

  source.forEach((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.question)) return;
    const sourceKey = normalizeText(entry.sourceKey);
    const sourceMockTaskNumber = normalizeTaskNumber(entry.sourceMockTaskNumber);
    const destinationTaskNumber = normalizeTaskNumber(entry.destinationTaskNumber);
    if (
      !sourceKey
      || seenSourceKeys.has(sourceKey)
      || sourceMockTaskNumber === null
      || destinationTaskNumber === null
    ) {
      return;
    }

    const question = cloneValue(entry.question);
    const questionId = getQuestionId(question) || buildMockExamFollowupQuestionId(sourceKey);
    if (!questionId) return;

    const rawQueueOrder = Number(entry.queueOrder);
    const queueOrder = Number.isInteger(rawQueueOrder) && rawQueueOrder > 0
      ? rawQueueOrder
      : index + 1;
    const rawAnswerCountOverride = Number(
      entry.answerCountOverride ?? question.answerCountOverride
    );
    const answerCountOverride = Number.isInteger(rawAnswerCountOverride)
      && rawAnswerCountOverride > 0
      && rawAnswerCountOverride <= 50
      ? rawAnswerCountOverride
      : null;
    const mockExamSource = isRecord(question.mockExamSource)
      ? cloneValue(question.mockExamSource)
      : (isRecord(entry.mockExamSource) ? cloneValue(entry.mockExamSource) : null);

    question.id = questionId;
    question.sourceMockTaskNumber = sourceMockTaskNumber;
    if (answerCountOverride !== null) question.answerCountOverride = answerCountOverride;
    if (mockExamSource) question.mockExamSource = mockExamSource;

    seenSourceKeys.add(sourceKey);
    normalized.push({
      ...cloneValue(entry),
      id: normalizeText(entry.id) || `mock-followup-${buildStableSuffix(sourceKey)}`,
      sourceKey,
      attemptId: normalizeText(entry.attemptId),
      examId: normalizeText(entry.examId),
      examTitle: normalizeText(entry.examTitle) || 'Пробник',
      sourceMockTaskNumber,
      destinationTaskNumber,
      levelId: normalizeLevelId(entry.levelId),
      afterQuestionId: normalizeText(entry.afterQuestionId) || null,
      queuedAt: normalizeTimestamp(entry.queuedAt) || normalizeText(entry.queuedAt),
      queueOrder,
      ...(answerCountOverride !== null ? { answerCountOverride } : {}),
      ...(mockExamSource ? { mockExamSource } : {}),
      question,
      _inputIndex: index,
    });
  });

  normalized.sort((left, right) => (
    left.queueOrder - right.queueOrder
    || left._inputIndex - right._inputIndex
    || left.sourceKey.localeCompare(right.sourceKey, 'ru')
  ));

  return normalized.map((entry) => {
    const normalizedEntry = { ...entry };
    delete normalizedEntry._inputIndex;
    return normalizedEntry;
  });
};

const getQueueGroupKey = (taskNumber, levelId) => (
  `${String(taskNumber)}\u0000${String(levelId)}`
);

export const mergeMockExamFollowupQueueIntoTestsDb = ({
  testsDb,
  queue,
} = {}) => {
  const mergedDb = cloneValue(isRecord(testsDb) ? testsDb : {});
  const normalizedQueue = normalizeMockExamFollowupQueue(queue);
  const groupedQueue = new Map();

  normalizedQueue.forEach((entry) => {
    const groupKey = getQueueGroupKey(entry.destinationTaskNumber, entry.levelId);
    if (!groupedQueue.has(groupKey)) groupedQueue.set(groupKey, []);
    groupedQueue.get(groupKey).push(entry);
  });

  groupedQueue.forEach((entries) => {
    const firstEntry = entries[0];
    const taskKey = String(firstEntry.destinationTaskNumber);
    const levelId = firstEntry.levelId;
    const taskLevels = isRecord(mergedDb[taskKey]) ? mergedDb[taskKey] : {};
    const questions = Array.isArray(taskLevels[levelId]) ? taskLevels[levelId] : [];
    const insertionTailByAnchor = new Map();

    entries.forEach((entry) => {
      const question = cloneValue(entry.question);
      const questionId = getQuestionId(question);
      if (!questionId) return;

      const declaredAnchorId = normalizeText(entry.afterQuestionId);
      const anchorKey = declaredAnchorId || START_ANCHOR_KEY;
      const existingQuestionIndex = questions.findIndex((item) => getQuestionId(item) === questionId);
      if (existingQuestionIndex >= 0) {
        insertionTailByAnchor.set(anchorKey, questionId);
        return;
      }

      const previousTailId = insertionTailByAnchor.get(anchorKey);
      const previousTailIndex = previousTailId
        ? questions.findIndex((item) => getQuestionId(item) === previousTailId)
        : -1;
      let insertionIndex;
      if (previousTailIndex >= 0) {
        insertionIndex = previousTailIndex + 1;
      } else if (!declaredAnchorId) {
        insertionIndex = 0;
      } else {
        const anchorIndex = questions.findIndex((item) => getQuestionId(item) === declaredAnchorId);
        insertionIndex = anchorIndex >= 0 ? anchorIndex + 1 : questions.length;
      }

      questions.splice(insertionIndex, 0, question);
      insertionTailByAnchor.set(anchorKey, questionId);
    });

    mergedDb[taskKey] = {
      ...taskLevels,
      [levelId]: questions,
    };
  });

  return mergedDb;
};

const getLastSolvedQuestionId = ({
  testsDb,
  solvedByTask,
  taskNumber,
  levelId,
}) => {
  const questions = testsDb?.[String(taskNumber)]?.[levelId];
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const solved = solvedByTask?.[String(taskNumber)]?.[levelId]?.solved;
  const solvedIds = new Set(
    (Array.isArray(solved) ? solved : [])
      .map((questionId) => normalizeText(questionId))
      .filter(Boolean)
  );
  if (solvedIds.size === 0) return null;

  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const questionId = getQuestionId(questions[index]);
    if (questionId && solvedIds.has(questionId)) return questionId;
  }
  return null;
};

const resolveScopedTaskKeys = ({ examTasks, targetTaskKeys, attempt }) => {
  const availableTaskKeys = Object.keys(examTasks).sort(compareTaskKeys);
  const availableTaskKeySet = new Set(availableTaskKeys);
  const requestedTaskKeys = uniqueTaskKeys(
    Array.isArray(targetTaskKeys) ? targetTaskKeys : attempt?.targetTaskKeys
  );
  if (requestedTaskKeys.length === 0) return availableTaskKeys;
  return requestedTaskKeys.filter((taskKey) => availableTaskKeySet.has(taskKey));
};

const buildResultSnapshot = ({
  attemptId,
  exam,
  attempt,
  finishedAt,
  targetTaskKeys,
  queuedEntries,
}) => {
  const examId = normalizeText(exam.id);
  const examTitle = normalizeText(exam.title) || 'Пробник';
  return {
    id: attemptId,
    attemptId,
    examId,
    examTitle,
    status: 'finished',
    mode: normalizeText(attempt.mode),
    attemptNumber: Number.isInteger(Number(attempt.attemptNumber))
      ? Math.max(1, Number(attempt.attemptNumber))
      : 1,
    isFirstAttempt: attempt?.isFirstAttempt !== false
      && (!Number.isFinite(Number(attempt.attemptNumber)) || Number(attempt.attemptNumber) === 1),
    finishedAt,
    targetTaskKeys: [...targetTaskKeys],
    tasks: cloneValue(exam.tasks),
    answers: cloneValue(isRecord(attempt.answers) ? attempt.answers : {}),
    solved: cloneValue(isRecord(attempt.solved) ? attempt.solved : {}),
    examSnapshot: cloneValue(exam),
    attemptSnapshot: cloneValue(attempt),
    queuedSourceKeys: queuedEntries.map((entry) => entry.sourceKey),
  };
};

export const finalizeMockExamFollowup = ({
  history,
  queue,
  exam,
  attempt,
  attemptId,
  finishedAt,
  targetTaskKeys,
  testsDb,
  solvedByTask,
} = {}) => {
  if (!isRecord(exam) || !isRecord(exam.tasks)) {
    throw new TypeError('exam with tasks is required');
  }
  if (!isRecord(attempt)) {
    throw new TypeError('attempt is required');
  }

  const normalizedAttemptId = normalizeText(attemptId ?? attempt.attemptId);
  const examId = normalizeText(exam.id);
  const normalizedFinishedAt = normalizeTimestamp(
    finishedAt ?? attempt.timerFinishedAt ?? attempt.finishedAt ?? attempt.updatedAt
  );
  if (!normalizedAttemptId) throw new TypeError('attemptId is required');
  if (!examId) throw new TypeError('exam.id is required');
  if (!normalizedFinishedAt) throw new TypeError('finishedAt is required');

  const normalizedHistory = normalizeMockExamFollowupHistory(history);
  const normalizedQueue = normalizeMockExamFollowupQueue(queue);
  const existingResult = normalizedHistory.find((entry) => entry.attemptId === normalizedAttemptId);
  if (existingResult) {
    return {
      history: normalizedHistory,
      queue: normalizedQueue,
      result: cloneValue(existingResult),
      queuedEntries: [],
      reused: true,
    };
  }

  const scopedTaskKeys = resolveScopedTaskKeys({
    examTasks: exam.tasks,
    targetTaskKeys,
    attempt,
  });
  const solvedMap = isRecord(attempt.solved) ? attempt.solved : {};
  const knownSourceKeys = new Set(normalizedQueue.map((entry) => entry.sourceKey));
  let nextQueueOrder = normalizedQueue.reduce(
    (maximum, entry) => Math.max(maximum, entry.queueOrder),
    0
  );
  let nextQueue = [...normalizedQueue];
  const queuedEntries = [];

  scopedTaskKeys.forEach((taskKey) => {
    if (solvedMap[taskKey] === true) return;
    const sourceMockTaskNumber = normalizeTaskNumber(taskKey);
    const sourceQuestion = exam.tasks[taskKey];
    if (sourceMockTaskNumber === null || !isRecord(sourceQuestion)) return;

    const sourceKey = buildMockExamFollowupSourceKey({
      examId,
      attemptId: normalizedAttemptId,
      taskNumber: sourceMockTaskNumber,
    });
    if (!sourceKey || knownSourceKeys.has(sourceKey)) return;

    const destinationTaskNumber = getDestinationTaskNumber(sourceMockTaskNumber);
    const levelId = normalizeLevelId(sourceQuestion.sourceLevelId);
    const currentPersonalTestsDb = mergeMockExamFollowupQueueIntoTestsDb({
      testsDb,
      queue: nextQueue,
    });
    const afterQuestionId = getLastSolvedQuestionId({
      testsDb: currentPersonalTestsDb,
      solvedByTask,
      taskNumber: destinationTaskNumber,
      levelId,
    });
    const examTitle = normalizeText(exam.title) || 'Пробник';
    const label = `Задание из пробника «${examTitle}»`;
    const mockExamSource = {
      examId,
      examTitle,
      taskNumber: sourceMockTaskNumber,
      label,
    };
    const answerCountOverride = MOCK_GAME_THEORY_ANSWER_COUNTS[sourceMockTaskNumber] || null;
    const question = {
      ...cloneValue(sourceQuestion),
      id: buildMockExamFollowupQuestionId(sourceKey),
      sourceMockTaskNumber,
      mockExamSource,
      ...(answerCountOverride !== null ? { answerCountOverride } : {}),
    };
    nextQueueOrder += 1;
    const queueEntry = {
      id: `mock-followup-${buildStableSuffix(sourceKey)}`,
      sourceKey,
      attemptId: normalizedAttemptId,
      examId,
      examTitle,
      sourceMockTaskNumber,
      destinationTaskNumber,
      levelId,
      afterQuestionId,
      queuedAt: normalizedFinishedAt,
      queueOrder: nextQueueOrder,
      mockExamSource,
      ...(answerCountOverride !== null ? { answerCountOverride } : {}),
      question,
    };
    nextQueue.push(queueEntry);
    queuedEntries.push(cloneValue(queueEntry));
    knownSourceKeys.add(sourceKey);
  });

  nextQueue = normalizeMockExamFollowupQueue(nextQueue);
  const result = buildResultSnapshot({
    attemptId: normalizedAttemptId,
    exam,
    attempt,
    finishedAt: normalizedFinishedAt,
    targetTaskKeys: scopedTaskKeys,
    queuedEntries,
  });
  const nextHistory = normalizeMockExamFollowupHistory([
    ...normalizedHistory,
    result,
  ]);

  return {
    history: nextHistory,
    queue: nextQueue,
    result: cloneValue(result),
    queuedEntries,
    reused: false,
  };
};
