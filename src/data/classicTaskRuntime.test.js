import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClassicTaskCatalog } from './classicTaskCatalog.js';
import { setClassicTaskRuntimeCatalog, formatClassicTaskNumber, getClassicTask } from './classicTaskRuntime.js';

test('renumbered task labels use the active slot while bank identities stay unchanged', () => {
  const tasks = normalizeClassicTaskCatalog([
    { taskNumber: 13, slotNumber: 23, title: 'Moved topic' },
    { taskNumber: 23, slotNumber: 13, title: 'Other moved topic' },
  ]);
  setClassicTaskRuntimeCatalog({ tasks, archivedTasks: [{ taskNumber: 13, lastSlotNumber: 13, displayNumber: '13' }] });
  assert.equal(formatClassicTaskNumber(13), '23');
  assert.equal(formatClassicTaskNumber(23), '13');
  assert.equal(formatClassicTaskNumber(19), '19-21');
  assert.equal(getClassicTask(13).number, 13);
});
