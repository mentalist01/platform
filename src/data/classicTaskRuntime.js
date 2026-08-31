import { buildDefaultClassicTaskCatalog } from './classicTaskCatalog.js';

// Internal numbers are immutable bank identities. Only slotNumber/displayNumber
// follow the current exam layout; never send those display numbers to data APIs.
let activeTasks = buildDefaultClassicTaskCatalog();
let allTasks = new Map(activeTasks.map((task) => [task.number, task]));

export const setClassicTaskRuntimeCatalog = (catalog) => {
  if (!Array.isArray(catalog?.tasks) || !catalog.tasks.length) return;
  activeTasks = catalog.tasks;
  const archived = (catalog.archivedTasks || []).map((task) => ({
    ...task,
    id: task.taskNumber,
    number: task.taskNumber,
    slotNumber: task.lastSlotNumber,
    archived: true,
  }));
  allTasks = new Map([...activeTasks, ...archived].map((task) => [Number(task.number), task]));
};

export const getClassicTask = (number) => allTasks.get(Number(number));
export const isKnownClassicTask = (number) => allTasks.has(Number(number));
export const getActiveClassicTasks = () => activeTasks;
export const formatClassicTaskNumber = (number) => {
  if (number === null || number === undefined || number === '') return '';
  const task = getClassicTask(number);
  return String(task?.displayNumber ?? task?.slotNumber ?? number);
};
