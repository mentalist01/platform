const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneValue = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const normalizeRevision = (value, fallback = 1) => {
  const revision = Number(value);
  return Number.isInteger(revision) && revision > 0 ? revision : fallback;
};

export const getMockExamContentRevision = (exam) => normalizeRevision(exam?.contentRevision);

export const hasMockExamSnapshot = (value) => Boolean(
  isRecord(value)
  && isRecord(value.tasks)
  && String(value.id || '').trim()
);

export const createMockExamSnapshot = (exam) => {
  if (!hasMockExamSnapshot(exam)) return null;
  return {
    ...cloneValue(exam),
    contentRevision: getMockExamContentRevision(exam),
  };
};

export const areMockExamTasksEqual = (left, right) => {
  const leftTasks = isRecord(left) ? left : {};
  const rightTasks = isRecord(right) ? right : {};
  return JSON.stringify(leftTasks) === JSON.stringify(rightTasks);
};

export const resolveMockExamForAttempt = (currentExam, attempt, result = null) => {
  const currentId = String(currentExam?.id || '').trim();
  const candidates = [
    result?.examSnapshot,
    attempt?.examSnapshot,
  ];
  for (const candidate of candidates) {
    if (!hasMockExamSnapshot(candidate)) continue;
    const candidateId = String(candidate.id || '').trim();
    if (currentId && candidateId !== currentId) continue;
    return candidate;
  }
  if (isRecord(result?.tasks) && Object.keys(result.tasks).length > 0) {
    return {
      ...(isRecord(currentExam) ? currentExam : {}),
      id: String(result?.examId || currentId).trim(),
      title: String(result?.examTitle || currentExam?.title || 'Пробник').trim(),
      tasks: result.tasks,
      contentRevision: normalizeRevision(result?.examRevision ?? currentExam?.contentRevision),
    };
  }
  return currentExam;
};

export const attachMockExamSnapshotToAttempt = (attempt, examSnapshot) => {
  if (!isRecord(attempt) || !hasMockExamSnapshot(examSnapshot)) return attempt;
  return {
    ...attempt,
    examRevision: getMockExamContentRevision(examSnapshot),
    examSnapshot,
  };
};
