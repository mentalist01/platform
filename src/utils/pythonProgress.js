const clampPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const getQuestionId = (question, index) => String(question?.id ?? index ?? '').trim();

export const buildCurrentPythonProgressMap = ({
  taskList = [],
  testsDb = {},
  studentData = {},
  storedProgress = {},
  levelId = 'python',
} = {}) => {
  const fallback = storedProgress && typeof storedProgress === 'object' ? storedProgress : {};
  const result = { ...fallback };
  const solvedByTask = studentData?.solvedByTask && typeof studentData.solvedByTask === 'object'
    ? studentData.solvedByTask
    : {};

  (Array.isArray(taskList) ? taskList : []).forEach((task) => {
    const taskNumber = Number(task?.number ?? task?.id);
    const taskKey = String(taskNumber || task?.id || '').trim();
    const progressKey = String(task?.id ?? taskNumber).trim();
    if (!taskKey || !progressKey) return;
    const questions = Array.isArray(testsDb?.[taskNumber]?.[levelId])
      ? testsDb[taskNumber][levelId]
      : [];
    if (questions.length === 0) {
      result[progressKey] = clampPercent(fallback?.[progressKey]);
      return;
    }
    const solved = solvedByTask?.[taskKey]?.[levelId]?.solved;
    if (!Array.isArray(solved)) {
      result[progressKey] = clampPercent(fallback?.[progressKey]);
      return;
    }
    const solvedSet = new Set(solved.map((id) => String(id ?? '').trim()).filter(Boolean));
    const knownIds = questions.map(getQuestionId).filter(Boolean);
    const solvedCurrent = knownIds.reduce((count, id) => count + (solvedSet.has(id) ? 1 : 0), 0);
    result[progressKey] = clampPercent((solvedCurrent / knownIds.length) * 100);
  });

  return result;
};
