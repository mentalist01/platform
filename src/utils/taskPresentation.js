import { getClassicTaskDisplayNumber } from '../data/classicTaskCatalog.js';

const text = value => String(value ?? '').trim();

// Keys remain immutable bank IDs. A display number must never become a data key.
// Pass the owner's catalog explicitly: server requests can belong to different teachers.
export function buildTaskPresentationMap(catalog = {}) {
  const active = Array.isArray(catalog) ? catalog : catalog?.activeTasks || catalog?.tasks || [];
  const entries = [
    ...(catalog?.archivedTasks || []).map(task => ({ ...task, archived: true })),
    ...active,
  ];
  return Object.fromEntries(entries.map(task => {
    const taskNumber = Number(task.taskNumber ?? task.number ?? task.id);
    const slot = task.slotNumber ?? task.lastSlotNumber ?? taskNumber;
    return [taskNumber, {
      displayNumber: text(task.displayNumber) || getClassicTaskDisplayNumber(slot),
      title: text(task.title),
      archived: task.archived === true,
    }];
  }).filter(([taskNumber]) => Number.isInteger(taskNumber) && taskNumber > 0));
}

export function getTaskPresentation(taskNumber, presentation = {}, fallbackTitle = '') {
  const entry = presentation[taskNumber];
  return {
    displayNumber: text(entry?.displayNumber) || getClassicTaskDisplayNumber(taskNumber),
    title: text(entry?.title) || text(fallbackTitle),
    archived: entry?.archived === true,
  };
}
