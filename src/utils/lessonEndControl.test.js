import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonEndPhase,changeLessonEnd} from './lessonEndControl.js';
test('countdown is exactly thirty seconds; manual continuation has no visible timer and stale windows cannot change it',()=>{
  const job={desired:'record',status:'recording',occurrence:{endMs:100000},cutoffAt:100000,endControl:{version:1,mode:'scheduled',revision:0}};
  assert.equal(lessonEndPhase(job,69999),null);assert.equal(lessonEndPhase(job,70000),'question');assert.equal(lessonEndPhase(job,100000),'ended');
  const control=changeLessonEnd(job,{mode:'manual',revision:0},99000);assert.equal(control.mode,'manual');
  const manual={...job,cutoffAt:1000000,endControl:control};assert.equal(lessonEndPhase(manual,500000),'manual');
  assert.throws(()=>changeLessonEnd(manual,{mode:'timed',minutes:10,revision:0},500000),/другом окне/);
  assert.throws(()=>changeLessonEnd(job,{mode:'timed',minutes:100,revision:0},99000),/5, 10, 15 или 30/);
});
