import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {getMonthlyMockMonth,getMonthlyMockPeriod} from '../src/utils/monthlyMockExam.js';

test('monthly attempts are limited server-side, keep the best score and archive as read-only',{timeout:60000},async()=>{
  const month=getMonthlyMockMonth(),period=getMonthlyMockPeriod(month),past=getMonthlyMockMonth(period.startMs-1000);
  const tasks=Object.fromEntries(['1','4','10','11'].map(key=>[key,{question:key,answer:key}]));
  const fixture=await createGroupHomeworkFixture(undefined,write=>{
    const exam=(id,assignedMonth)=>({id,title:id,tasks,access:{all:true,mode:'timer'},monthlyAssignments:{'teacher-a':[assignedMonth]}});
    write('mock-exams',[exam('monthly',month),exam('history',past),{id:'homework',title:'Старая домашка',tasks,access:{all:true,mode:'timer'}}]);
    write('progress',{
      'student-a':{homeworks:[{id:'h',issuedAt:new Date().toISOString(),goals:[{type:'mock',mockExamId:'homework',mode:'timer'}]}],mockAttempts:{history:{attemptId:'old',attemptNumber:1,monthlyMockMonth:past,monthlyMockOrdinal:1,mode:'timer',status:'finished',finishedAt:new Date(getMonthlyMockPeriod(past).startMs+1000).toISOString(),solved:{1:true}}}},
      'student-b':{mockAttempts:{monthly:{attemptId:'fifth',attemptNumber:1,monthlyMockMonth:month,monthlyMockOrdinal:5,mode:'timer',status:'active',timerStartedAt:new Date().toISOString(),timerExpiresAt:new Date(Date.now()+3_600_000).toISOString(),answers:{}}}},
    });
  });
  const {request,tokens}=fixture,pupil=tokens['student-a'];
  const write=(token,body,expected=200)=>request('/api/mock-exams/attempt',token,{examId:'monthly',mode:'timer',...body},'PUT',expected);
  try{
    await request('/api/mock-exams/attempt',pupil,{examId:'homework',mode:'timer',startOnly:true},'PUT',403);
    await request('/api/mock-exams/attempt',pupil,{examId:'history',mode:'timer',startOnly:true,restartTimerExam:true},'PUT',403);
    const list=await request('/api/mock-exams',pupil);assert.equal(list.find(e=>e.id==='history').readOnly,true);assert.equal(list.find(e=>e.id==='monthly').readOnly,false);
    const archive=await request('/api/mock-exams/attempt?examId=history',pupil);assert.equal(archive.readOnly,true);
    let attempt=await write(pupil,{startOnly:true});assert.equal(attempt.monthlyPolicy.maxAttempts,3);
    attempt=await write(pupil,{finishTimerExam:true,answers:{1:'1',4:'4',10:'10',11:'wrong'}});
    assert.equal(attempt.attemptNumber,1);
    assert.equal(Object.hasOwn(attempt.bestAttempt.examSnapshot.tasks['11'],'answer'),false,'a retake must not disclose the answer key');
    attempt=await write(pupil,{startOnly:true,restartTimerExam:true});assert.equal(attempt.attemptNumber,2);assert.equal(attempt.monthlyPolicy.remainingAttempts,1);
    await write(pupil,{finishTimerExam:true,answers:{1:'1',4:'4',10:'10',11:'11'}});
    await write(pupil,{startOnly:true,restartTimerExam:true});await write(pupil,{finishTimerExam:true,answers:{1:'1'}});
    const exhausted=await write(pupil,{startOnly:true,restartTimerExam:true},409);assert.equal(exhausted.code,'MOCK_ATTEMPTS_EXHAUSTED');
    const current=await request('/api/mock-exams/attempt?examId=monthly',pupil);assert.equal(current.attemptNumber,2);assert.equal(current.monthlyPolicy.usedAttempts,3);assert.equal(current.monthlyPolicy.canRestart,false);
    const report=await request('/api/student-month-report?studentId=student-a&month='+month,tokens['teacher-a']);assert.equal(report.metrics.mocks.latestScore,27);assert.equal(report.metrics.mocks.count,1);assert.equal(report.metrics.mocks.latestIsBestAttempt,true);
    const card=await request('/api/monthly-mock-status?studentId=student-a',tokens['teacher-a']);assert.equal(card.rows[0].score,27);assert.equal(card.rows[0].attemptNumber,2);
    const stored=JSON.parse(fs.readFileSync(path.join(fixture.data,'progress.json'),'utf8'))['student-a'];assert.equal(stored.mockAttemptResults.filter(a=>a.examId==='monthly').length,3);
    const fifth=await write(tokens['student-b'],{finishTimerExam:true,answers:{1:'1'}});assert.equal(fifth.monthlyPolicy.maxAttempts,1);
    assert.equal((await write(tokens['student-b'],{startOnly:true,restartTimerExam:true},409)).code,'MOCK_ATTEMPTS_EXHAUSTED');
    await request('/api/mock-exams/attempt?studentId=student-a&examId=monthly',tokens['student-b'],null,'GET',403);
  }finally{await fixture.stop();}
});

test('untimed monthly exams obey the same three-attempt limit',{timeout:60000},async()=>{
  const month=getMonthlyMockMonth();
  const fixture=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[{id:'monthly',title:'Обычный пробник',tasks:{1:{question:'1',answer:'1'}},access:{all:true,mode:'classic'},monthlyAssignments:{'teacher-a':[month]}}]));
  const send=(body,status=200)=>fixture.request('/api/mock-exams/attempt',fixture.tokens['student-a'],{examId:'monthly',mode:'classic',...body},'PUT',status);
  try{
    for(let i=1;i<=3;i++){
      const started=await send({startOnly:true,...(i>1?{restartTimerExam:true}:{})});assert.equal(started.attemptNumber,i);
      await send({finishAttempt:true,answers:{1:i===2?'1':'wrong'}});
    }
    assert.equal((await send({startOnly:true,restartTimerExam:true},409)).code,'MOCK_ATTEMPTS_EXHAUSTED');
    const card=await fixture.request('/api/monthly-mock-status',fixture.tokens['student-a']);assert.equal(card.rows[0].score,7);
  }finally{await fixture.stop();}
});
