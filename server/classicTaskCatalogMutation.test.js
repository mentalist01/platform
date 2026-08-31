import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDefaultClassicTaskCatalog } from '../src/data/classicTaskCatalog.js';
import {
  buildClassicTaskCatalogMutation,
  initializeAddedClassicTaskBanks,
  normalizeStoredClassicTaskCatalog,
  serializeClassicTaskCatalogForClient,
} from './classicTaskCatalogMutation.js';

const buildRequestedDemoLayout = () => buildDefaultClassicTaskCatalog()
  .filter((task) => task.number !== 10)
  .map((task) => {
    if (task.taskNumber === 13) return { ...task, slotNumber: 10 };
    if (task.taskNumber === 23) return { ...task, slotNumber: 13 };
    return { ...task, slotNumber: task.number };
  })
  .concat({ taskNumber: null, slotNumber: 23, title: 'Новое задание 23', xpReward: 200 });

test('changes visible EGE numbers while preserving stable task identities', () => {
  const current = normalizeStoredClassicTaskCatalog({ tasks: buildDefaultClassicTaskCatalog() });
  const result = buildClassicTaskCatalogMutation(
    current,
    { tasks: buildRequestedDemoLayout() },
    new Date('2026-08-30T12:00:00.000Z'),
  );
  const client = serializeClassicTaskCatalogForClient(result.catalog);

  assert.equal(client.tasks.find((task) => task.taskNumber === 13)?.displayNumber, '10');
  assert.equal(client.tasks.find((task) => task.taskNumber === 23)?.displayNumber, '13');
  assert.equal(client.tasks.find((task) => task.displayNumber === '23')?.taskNumber, 28);
  assert.deepEqual(result.addedTaskNumbers, [28]);
  assert.deepEqual(result.archivedTaskNumbers, [10]);
  assert.equal(result.catalog.archivedTasks[0].title, 'Word');
  assert.equal(result.catalog.archivedTasks[0].archivedAt, '2026-08-30T12:00:00.000Z');
});

test('does not touch existing homework, progress, answers or files when cards move', () => {
  const current = normalizeStoredClassicTaskCatalog({ tasks: buildDefaultClassicTaskCatalog() });
  const studentHistory = {
    progress: { 10: 100, 13: 70, 23: 40 },
    solvedByTask: { 10: { basic: { solved: ['a'] } }, 13: { basic: { solved: ['b'] } } },
    homeworks: [{ id: 'old-homework', goals: [{ type: 'task', taskNumber: 13 }] }],
    solvedEvents: [{ taskNumber: 13, questionId: 'b' }],
  };
  const before = structuredClone(studentHistory);

  buildClassicTaskCatalogMutation(current, { tasks: buildRequestedDemoLayout() });

  assert.deepEqual(studentHistory, before);
  assert.equal(studentHistory.homeworks[0].goals[0].taskNumber, 13);
  assert.equal(studentHistory.solvedByTask['13'].basic.solved[0], 'b');
});

test('initializes only a new question bank and keeps archived banks intact', () => {
  const testsDb = {
    10: { basic: [{ id: 'old-10' }] },
    13: { basic: [{ id: 'old-13' }] },
    23: { basic: [{ id: 'old-23' }] },
  };
  const next = initializeAddedClassicTaskBanks(testsDb, [28]);

  assert.equal(next['10'].basic[0].id, 'old-10');
  assert.equal(next['13'].basic[0].id, 'old-13');
  assert.equal(next['23'].basic[0].id, 'old-23');
  assert.deepEqual(next['28'], { basic: [], advanced: [], expert: [] });
});

test('rejects duplicate visible slots and changes to the combined 19-21 card', () => {
  const current = normalizeStoredClassicTaskCatalog({ tasks: buildDefaultClassicTaskCatalog() });
  assert.throws(
    () => buildClassicTaskCatalogMutation(current, {
      tasks: [
        { taskNumber: 1, slotNumber: 2, title: 'A' },
        { taskNumber: 2, slotNumber: 2, title: 'B' },
      ],
    }),
    /занят двумя карточками/,
  );

  assert.throws(
    () => buildClassicTaskCatalogMutation(current, {
      tasks: buildDefaultClassicTaskCatalog()
        .filter((task) => task.taskNumber !== 19)
        .map((task) => ({ ...task, slotNumber: task.number })),
    }),
    /19–21/,
  );
});

test('saving and restoring archived cards never reuses an identity or changes rewards', () => {
  const changed = buildClassicTaskCatalogMutation(
    { tasks: buildDefaultClassicTaskCatalog() }, { tasks: buildRequestedDemoLayout() },
  ).catalog;
  const client = serializeClassicTaskCatalogForClient(changed);
  const normalized = normalizeStoredClassicTaskCatalog(client);
  assert.equal(normalized.activeTasks.find((task) => task.taskNumber === 13).slotNumber, 10);
  assert.equal(normalized.activeTasks.find((task) => task.taskNumber === 28).slotNumber, 23);
  const restored = buildClassicTaskCatalogMutation(changed, {
    tasks: client.tasks.filter((task) => task.number !== 28).concat({
      taskNumber: 10, slotNumber: 23, title: 'Восстановленный Word', xpReward: 9999,
    }),
  });
  assert.equal(restored.catalog.activeTasks.find((task) => task.taskNumber === 10).xpReward, 10);
  assert.deepEqual(restored.addedTaskNumbers, []);
  assert.deepEqual(restored.catalog.archivedTasks.map((task) => task.taskNumber), [28]);
  const next = buildClassicTaskCatalogMutation(restored.catalog, {
    tasks: serializeClassicTaskCatalogForClient(restored.catalog).tasks.filter((task) => task.number !== 10)
      .concat({ taskNumber: null, slotNumber: 23, title: 'Ещё новая карточка' }),
  });
  assert.deepEqual(next.addedTaskNumbers, [29]);
});
