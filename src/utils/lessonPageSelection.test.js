import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonPageSelectionKey,readLessonPageSelection,writeLessonPageSelection,lessonBookForCodeRoom,lessonCodePageId,lessonBoardPageId} from './lessonPageSelection.js';
test('board and code resolve the same book and retain separate student/teacher selections',()=>{
  assert.equal(lessonBookForCodeRoom('collab-t-a'),'board-t-a~pages');
  assert.equal(lessonBookForCodeRoom('collab-lesson-x~student~a'),'board-lesson-x~pages');
  assert.equal(lessonBookForCodeRoom('py-collab-task'), '');
  assert.notEqual(lessonPageSelectionKey('board-t-a~pages','teacher','t'),lessonPageSelectionKey('board-t-a~pages','student','a'));
  assert.equal(lessonCodePageId('main'),'page-main');assert.equal(lessonBoardPageId('page-main'),'main');
});
test('selection events update both panes once and survive remount without emitting a loop',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},events=[];
  const target={dispatchEvent:event=>events.push(event.detail)};const key='qa-lesson-selection';
  assert.equal(readLessonPageSelection(key,'main',storage),'main');
  writeLessonPageSelection(key,'page-test-02',storage,target);writeLessonPageSelection(key,'page-test-02',storage,target);
  assert.equal(events.length,1);assert.equal(readLessonPageSelection(key,'main',storage),'page-test-02');
  assert.equal(writeLessonPageSelection(key,'bad',storage,target),'page-test-02');
  writeLessonPageSelection(key,()=> 'main',storage,target);assert.equal(events.length,2);
});
test('unavailable preference storage does not stop switching pages',()=>{
  const storage={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');}};
  assert.equal(writeLessonPageSelection('qa-blocked-storage','page-test-02',storage,null),'page-test-02');
  assert.equal(readLessonPageSelection('qa-blocked-storage','main',storage),'page-test-02');
});
