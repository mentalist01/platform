import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyGlobalCatalogToTeacherStores,
  applyGlobalTestsUpdate,
  applyTeacherTestsUpdate,
  getSharedNextTaskNumber,
  mergeTeacherTestsDb,
  normalizeTeacherTaskContentStore,
} from './teacherTaskContent.js';

const bank = (answer) => ({ basic: [{ id: answer, answer: String(answer) }], advanced: [], expert: [] });

test('teacher test changes stay private and inherit untouched global tasks', () => {
  const globalTests = { 1: bank(1), 2: bank(2) };
  const changed = applyTeacherTestsUpdate({}, 'teacher-a', globalTests, {
    1: bank(10),
    2: bank(2),
  });
  assert.deepEqual(changed.changedTaskKeys, ['1']);
  assert.deepEqual(changed.store.teachers['teacher-a'].tests, { 1: bank(10) });
  assert.deepEqual(mergeTeacherTestsDb(globalTests, changed.store.teachers['teacher-a']), {
    1: bank(10),
    2: bank(2),
  });
  const reverted = applyTeacherTestsUpdate(changed.store, 'teacher-a', globalTests, globalTests);
  assert.deepEqual(reverted.store.teachers['teacher-a'].tests, {});
});

test('global test changes replace the same topic override for every teacher only', () => {
  const store = normalizeTeacherTaskContentStore({
    teachers: {
      a: { tests: { 1: bank(11), 2: bank(12) } },
      b: { tests: { 1: bank(21), 3: bank(23) } },
    },
  });
  const result = applyGlobalTestsUpdate(store, { 1: bank(1), 2: bank(2), 3: bank(3) }, {
    1: bank(100), 2: bank(2), 3: bank(3),
  });
  assert.deepEqual(result.changedTaskKeys, ['1']);
  assert.deepEqual(result.store.teachers.a.tests, { 2: bank(12) });
  assert.deepEqual(result.store.teachers.b.tests, { 3: bank(23) });
});

test('global catalog rollout archives teacher-only identities instead of losing homework links', () => {
  const globalCatalog = {
    nextTaskNumber: 30,
    activeTasks: [{ taskNumber: 1, slotNumber: 1, title: 'Global', xpReward: 20 }],
    archivedTasks: [],
  };
  const store = {
    nextTaskNumber: 30,
    teachers: {
      a: {
        catalog: {
          tasks: [
            { taskNumber: 1, number: 2, title: 'Personal global', xpReward: 20 },
            { taskNumber: 28, number: 1, title: 'Personal only', xpReward: 100 },
          ],
          archivedTasks: [],
        },
        tests: { 28: bank(28) },
      },
    },
  };
  const next = applyGlobalCatalogToTeacherStores(store, globalCatalog, ['a', 'b']);
  assert.equal(next.teachers.a.catalog.tasks[0].number, 1);
  assert.equal(next.teachers.a.catalog.archivedTasks[0].taskNumber, 28);
  assert.deepEqual(next.teachers.a.tests[28], bank(28));
  assert.equal(next.teachers.b.catalog.tasks[0].title, 'Global');
  assert.deepEqual(next.teachers.b.catalog.archivedTasks, []);
});

test('task identities are allocated above every global and personal catalog', () => {
  const next = getSharedNextTaskNumber({
    nextTaskNumber: 29,
    teachers: {
      a: { catalog: { tasks: [{ taskNumber: 31, number: 1, title: 'A' }] } },
    },
  }, {
    activeTasks: [{ taskNumber: 30 }],
    archivedTasks: [{ taskNumber: 32 }],
  });
  assert.equal(next, 33);
});
