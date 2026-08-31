import {
  CLASSIC_GAME_THEORY_TASK_NUMBER,
  CLASSIC_TASK_INTERNAL_MAX_NUMBER,
  DEFAULT_CLASSIC_TASK_XP_REWARDS,
  getClassicTaskDisplayNumber,
  isClassicTaskSlotNumber,
  normalizeClassicTaskCatalog,
} from '../src/data/classicTaskCatalog.js';

export class ClassicTaskCatalogMutationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ClassicTaskCatalogMutationError';
    this.statusCode = statusCode;
  }
}

const normalizeStoredEntry = (entry) => {
  const taskNumber = Number(entry?.taskNumber ?? entry?.id);
  const slotNumber = Number(entry?.slotNumber ?? entry?.lastSlotNumber ?? entry?.displayNumber ?? entry?.number);
  if (!Number.isInteger(taskNumber) || taskNumber < 1 || taskNumber > CLASSIC_TASK_INTERNAL_MAX_NUMBER) {
    return null;
  }
  if (!isClassicTaskSlotNumber(slotNumber)) return null;
  const title = String(entry?.title || '').trim().slice(0, 120);
  if (!title) return null;
  const rawXpReward = Number(entry?.xpReward);
  const xpReward = Number.isFinite(rawXpReward) && rawXpReward > 0
    ? Math.min(10000, Math.round(rawXpReward))
    : (DEFAULT_CLASSIC_TASK_XP_REWARDS[taskNumber] || 100);
  return {
    taskNumber,
    slotNumber,
    title,
    xpReward,
    archived: entry?.archived === true,
    archivedAt: entry?.archived === true ? String(entry?.archivedAt || '').trim() : '',
  };
};

export const normalizeStoredClassicTaskCatalog = (value, titleOverrides = {}) => {
  const normalizedActive = normalizeClassicTaskCatalog(value, titleOverrides);
  const sourceArchived = Array.isArray(value?.archivedTasks) ? value.archivedTasks : [];
  const activeTasks = normalizedActive.map((task) => ({
    taskNumber: task.taskNumber,
    slotNumber: task.slotNumber,
    title: task.title,
    xpReward: task.xpReward,
    archived: false,
    archivedAt: '',
  }));
  const activeIds = new Set(activeTasks.map((task) => task.taskNumber));
  const archivedTasks = [];
  const archivedIds = new Set();
  sourceArchived.forEach((entry) => {
    const normalized = normalizeStoredEntry({ ...entry, archived: true });
    if (!normalized || activeIds.has(normalized.taskNumber) || archivedIds.has(normalized.taskNumber)) return;
    archivedIds.add(normalized.taskNumber);
    const override = titleOverrides?.[String(normalized.taskNumber)];
    archivedTasks.push({
      ...normalized,
      title: typeof override === 'string' && override.trim()
        ? override.trim().slice(0, 120)
        : normalized.title,
    });
  });
  const highestTaskNumber = [...activeTasks, ...archivedTasks]
    .reduce((max, task) => Math.max(max, task.taskNumber), 27);
  const configuredNext = Number(value?.nextTaskNumber);
  const nextTaskNumber = Number.isInteger(configuredNext) && configuredNext > highestTaskNumber
    ? configuredNext
    : highestTaskNumber + 1;
  return { version: 1, nextTaskNumber, activeTasks, archivedTasks };
};

export const serializeClassicTaskCatalogForClient = (catalog) => ({
  version: 1,
  tasks: catalog.activeTasks
    .map((task) => ({
      id: task.taskNumber,
      taskNumber: task.taskNumber,
      number: task.taskNumber,
      slotNumber: task.slotNumber,
      displayNumber: getClassicTaskDisplayNumber(task.slotNumber),
      title: task.title,
      topic: 'Тема задания',
      mastery: 0,
      xpReward: task.xpReward,
      ...(task.taskNumber === CLASSIC_GAME_THEORY_TASK_NUMBER ? { locked: true } : {}),
    }))
    .sort((left, right) => left.slotNumber - right.slotNumber),
  archivedTasks: catalog.archivedTasks.map((task) => ({
    taskNumber: task.taskNumber,
    lastSlotNumber: task.slotNumber,
    displayNumber: getClassicTaskDisplayNumber(task.slotNumber),
    title: task.title,
    xpReward: task.xpReward,
    archivedAt: task.archivedAt,
  })),
});

export const buildClassicTaskCatalogMutation = (currentValue, requestedValue, now = new Date()) => {
  const current = currentValue?.activeTasks
    ? currentValue
    : normalizeStoredClassicTaskCatalog(currentValue);
  const requestedTasks = Array.isArray(requestedValue?.tasks) ? requestedValue.tasks : [];
  if (requestedTasks.length === 0) {
    throw new ClassicTaskCatalogMutationError('Добавьте хотя бы одну карточку задания.');
  }

  const currentByTaskNumber = new Map([...current.activeTasks, ...current.archivedTasks]
    .map((task) => [task.taskNumber, task]));
  const seenTaskNumbers = new Set();
  const seenSlots = new Set();
  const activeTasks = [];
  let nextTaskNumber = current.nextTaskNumber;
  const addedTaskNumbers = [];

  requestedTasks.forEach((rawTask) => {
    const slotNumber = Number(rawTask?.slotNumber ?? rawTask?.displayNumber);
    if (!isClassicTaskSlotNumber(slotNumber)) {
      throw new ClassicTaskCatalogMutationError('Некорректный новый номер карточки.');
    }
    if (seenSlots.has(slotNumber)) {
      throw new ClassicTaskCatalogMutationError(`Номер ${slotNumber} занят двумя карточками.`);
    }
    seenSlots.add(slotNumber);

    const rawTaskNumber = rawTask?.taskNumber ?? rawTask?.sourceTaskNumber;
    let taskNumber = rawTaskNumber === null || typeof rawTaskNumber === 'undefined' || rawTaskNumber === ''
      ? null
      : Number(rawTaskNumber);
    const source = taskNumber === null ? null : currentByTaskNumber.get(taskNumber);
    if (taskNumber !== null && (!Number.isInteger(taskNumber) || !source)) {
      throw new ClassicTaskCatalogMutationError('Состав карточек уже изменился. Обновите страницу.', 409);
    }
    if (taskNumber !== null && seenTaskNumbers.has(taskNumber)) {
      throw new ClassicTaskCatalogMutationError(`Карточка №${source.slotNumber} использована дважды.`);
    }
    if (taskNumber === null) {
      while (
        nextTaskNumber <= CLASSIC_TASK_INTERNAL_MAX_NUMBER
        && (currentByTaskNumber.has(nextTaskNumber) || seenTaskNumbers.has(nextTaskNumber))
      ) nextTaskNumber += 1;
      if (nextTaskNumber > CLASSIC_TASK_INTERNAL_MAX_NUMBER) {
        throw new ClassicTaskCatalogMutationError('Закончились внутренние номера карточек.');
      }
      taskNumber = nextTaskNumber;
      nextTaskNumber += 1;
      addedTaskNumbers.push(taskNumber);
    }
    seenTaskNumbers.add(taskNumber);

    const title = String(rawTask?.title || source?.title || '').trim().slice(0, 120);
    if (!title) throw new ClassicTaskCatalogMutationError(`Введите название карточки №${slotNumber}.`);
    const rawXpReward = Number(rawTask?.xpReward);
    const xpReward = source
      ? source.xpReward
      : (Number.isFinite(rawXpReward) && rawXpReward > 0
        ? Math.min(10000, Math.round(rawXpReward))
        : (DEFAULT_CLASSIC_TASK_XP_REWARDS[slotNumber] || 100));
    activeTasks.push({ taskNumber, slotNumber, title, xpReward, archived: false, archivedAt: '' });
  });

  const gameTheory = activeTasks.find((task) => task.taskNumber === CLASSIC_GAME_THEORY_TASK_NUMBER);
  if (!gameTheory || gameTheory.slotNumber !== CLASSIC_GAME_THEORY_TASK_NUMBER) {
    throw new ClassicTaskCatalogMutationError('Объединённую карточку №19–21 пока нельзя удалять или перемещать.');
  }

  const archivedAt = now.toISOString();
  const newlyArchived = current.activeTasks
    .filter((task) => !seenTaskNumbers.has(task.taskNumber))
    .map((task) => ({ ...task, archived: true, archivedAt }));
  return {
    catalog: {
      version: 1,
      nextTaskNumber,
      activeTasks: activeTasks.sort((left, right) => left.slotNumber - right.slotNumber),
      archivedTasks: [...current.archivedTasks.filter((task) => !seenTaskNumbers.has(task.taskNumber)), ...newlyArchived],
    },
    addedTaskNumbers,
    archivedTaskNumbers: newlyArchived.map((task) => task.taskNumber),
  };
};

export const initializeAddedClassicTaskBanks = (testsDb, addedTaskNumbers = []) => {
  const next = testsDb && typeof testsDb === 'object' && !Array.isArray(testsDb)
    ? { ...testsDb }
    : {};
  addedTaskNumbers.forEach((taskNumber) => {
    const key = String(taskNumber);
    if (!next[key]) next[key] = { basic: [], advanced: [], expert: [] };
  });
  return next;
};
