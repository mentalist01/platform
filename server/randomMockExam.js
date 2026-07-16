export const PERSONAL_RANDOM_MOCK_SOURCE = 'personal-random';
export const PERSONAL_RANDOM_MOCK_LEVEL_ID = 'basic';
export const PERSONAL_RANDOM_MOCK_LEVEL_IDS = Object.freeze(['basic', 'advanced']);

const MOCK_TASK_NUMBERS = Array.from({ length: 27 }, (_, index) => index + 1);
const SOURCE_TASK_NUMBERS = MOCK_TASK_NUMBERS.filter((taskNumber) => taskNumber !== 20 && taskNumber !== 21);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeLevelId = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return PERSONAL_RANDOM_MOCK_LEVEL_IDS.includes(normalized) ? normalized : '';
};

const getQuestionId = (question) => {
  const value = question?.id;
  if (value === null || typeof value === 'undefined') return '';
  return String(value).trim();
};

const getExpectedAnswers = (question, count) => {
  if (!isRecord(question)) return Array.from({ length: count }, () => '');
  if (count <= 1) {
    const directAnswer = question.answer;
    if (directAnswer !== null && typeof directAnswer !== 'undefined' && String(directAnswer).trim()) {
      return [directAnswer];
    }
    const answers = Array.isArray(question.answers) ? question.answers : [];
    if (answers.length > 0) return [answers[0]];
    const fallback = Array.isArray(question.options) ? question.options[question.correctIndex] : '';
    return [fallback ?? ''];
  }
  if (Array.isArray(question.answers) && question.answers.length > 0) {
    return Array.from({ length: count }, (_, index) => question.answers[index] ?? '');
  }
  return Array.from({ length: count }, (_, index) => {
    const key = index === 0 ? 'answer' : `answer${index + 1}`;
    return question[key] ?? '';
  });
};

const replaceQuestionAnswers = (question, answers) => {
  const next = { ...question };
  delete next.answer;
  delete next.answers;
  Object.keys(next).forEach((key) => {
    if (/^answer\d+$/i.test(key)) delete next[key];
  });
  if (answers.length <= 1) next.answer = answers[0] ?? '';
  else next.answers = [...answers];
  return next;
};

export const normalizeRandomMockSolvedByTask = (value) => {
  const source = isRecord(value) ? value : {};
  const normalized = {};
  Object.entries(source).forEach(([taskNumber, storedValue]) => {
    const numericTaskNumber = Number(taskNumber);
    if (!Number.isInteger(numericTaskNumber) || numericTaskNumber < 1 || numericTaskNumber > 27) return;
    const sourceByLevel = Array.isArray(storedValue)
      ? { [PERSONAL_RANDOM_MOCK_LEVEL_ID]: storedValue }
      : (isRecord(storedValue) ? storedValue : {});
    const normalizedByLevel = {};
    PERSONAL_RANDOM_MOCK_LEVEL_IDS.forEach((levelId) => {
      const questionIds = sourceByLevel[levelId];
      if (!Array.isArray(questionIds)) return;
      const ids = Array.from(new Set(
        questionIds.map((questionId) => String(questionId ?? '').trim()).filter(Boolean)
      ));
      if (ids.length > 0) normalizedByLevel[levelId] = ids;
    });
    if (Object.keys(normalizedByLevel).length > 0) {
      normalized[String(numericTaskNumber)] = normalizedByLevel;
    }
  });
  return normalized;
};

export const getPersonalRandomMockLevelId = (exam) => {
  const directLevelId = normalizeLevelId(exam?.randomLevelId);
  if (directLevelId) return directLevelId;
  const taskLevelId = Object.values(isRecord(exam?.tasks) ? exam.tasks : {})
    .map((question) => normalizeLevelId(question?.sourceLevelId))
    .find(Boolean);
  return taskLevelId || PERSONAL_RANDOM_MOCK_LEVEL_ID;
};

export const collectSolvedPersonalRandomMockQuestions = ({
  exams,
  mockAttempts,
  previousSolvedByTask,
  studentId,
} = {}) => {
  const solvedByTask = normalizeRandomMockSolvedByTask(previousSolvedByTask);
  const nextSets = Object.entries(solvedByTask).reduce((acc, [taskNumber, questionIds]) => {
    acc[taskNumber] = Object.entries(questionIds).reduce((levelAcc, [levelId, ids]) => {
      levelAcc[levelId] = new Set(ids);
      return levelAcc;
    }, {});
    return acc;
  }, {});
  const attempts = isRecord(mockAttempts) ? mockAttempts : {};
  const normalizedStudentId = String(studentId ?? '').trim();

  (Array.isArray(exams) ? exams : []).forEach((exam) => {
    if (!isPersonalRandomMockExam(exam)) return;
    if (
      normalizedStudentId
      && String(exam?.generatedForStudentId ?? '').trim() !== normalizedStudentId
    ) return;
    const solvedEver = attempts?.[String(exam.id)]?.solvedEver;
    if (!isRecord(solvedEver)) return;
    const examLevelId = getPersonalRandomMockLevelId(exam);
    const groups = new Map();
    Object.entries(isRecord(exam.tasks) ? exam.tasks : {}).forEach(([mockTaskNumber, question]) => {
      const numericSourceTaskNumber = Number(question?.sourceTaskNumber);
      const sourceTaskNumber = Number.isInteger(numericSourceTaskNumber)
        && numericSourceTaskNumber >= 1
        && numericSourceTaskNumber <= 27
        ? String(numericSourceTaskNumber)
        : '';
      const sourceQuestionId = String(question?.sourceQuestionId ?? '').trim();
      const sourceLevelId = normalizeLevelId(question?.sourceLevelId) || examLevelId;
      if (!sourceTaskNumber || !sourceQuestionId) return;
      const groupKey = `${sourceLevelId}\u0000${sourceTaskNumber}\u0000${sourceQuestionId}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          sourceLevelId,
          sourceTaskNumber,
          sourceQuestionId,
          mockTaskNumbers: [],
        });
      }
      groups.get(groupKey).mockTaskNumbers.push(String(mockTaskNumber));
    });
    groups.forEach((group) => {
      if (
        group.mockTaskNumbers.length === 0
        || !group.mockTaskNumbers.every((taskNumber) => solvedEver[taskNumber] === true)
      ) return;
      if (!nextSets[group.sourceTaskNumber]) nextSets[group.sourceTaskNumber] = {};
      if (!nextSets[group.sourceTaskNumber][group.sourceLevelId]) {
        nextSets[group.sourceTaskNumber][group.sourceLevelId] = new Set();
      }
      nextSets[group.sourceTaskNumber][group.sourceLevelId].add(group.sourceQuestionId);
    });
  });

  return Object.entries(nextSets).reduce((acc, [taskNumber, questionIdsByLevel]) => {
    const normalizedByLevel = Object.entries(questionIdsByLevel).reduce((levelAcc, [levelId, questionIds]) => {
      if (questionIds.size > 0) levelAcc[levelId] = Array.from(questionIds);
      return levelAcc;
    }, {});
    if (Object.keys(normalizedByLevel).length > 0) acc[taskNumber] = normalizedByLevel;
    return acc;
  }, {});
};

const getTaskSolvedQuestionIds = (solvedByTask, randomMockSolvedByTask, taskNumber, levelId) => {
  const taskKeys = taskNumber === 19 ? ['19', '20', '21'] : [String(taskNumber)];
  const solvedIds = new Set();
  taskKeys.forEach((taskKey) => {
    const solved = solvedByTask?.[taskKey]?.[levelId]?.solved;
    if (!Array.isArray(solved)) return;
    solved.forEach((questionId) => {
      const normalized = String(questionId ?? '').trim();
      if (normalized) solvedIds.add(normalized);
    });
  });
  taskKeys.forEach((taskKey) => {
    const solved = randomMockSolvedByTask?.[taskKey]?.[levelId];
    if (!Array.isArray(solved)) return;
    solved.forEach((questionId) => {
      const normalized = String(questionId ?? '').trim();
      if (normalized) solvedIds.add(normalized);
    });
  });
  return solvedIds;
};

const chooseQuestion = (questions, solvedQuestionIds, pickIndex) => {
  const normalizedQuestions = questions.map((question, index) => ({
    question,
    questionId: getQuestionId(question) || `position-${index + 1}`,
    index,
  }));
  const unsolved = normalizedQuestions.filter((entry) => (
    !solvedQuestionIds.has(entry.questionId)
  ));
  const candidates = unsolved.length > 0 ? unsolved : normalizedQuestions;
  if (candidates.length === 0) return null;
  const rawIndex = Number(pickIndex(candidates.length));
  const candidateIndex = Number.isInteger(rawIndex)
    ? Math.max(0, Math.min(candidates.length - 1, rawIndex))
    : 0;
  return {
    ...candidates[candidateIndex],
    isFresh: unsolved.length > 0,
  };
};

const withSelectionMetadata = (question, sourceTaskNumber, sourceLevelId, selected, mockTaskNumber) => ({
  ...question,
  sourceQuestionId: selected.questionId || `position-${selected.index + 1}`,
  sourceTaskNumber,
  sourceLevelId,
  randomSelection: selected.isFresh ? 'fresh' : 'repeat',
  randomMockTaskNumber: mockTaskNumber,
});

const expandGameTheoryQuestion = (question, levelId, selected) => {
  const answers = getExpectedAnswers(question, 4);
  return {
    19: withSelectionMetadata(replaceQuestionAnswers(question, [answers[0]]), 19, levelId, selected, 19),
    20: withSelectionMetadata(replaceQuestionAnswers(question, [answers[1], answers[2]]), 19, levelId, selected, 20),
    21: withSelectionMetadata(replaceQuestionAnswers(question, [answers[3]]), 19, levelId, selected, 21),
  };
};

export const isPersonalRandomMockExam = (exam) => (
  String(exam?.source || '').trim() === PERSONAL_RANDOM_MOCK_SOURCE
);

export const buildPersonalRandomMockTasks = ({
  testsDb,
  solvedByTask,
  randomMockSolvedByTask,
  levelId = PERSONAL_RANDOM_MOCK_LEVEL_ID,
  pickIndex = (length) => Math.floor(Math.random() * length),
} = {}) => {
  const normalizedLevelId = normalizeLevelId(levelId) || PERSONAL_RANDOM_MOCK_LEVEL_ID;
  const sourceDb = isRecord(testsDb) ? testsDb : {};
  const solved = isRecord(solvedByTask) ? solvedByTask : {};
  const randomSolved = normalizeRandomMockSolvedByTask(randomMockSolvedByTask);
  const tasks = {};
  const missingTaskNumbers = [];
  let freshTaskCount = 0;
  let repeatTaskCount = 0;
  let sourceQuestionCount = 0;

  SOURCE_TASK_NUMBERS.forEach((taskNumber) => {
    const questions = sourceDb?.[String(taskNumber)]?.[normalizedLevelId];
    const expandedTaskNumbers = taskNumber === 19 ? [19, 20, 21] : [taskNumber];
    if (!Array.isArray(questions) || questions.length === 0) {
      missingTaskNumbers.push(...expandedTaskNumbers);
      return;
    }

    const selected = chooseQuestion(
      questions.filter((question) => isRecord(question)),
      getTaskSolvedQuestionIds(solved, randomSolved, taskNumber, normalizedLevelId),
      pickIndex
    );
    if (!selected) {
      missingTaskNumbers.push(...expandedTaskNumbers);
      return;
    }

    const selectedTasks = taskNumber === 19
      ? expandGameTheoryQuestion(selected.question, normalizedLevelId, selected)
      : {
          [taskNumber]: withSelectionMetadata(
            selected.question,
            taskNumber,
            normalizedLevelId,
            selected,
            taskNumber
          ),
        };
    Object.assign(tasks, selectedTasks);
    const addedTaskCount = Object.keys(selectedTasks).length;
    sourceQuestionCount += 1;
    if (selected.isFresh) freshTaskCount += addedTaskCount;
    else repeatTaskCount += addedTaskCount;
  });

  return {
    tasks,
    summary: {
      levelId: normalizedLevelId,
      taskCount: Object.keys(tasks).length,
      freshTaskCount,
      repeatTaskCount,
      sourceQuestionCount,
      missingTaskNumbers,
      usedFallbacks: repeatTaskCount > 0,
    },
  };
};
