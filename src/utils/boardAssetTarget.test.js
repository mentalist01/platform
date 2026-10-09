import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBoardAssetTarget } from './boardAssetTarget.js';

test('group image uploads ignore a stale pupil/group picker on shared and personal pages', () => {
  for (const roomId of ['board-lesson-lesson-2', 'board-lesson-lesson-2~page~page-1234', 'board-lesson-lesson-2~student~student-a~page~page-1234']) {
    assert.deepEqual(resolveBoardAssetTarget('learning-group:group-2', { roomId }), { lessonId: 'lesson-2', studentId: '' });
    assert.deepEqual(resolveBoardAssetTarget('unrelated-pupil', { lessonId: 'lesson-2', roomId }), { lessonId: 'lesson-2', studentId: '' });
  }
});
test('individual uploads retain the pupil while an explicit group lesson is self-contained', () => {
  assert.deepEqual(resolveBoardAssetTarget('student-a', { roomId: 'board-teacher-a-student-a~page~page-1234' }), { lessonId: '', studentId: 'student-a' });
  assert.deepEqual(resolveBoardAssetTarget('student-a', { lessonId: 'lesson-2' }), { lessonId: 'lesson-2', studentId: '' });
});
