import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareLessonReplayBoardSandboxItems } from './lessonReplayBoardSandbox.js';

test('preserves recorded task geometry before the fullscreen board normalizes legacy cards', () => {
  const source = [{
    id: 'task-11',
    type: 'task',
    width: 720,
    height: 340,
    studentCode: '',
    screenshots: [{ assetUrl: '/uploads/board-asset-a.png', displayHeight: 92 }],
  }];

  const [prepared] = prepareLessonReplayBoardSandboxItems(source, { layoutVersion: 3 });

  assert.equal(prepared.contentWidth, 720);
  assert.equal(prepared.contentHeight, 340);
  assert.equal(prepared.codePanelLayoutVersion, 3);
  assert.deepEqual(prepared.screenshots, source[0].screenshots);
  assert.equal(source[0].contentHeight, undefined);
});

test('keeps current task geometry referentially stable', () => {
  const task = {
    id: 'task-current',
    type: 'task',
    width: 540,
    height: 300,
    contentWidth: 720,
    contentHeight: 400,
    codePanelLayoutVersion: 3,
  };

  const [prepared] = prepareLessonReplayBoardSandboxItems([task], { layoutVersion: 3 });
  assert.strictEqual(prepared, task);
});
