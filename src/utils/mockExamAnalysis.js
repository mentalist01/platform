const TIMER_MODE = 'timer';

const normalizeText = (value) => String(value ?? '').trim();

const normalizeQuestionLabel = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeText(value.text || value.label);
  }
  return normalizeText(value);
};

const compareTaskKeys = (left, right) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return normalizeText(left).localeCompare(normalizeText(right), 'ru', { numeric: true });
};

const toAnswerValues = (value, count) => {
  const size = Math.max(1, Math.trunc(Number(count) || 1));
  if (Array.isArray(value)) {
    return Array.from({ length: size }, (_, index) => normalizeText(value[index]));
  }
  return Array.from({ length: size }, (_, index) => (index === 0 ? normalizeText(value) : ''));
};

const hasAnswerValues = (values) => values.some(Boolean);

const getTaskWeight = (taskKey) => ([26, 27].includes(Number(taskKey)) ? 2 : 1);

const ANALYSIS_SECTIONS = [
  { id: 'foundation', label: 'Основы', shortLabel: '1–6', min: 1, max: 6 },
  { id: 'data', label: 'Данные и информация', shortLabel: '7–12', min: 7, max: 12 },
  { id: 'logic', label: 'Логика и алгоритмы', shortLabel: '13–18', min: 13, max: 18 },
  { id: 'games', label: 'Теория игр', shortLabel: '19–21', min: 19, max: 21 },
  { id: 'programming', label: 'Программирование', shortLabel: '22–27', min: 22, max: 27 },
];

const getTaskSection = (taskKey) => {
  const taskNumber = Number(taskKey);
  return ANALYSIS_SECTIONS.find((section) => (
    Number.isFinite(taskNumber) && taskNumber >= section.min && taskNumber <= section.max
  )) || { id: 'other', label: 'Другие задания', shortLabel: '—', min: 0, max: 0 };
};

const parseTimestamp = (value) => {
  const timestamp = Date.parse(normalizeText(value));
  return Number.isFinite(timestamp) ? timestamp : null;
};

const resolveElapsedMs = (attempt) => {
  const startedAt = parseTimestamp(attempt?.timerStartedAt || attempt?.modeLockedAt);
  const finishedAt = parseTimestamp(attempt?.timerFinishedAt || attempt?.updatedAt);
  if (startedAt == null || finishedAt == null || finishedAt < startedAt) return null;
  return finishedAt - startedAt;
};

const defaultPrimaryScore = (solved = {}) => Object.entries(solved).reduce((sum, [taskKey, value]) => (
  value ? sum + getTaskWeight(taskKey) : sum
), 0);

const defaultSecondaryScore = (primary) => Math.max(0, Math.round(Number(primary) || 0));

const buildSectionAnalysis = (tasks) => {
  const sectionsById = new Map();
  tasks.forEach((task) => {
    const meta = getTaskSection(task.taskKey);
    const current = sectionsById.get(meta.id) || {
      ...meta,
      totalCount: 0,
      answeredCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
      primaryTotal: 0,
      primaryEarned: 0,
      taskKeys: [],
      problemTaskKeys: [],
    };
    current.totalCount += 1;
    current.primaryTotal += task.primaryWeight;
    current.taskKeys.push(task.taskKey);
    if (task.answered) current.answeredCount += 1;
    if (task.status === 'correct') {
      current.correctCount += 1;
      current.primaryEarned += task.primaryWeight;
    } else if (task.status === 'incorrect') {
      current.incorrectCount += 1;
      current.problemTaskKeys.push(task.taskKey);
    } else if (task.status === 'unanswered') {
      current.unansweredCount += 1;
      current.problemTaskKeys.push(task.taskKey);
    }
    sectionsById.set(meta.id, current);
  });

  return Array.from(sectionsById.values())
    .map((section) => ({
      ...section,
      accuracyPercent: section.answeredCount > 0
        ? Math.round((section.correctCount / section.answeredCount) * 100)
        : 0,
      scorePercent: section.primaryTotal > 0
        ? Math.round((section.primaryEarned / section.primaryTotal) * 100)
        : 0,
    }))
    .sort((left, right) => left.min - right.min);
};

export const buildMockExamAnalysis = ({
  exam,
  attempt,
  taskCatalog = [],
  targetTaskKeys = null,
  getAnswerCountForTask = () => 1,
  getExpectedAnswers = () => [''],
  getPrimaryScoreFromSolved = defaultPrimaryScore,
  getSecondaryScoreFromPrimary = defaultSecondaryScore,
} = {}) => {
  const examTasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  const availableTaskKeys = Object.keys(examTasks).map(normalizeText).filter(Boolean).sort(compareTaskKeys);
  const requestedTaskKeys = Array.isArray(targetTaskKeys)
    ? Array.from(new Set(targetTaskKeys.map(normalizeText).filter(Boolean)))
    : [];
  const availableSet = new Set(availableTaskKeys);
  const taskKeys = requestedTaskKeys.length > 0
    ? requestedTaskKeys.filter((taskKey) => availableSet.has(taskKey)).sort(compareTaskKeys)
    : availableTaskKeys;
  const titleByTaskKey = (Array.isArray(taskCatalog) ? taskCatalog : []).reduce((result, task) => {
    const taskKey = normalizeText(task?.number ?? task?.id);
    if (taskKey) result[taskKey] = normalizeText(task?.title);
    return result;
  }, {});
  const answers = attempt?.answers && typeof attempt.answers === 'object' && !Array.isArray(attempt.answers)
    ? attempt.answers
    : {};
  const solved = attempt?.solved && typeof attempt.solved === 'object' && !Array.isArray(attempt.solved)
    ? attempt.solved
    : {};
  const mode = normalizeText(attempt?.mode || exam?.access?.mode).toLowerCase() || 'classic';
  const resultsVisible = mode !== TIMER_MODE || Boolean(normalizeText(attempt?.timerFinishedAt));

  const tasks = taskKeys.map((taskKey) => {
    const question = examTasks[taskKey] || {};
    const answerCount = Math.max(1, Math.trunc(Number(getAnswerCountForTask(taskKey)) || 1));
    const providedAnswers = toAnswerValues(answers[taskKey], answerCount);
    const expectedAnswers = toAnswerValues(getExpectedAnswers(question, answerCount), answerCount);
    const answered = hasAnswerValues(providedAnswers);
    const isCorrect = resultsVisible && answered && Boolean(solved[taskKey]);
    const status = !resultsVisible && answered
      ? 'pending'
      : isCorrect
        ? 'correct'
        : answered
          ? 'incorrect'
          : 'unanswered';
    const primaryWeight = getTaskWeight(taskKey);
    const section = getTaskSection(taskKey);
    return {
      taskKey,
      taskNumber: Number.isFinite(Number(taskKey)) ? Number(taskKey) : taskKey,
      title: titleByTaskKey[taskKey] || normalizeQuestionLabel(question?.label) || `Задание ${taskKey}`,
      question,
      answerCount,
      providedAnswers,
      expectedAnswers,
      answered,
      solved: isCorrect,
      status,
      primaryWeight,
      lostPrimary: resultsVisible && !isCorrect ? primaryWeight : 0,
      sectionId: section.id,
      sectionLabel: section.label,
    };
  });

  const totalCount = tasks.length;
  const answeredCount = tasks.filter((task) => task.answered).length;
  const correctCount = tasks.filter((task) => task.status === 'correct').length;
  const incorrectCount = tasks.filter((task) => task.status === 'incorrect').length;
  const unansweredCount = tasks.filter((task) => task.status === 'unanswered').length;
  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const solvedForScope = tasks.reduce((result, task) => {
    result[task.taskKey] = task.status === 'correct';
    return result;
  }, {});
  const primaryScore = resultsVisible ? Number(getPrimaryScoreFromSolved(solvedForScope)) || 0 : null;
  const secondaryScore = primaryScore == null ? null : Number(getSecondaryScoreFromPrimary(primaryScore)) || 0;
  const primaryMaximum = tasks.reduce((sum, task) => sum + task.primaryWeight, 0);
  const recoverablePrimary = resultsVisible
    ? tasks.reduce((sum, task) => sum + task.lostPrimary, 0)
    : 0;
  const projectedPrimary = primaryScore == null ? null : Math.min(primaryMaximum, primaryScore + recoverablePrimary);
  const projectedSecondary = projectedPrimary == null
    ? null
    : Number(getSecondaryScoreFromPrimary(projectedPrimary)) || 0;
  const accuracyPercent = resultsVisible && answeredCount > 0
    ? Math.round((correctCount / answeredCount) * 100)
    : null;
  const completionPercent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
  const sections = buildSectionAnalysis(tasks);
  const priorityTasks = resultsVisible
    ? tasks
        .filter((task) => ['incorrect', 'unanswered'].includes(task.status))
        .sort((left, right) => {
          if (left.primaryWeight !== right.primaryWeight) return right.primaryWeight - left.primaryWeight;
          if (left.status !== right.status) return left.status === 'incorrect' ? -1 : 1;
          return compareTaskKeys(left.taskKey, right.taskKey);
        })
    : [];
  const weakestSection = resultsVisible
    ? [...sections]
        .filter((section) => section.problemTaskKeys.length > 0)
        .sort((left, right) => {
          if (left.scorePercent !== right.scorePercent) return left.scorePercent - right.scorePercent;
          if (left.primaryTotal !== right.primaryTotal) return right.primaryTotal - left.primaryTotal;
          return left.min - right.min;
        })[0] || null
    : null;

  return {
    examId: normalizeText(exam?.id),
    examTitle: normalizeText(exam?.title) || 'Пробник',
    mode,
    resultsVisible,
    hasStarted: answeredCount > 0 || Boolean(normalizeText(attempt?.modeLockedAt || attempt?.timerStartedAt)),
    totalCount,
    answeredCount,
    correctCount,
    incorrectCount,
    unansweredCount,
    pendingCount,
    completionPercent,
    accuracyPercent,
    primaryScore,
    primaryMaximum,
    secondaryScore,
    recoverablePrimary,
    projectedPrimary,
    projectedSecondary,
    elapsedMs: resolveElapsedMs(attempt),
    updatedAt: normalizeText(attempt?.updatedAt),
    tasks,
    sections,
    weakestSection,
    priorityTasks,
    recommendedTaskKeys: priorityTasks.map((task) => task.taskKey),
  };
};

export { ANALYSIS_SECTIONS };
