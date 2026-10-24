import test from 'node:test';import assert from 'node:assert/strict';
import {collapsedLessonPageTree} from './lessonPageTree.js';
test('27 task pages stay compact; expanding 26 shows its eight named parts in order without changing identities',()=>{
  const pages=[...Array.from({length:27},(_,i)=>({id:String(i+1),title:String(i+1)})),...Array.from({length:8},(_,i)=>({id:'part-'+i,parentId:'26',title:'Часть '+(i+1)}))];
  assert.equal(collapsedLessonPageTree(pages).length,27);assert.equal(collapsedLessonPageTree(pages).find(page=>page.id==='26').childCount,8);
  const open=collapsedLessonPageTree(pages,new Set(['26']));assert.equal(open.length,35);assert.deepEqual(open.slice(26,34).map(page=>page.id),pages.slice(27).map(page=>page.id));assert.equal(open.at(-1).id,'27');assert.equal(pages.length,35);
});
