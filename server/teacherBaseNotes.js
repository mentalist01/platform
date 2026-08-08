export const TEACHER_BASE_NOTE_TEXT = 'Есть база';
export const TEACHER_BASE_NOTE_SOLVED_THRESHOLD = 10;

const CLASSIC_TASK_MIN = 1;
const CLASSIC_TASK_MAX = 27;
const GAME_THEORY_TASK_NUMBERS = [19, 20, 21];

const normalizeClassicTaskNumber = (value) => {
  const taskNumber = Number(value);
  if (!Number.isInteger(taskNumber)) return null;
  if (taskNumber < CLASSIC_TASK_MIN || taskNumber > CLASSIC_TASK_MAX) return null;
  return taskNumber;
};

const getTeacherNoteTaskNumber = (taskNumber) => (
  GAME_THEORY_TASK_NUMBERS.includes(taskNumber) ? GAME_THEORY_TASK_NUMBERS[0] : taskNumber
);

const getTeacherNoteTaskKeys = (taskNumber) => (
  taskNumber === GAME_THEORY_TASK_NUMBERS[0]
    ? GAME_THEORY_TASK_NUMBERS.map(String)
    : [String(taskNumber)]
);

const hasNonEmptyNote = (notesByTask, taskKeys) => taskKeys.some((taskKey) => {
  const value = notesByTask?.[taskKey];
  return value !== null && typeof value !== 'undefined' && String(value).trim().length > 0;
});

export const countSolvedTestingQuestions = (taskEntry) => {
  if (!taskEntry || typeof taskEntry !== 'object' || Array.isArray(taskEntry)) return 0;

  return Object.entries(taskEntry).reduce((total, [levelId, levelEntry]) => {
    if (String(levelId).startsWith('_')) return total;
    const solved = Array.isArray(levelEntry?.solved) ? levelEntry.solved : [];
    const uniqueSolvedIds = new Set(
      solved
        .map((questionId) => String(questionId ?? '').trim())
        .filter(Boolean)
    );
    return total + uniqueSolvedIds.size;
  }, 0);
};

export const applyTeacherBaseNotes = ({ notesByTask, solvedByTask } = {}) => {
  const currentNotes = notesByTask && typeof notesByTask === 'object' && !Array.isArray(notesByTask)
    ? notesByTask
    : {};
  const solvedSource = solvedByTask && typeof solvedByTask === 'object' && !Array.isArray(solvedByTask)
    ? solvedByTask
    : {};
  const solvedCountByNoteTask = new Map();

  Object.entries(solvedSource).forEach(([taskKey, taskEntry]) => {
    const taskNumber = normalizeClassicTaskNumber(taskKey);
    if (!taskNumber) return;
    const noteTaskNumber = getTeacherNoteTaskNumber(taskNumber);
    const previousCount = solvedCountByNoteTask.get(noteTaskNumber) || 0;
    solvedCountByNoteTask.set(
      noteTaskNumber,
      previousCount + countSolvedTestingQuestions(taskEntry)
    );
  });

  let nextNotes = currentNotes;
  const addedTaskNumbers = [];
  solvedCountByNoteTask.forEach((solvedCount, noteTaskNumber) => {
    if (solvedCount < TEACHER_BASE_NOTE_SOLVED_THRESHOLD) return;
    const noteTaskKeys = getTeacherNoteTaskKeys(noteTaskNumber);
    if (hasNonEmptyNote(currentNotes, noteTaskKeys)) return;
    if (nextNotes === currentNotes) nextNotes = { ...currentNotes };
    nextNotes[String(noteTaskNumber)] = TEACHER_BASE_NOTE_TEXT;
    addedTaskNumbers.push(noteTaskNumber);
  });

  return {
    notesByTask: nextNotes,
    changed: addedTaskNumbers.length > 0,
    addedTaskNumbers,
  };
};
