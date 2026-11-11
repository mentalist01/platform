const bankNumber = value => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 99
    ? ([20, 21].includes(number) ? 19 : number) : null;
};

export function buildMockTaskBankSnapshot(catalog) {
  const tasks = Array.isArray(catalog) ? catalog : catalog?.activeTasks || catalog?.tasks || [];
  return Object.fromEntries(tasks.flatMap(task => {
    const slot = Number(task.slotNumber ?? task.number);
    const bank = bankNumber(task.taskNumber ?? task.id ?? task.number);
    if (!bank || !Number.isInteger(slot) || slot < 1 || slot > 27) return [];
    return (slot === 19 ? [19, 20, 21] : [slot]).map(key => [String(key), bank]);
  }));
}

// Exam positions and permanent question-bank IDs are different identities.
// Prefer the identity saved with the question/attempt over today's numbering.
export function resolveMockTaskBankNumber({ slotNumber, question, exam, taskCatalog } = {}) {
  const explicit = bankNumber(question?.sourceTaskNumber);
  if (explicit) return explicit;
  const frozen = bankNumber(exam?.taskBankSnapshot?.[String(slotNumber)]);
  if (frozen) return frozen;
  if (taskCatalog !== undefined) {
    return bankNumber(buildMockTaskBankSnapshot(taskCatalog)[String(slotNumber)]);
  }
  const slot = Number(slotNumber);
  return Number.isInteger(slot) && slot >= 1 && slot <= 27 ? bankNumber(slot) : null;
}

export function withMockTaskBankSnapshot(exam, taskCatalog) {
  if (!exam || typeof exam !== 'object') return exam;
  return {
    ...exam,
    taskBankSnapshot: { ...buildMockTaskBankSnapshot(taskCatalog), ...exam.taskBankSnapshot },
  };
}
