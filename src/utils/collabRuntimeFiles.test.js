import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAB_TASK_FILE_CATEGORY_CLASS,
  COLLAB_TASK_FILE_CATEGORY_TESTING,
  buildTestingRuntimeFiles,
  normalizeCollabTaskFileCategory,
} from './collabRuntimeFiles.js';

test('buildTestingRuntimeFiles exposes question attachments under their original names', () => {
  const files = buildTestingRuntimeFiles({
    17: {
      basic: [{
        id: 'question-1',
        files: [{
          id: 'file-1',
          name: '17.txt',
          storageName: 'stored-17.txt',
        }],
      }],
    },
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].taskNumber, 17);
  assert.equal(files[0].category, COLLAB_TASK_FILE_CATEGORY_TESTING);
  assert.equal(files[0].questionNumber, 1);
  assert.equal(files[0].name, '17.txt');
  assert.equal(files[0].url, '/uploads/stored-17.txt');
  assert.equal(files[0].folderPath, 'Обязательный/Задача 1');
  assert.match(files[0].id, /^testing:17:basic:question-1:/);
});

test('buildTestingRuntimeFiles ignores entries that cannot be mounted', () => {
  const files = buildTestingRuntimeFiles({
    17: {
      basic: [
        { files: [{ name: '', url: '/uploads/missing-name' }] },
        { files: [{ name: 'missing-url.txt' }] },
      ],
    },
  });

  assert.deepEqual(files, []);
});

test('normalizeCollabTaskFileCategory accepts testing and keeps a safe legacy fallback', () => {
  assert.equal(normalizeCollabTaskFileCategory('testing'), COLLAB_TASK_FILE_CATEGORY_TESTING);
  assert.equal(normalizeCollabTaskFileCategory('unknown'), COLLAB_TASK_FILE_CATEGORY_CLASS);
});
