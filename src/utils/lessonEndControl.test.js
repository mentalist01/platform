import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonEndPhase,changeLessonEnd,formatLessonEndRemaining} from './lessonEndControl.js';
test('question starts three minutes before the real deadline; manual continuation and stale windows remain safe',()=>{
  const job={desired:'record',status:'recording',occurrence:{endMs:1000000},cutoffAt:1000000,endControl:{version:1,mode:'scheduled',revision:0}};
  assert.equal(lessonEndPhase(job,819999),null);assert.equal(lessonEndPhase(job,820000),'question');
  assert.equal(lessonEndPhase(job,999999),'question');assert.equal(lessonEndPhase(job,1000000),'ended');
  const control=changeLessonEnd(job,{mode:'manual',revision:0},99000);assert.equal(control.mode,'manual');
  const manual={...job,cutoffAt:1000000,endControl:control};assert.equal(lessonEndPhase(manual,500000),'manual');
  assert.throws(()=>changeLessonEnd(manual,{mode:'timed',minutes:10,revision:0},500000),/другом окне/);
  assert.throws(()=>changeLessonEnd(job,{mode:'timed',minutes:100,revision:0},99000),/5, 10, 15 или 30/);
});
test('extended lessons get the same three-minute notice at their new deadline',()=>{
  const job={desired:'record',status:'recording',occurrence:{endMs:1000000},cutoffAt:1600000,endControl:{version:1,mode:'timed',untilMs:1600000,revision:1}};
  assert.equal(lessonEndPhase(job,1419999),null);assert.equal(lessonEndPhase(job,1420000),'question');
  assert.equal(lessonEndPhase(job,1599999),'question');assert.equal(lessonEndPhase(job,1600000),'ended');
  assert.equal(formatLessonEndRemaining(180000),'3:00');assert.equal(formatLessonEndRemaining(179100),'3:00');
  assert.equal(formatLessonEndRemaining(61000),'1:01');assert.equal(formatLessonEndRemaining(-1),'0:00');
});

test('an interrupted recording part does not claim that the ongoing lesson ended',()=>{
  const job={desired:'stop',status:'ready',cutoffAt:1000000,occurrence:{endMs:1000000},endControl:{version:1,mode:'scheduled',revision:0}};
  for(const stopReason of ['explicit-hangup','reconnect-timeout','next-platform-lesson',''])assert.equal(lessonEndPhase({...job,stopReason},500000),null);
  for(const stopReason of ['end-button','end-countdown'])assert.equal(lessonEndPhase({...job,stopReason},500000),'ended');
  assert.equal(lessonEndPhase({...job,stopReason:'reconnect-timeout'},1000000),'ended');
});
