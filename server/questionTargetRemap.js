const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const AMBIGUOUS_QUESTION_POSITION = Symbol('ambiguous-question-position');

export class QuestionTargetRemapConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuestionTargetRemapConflictError';
    this.code = 'QUESTION_TARGET_REMAP_CONFLICT';
  }
}

const getQuestionId = (question) => {
  const value = question?.id;
  if (value === null || typeof value === 'undefined') return '';
  return String(value).trim();
};

const getLevelKey = (taskNumber, levelId) => (
  `${String(taskNumber ?? '').trim()}\u0000${String(levelId ?? '').trim()}`
);

const targetListsEqual = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => Number(value) === Number(right[index]));
};

export const buildQuestionPositionRemaps = (previousTestsDb, nextTestsDb) => {
  const previousDb = isRecord(previousTestsDb) ? previousTestsDb : {};
  const nextDb = isRecord(nextTestsDb) ? nextTestsDb : {};
  const remaps = new Map();

  Object.entries(previousDb).forEach(([taskNumber, previousTask]) => {
    if (!isRecord(previousTask)) return;
    const nextTask = isRecord(nextDb[taskNumber]) ? nextDb[taskNumber] : {};

    Object.entries(previousTask).forEach(([levelId, previousQuestions]) => {
      if (!Array.isArray(previousQuestions)) return;
      const nextQuestions = Array.isArray(nextTask[levelId]) ? nextTask[levelId] : [];
      const orderIsUnchanged = previousQuestions.length === nextQuestions.length
        && previousQuestions.every((question, index) => (
          getQuestionId(question) === getQuestionId(nextQuestions[index])
        ));
      if (orderIsUnchanged) return;

      const nextPositionByQuestionId = new Map();
      nextQuestions.forEach((question, index) => {
        const questionId = getQuestionId(question);
        if (!questionId) return;
        nextPositionByQuestionId.set(
          questionId,
          nextPositionByQuestionId.has(questionId)
            ? AMBIGUOUS_QUESTION_POSITION
            : index + 1
        );
      });

      const previousQuestionIdCounts = new Map();
      previousQuestions.forEach((question) => {
        const questionId = getQuestionId(question);
        if (!questionId) return;
        previousQuestionIdCounts.set(questionId, (previousQuestionIdCounts.get(questionId) || 0) + 1);
      });

      const positionRemap = new Map();
      previousQuestions.forEach((question, index) => {
        const questionId = getQuestionId(question);
        if (!questionId || previousQuestionIdCounts.get(questionId) > 1) {
          positionRemap.set(index + 1, AMBIGUOUS_QUESTION_POSITION);
          return;
        }
        positionRemap.set(index + 1, nextPositionByQuestionId.get(questionId) ?? null);
      });
      remaps.set(getLevelKey(taskNumber, levelId), positionRemap);
    });
  });

  return remaps;
};

const remapTargetQuestions = (targetQuestions, positionRemap) => {
  if (!Array.isArray(targetQuestions) || !positionRemap) return targetQuestions;
  const seen = new Set();
  const remapped = [];

  targetQuestions.forEach((rawPosition) => {
    const numericPosition = Number(rawPosition);
    if (!Number.isFinite(numericPosition)) return;
    const position = Math.trunc(numericPosition);
    if (position < 1 || !positionRemap.has(position)) return;
    const nextPosition = positionRemap.get(position);
    if (nextPosition === AMBIGUOUS_QUESTION_POSITION) {
      throw new QuestionTargetRemapConflictError(
        'Не удалось безопасно изменить порядок: у назначенного вопроса нет уникального ID.'
      );
    }
    if (!Number.isInteger(nextPosition) || nextPosition < 1 || seen.has(nextPosition)) return;
    seen.add(nextPosition);
    remapped.push(nextPosition);
  });

  return remapped.sort((left, right) => left - right);
};

const remapTaskReference = (reference, remaps) => {
  if (!isRecord(reference) || reference.includeAll) {
    return { value: reference, changed: false };
  }
  const taskNumber = String(reference.taskNumber ?? '').trim();
  const levelId = String(reference.levelId ?? '').trim();
  if (!taskNumber || !levelId || !Array.isArray(reference.targetQuestions)) {
    return { value: reference, changed: false };
  }

  const positionRemap = remaps.get(getLevelKey(taskNumber, levelId));
  if (!positionRemap) return { value: reference, changed: false };
  const targetQuestions = remapTargetQuestions(reference.targetQuestions, positionRemap);
  const remove = reference.targetQuestions.length > 0 && targetQuestions.length === 0;
  if (remove) {
    return { value: reference, changed: true, remove: true };
  }
  if (targetListsEqual(reference.targetQuestions, targetQuestions)) {
    return { value: reference, changed: false };
  }
  return {
    value: { ...reference, targetQuestions },
    changed: true,
  };
};

const remapHomeworkEntry = (entry, remaps) => {
  if (!isRecord(entry)) return { value: entry, changed: false, changedReferences: 0 };
  let nextEntry = entry;
  let changed = false;
  let changedReferences = 0;

  if (Array.isArray(entry.goals)) {
    let goalsChanged = false;
    const goals = entry.goals.flatMap((goal) => {
      const rawType = String(goal?.type || '').trim().toLowerCase();
      if (rawType === 'mock' || (!goal?.taskNumber && goal?.mockExamId)) return [goal];
      const result = remapTaskReference(goal, remaps);
      if (result.changed) {
        goalsChanged = true;
        changedReferences += 1;
      }
      return result.remove ? [] : [result.value];
    });
    if (goalsChanged) {
      nextEntry = { ...nextEntry, goals };
      changed = true;
    }
  }

  const legacyResult = remapTaskReference(nextEntry, remaps);
  if (legacyResult.changed) {
    nextEntry = legacyResult.remove
      ? {
          ...nextEntry,
          taskNumber: null,
          levelId: null,
          targetQuestions: [],
        }
      : legacyResult.value;
    changed = true;
    changedReferences += 1;
  }

  return { value: nextEntry, changed, changedReferences };
};

export const remapProgressQuestionTargets = (progressDb, previousTestsDb, nextTestsDb) => {
  const source = isRecord(progressDb) ? progressDb : {};
  const remaps = buildQuestionPositionRemaps(previousTestsDb, nextTestsDb);
  if (remaps.size === 0) {
    return { db: source, changed: false, changedStudents: 0, changedReferences: 0 };
  }

  let nextDb = source;
  let changedStudents = 0;
  let changedReferences = 0;

  Object.entries(source).forEach(([studentId, rawStudent]) => {
    if (!isRecord(rawStudent)) return;
    let nextStudent = rawStudent;
    let studentChanged = false;

    if (Array.isArray(rawStudent.homeworks)) {
      let homeworksChanged = false;
      const homeworks = rawStudent.homeworks.map((homework) => {
        const result = remapHomeworkEntry(homework, remaps);
        if (result.changed) {
          homeworksChanged = true;
          changedReferences += result.changedReferences;
        }
        return result.value;
      });
      if (homeworksChanged) {
        nextStudent = { ...nextStudent, homeworks };
        studentChanged = true;
      }
    }

    if (isRecord(rawStudent.nextLesson)) {
      const result = remapHomeworkEntry(rawStudent.nextLesson, remaps);
      if (result.changed) {
        nextStudent = { ...nextStudent, nextLesson: result.value };
        studentChanged = true;
        changedReferences += result.changedReferences;
      }
    }

    if (studentChanged) {
      if (nextDb === source) nextDb = { ...source };
      nextDb[studentId] = nextStudent;
      changedStudents += 1;
    }
  });

  return {
    db: nextDb,
    changed: changedStudents > 0,
    changedStudents,
    changedReferences,
  };
};
