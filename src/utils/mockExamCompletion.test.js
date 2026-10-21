import test from 'node:test';
import assert from 'node:assert/strict';
import {getMockExamRemainingMs,getMockExamResultFeedback,isMockAttemptFinished} from './mockExamCompletion.js';

test('finished timer is frozen at the acknowledged finish, including legacy finishedAt and status-only records',()=>{
  const attempt={timerExpiresAt:'2026-10-21T11:00:00Z',timerFinishedAt:'2026-10-21T10:15:00Z'};
  for(const now of [Date.parse('2026-10-21T10:20Z'),Date.parse('2027-01-01T00:00Z')])assert.equal(getMockExamRemainingMs(attempt,now),45*60_000);
  assert.equal(getMockExamRemainingMs({...attempt,timerFinishedAt:'',finishedAt:attempt.timerFinishedAt},Date.now()),45*60_000);
  assert.equal(getMockExamRemainingMs({...attempt,timerFinishedAt:'',status:'finished'},Date.now()),0);
  assert.equal(getMockExamRemainingMs({...attempt,timerFinishedAt:'2026-10-21T11:00:03Z'},Date.now()),0);
  assert.equal(getMockExamRemainingMs({...attempt,timerPausedAt:'2026-10-21T10:00Z',timerRemainingMs:1234},Date.now()),1234);
  assert.equal(getMockExamRemainingMs({},100,999),999);assert.equal(isMockAttemptFinished({status:'active'}),false);
});

test('active and paused clocks still run or remain paused; a finish never resumes a countdown',()=>{
  const attempt={timerExpiresAt:'2026-10-21T11:00Z'};
  assert.equal(getMockExamRemainingMs(attempt,Date.parse('2026-10-21T10:59Z')),60_000);
  assert.equal(getMockExamRemainingMs(attempt,Date.parse('2026-10-21T10:59:01Z')),59_000);
  assert.equal(getMockExamRemainingMs({...attempt,timerPausedAt:'2026-10-21T10:59Z',timerRemainingMs:60_000},Date.now()),60_000);
});

test('teacher milestones use inclusive bounds and the academic month in Moscow, with kind feedback below the range',()=>{
  const stages=[['2026-09-20',0,30],['2026-10-20',0,30],['2026-11-20',0,30],['2026-12-20',30,50],['2027-01-20',60,80],['2027-02-20',60,80],['2027-03-20',80,100],['2027-04-20',80,100],['2027-05-20',80,100]];
  for(const [date,min,max] of stages){
    for(const score of [min,max]){const value=getMockExamResultFeedback(score,date);assert.equal(value.stage.min,min);assert.equal(value.stage.max,max);assert.equal(value.tone,score===100?'excellent':'steady');}
    if(min>0)assert.equal(getMockExamResultFeedback(min-1,date).tone,'support');
    if(max<100)assert.equal(getMockExamResultFeedback(max+1,date).tone,'excellent');
  }
  assert.equal(getMockExamResultFeedback(40,'2026-11-30T21:01:00Z').stage.min,30,'already December in Moscow');
  const zero=getMockExamResultFeedback(0,'2026-10-21');assert.equal(zero.tone,'steady');assert.match(zero.title,/точка старта/);
  assert.equal(getMockExamResultFeedback(100,'2026-10-21').tone,'excellent');
  assert.equal(getMockExamResultFeedback(25,'2027-07-20').stage,null,'no invented summer milestone');
});
