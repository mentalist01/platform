import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';

test('teacher monthly card scopes one pupil and returns the assigned completed score, including zero', {timeout:60000},async()=>{
  const month=getMonthlyMockMonth(),finishedAt=new Date(Date.now()-10000).toISOString();
  const tasks={1:{question:'Один',answer:'1'},26:{question:'Два',answer:'2'},27:{question:'Три',answer:'3'}};
  const fixture=await createGroupHomeworkFixture(undefined,write=>{
    write('mock-exams',[{id:'monthly',title:'Входной пробник',tasks,access:{all:true,mode:'timer'},monthlyAssignments:{'teacher-a':[month]}},{id:'other',title:'Другой пробник',tasks,access:{all:true,mode:'timer'}}]);
    write('progress',{
      'student-a':{mockAttemptResults:[{examId:'monthly',attemptId:'first',status:'finished',finishedAt,tasks,solved:{1:true,26:true,27:true}}],mockAttempts:{monthly:{attemptId:'retry',status:'active',answers:{1:'1'},updatedAt:new Date().toISOString()},other:{status:'finished',finishedAt:new Date(Date.now()-5000).toISOString(),solved:{1:true}}}},
      'student-b':{mockAttempts:{monthly:{attemptId:'zero',status:'finished',mode:'timer',finishedAt,timerFinishedAt:finishedAt,solved:{1:false,26:false,27:false}}}},
    });
  });
  const {request,tokens}=fixture;
  try{
    const a=await request('/api/monthly-mock-status?studentId=student-a',tokens['teacher-a']);
    assert.equal(a.rows.length,1);assert.equal(a.rows[0].studentId,'student-a');assert.equal(a.rows[0].status,'completed');assert.equal(a.rows[0].score,34);
    assert.equal(a.assignment.examId,'monthly');assert.equal(a.assignment.title,'Входной пробник');assert.ok(a.assignment.publishesAt);
    assert.equal((await request('/api/monthly-mock-status?studentId=student-b',tokens['teacher-a'])).rows[0].score,0);
    await request('/api/monthly-mock-status?studentId=student-c',tokens['teacher-a'],null,'GET',403);
    await request('/api/monthly-mock-status?studentId=student-a',tokens['teacher-b'],null,'GET',403);
    const pupil=await request('/api/monthly-mock-status?studentId=student-b',tokens['student-a']);
    assert.equal(pupil.rows.length,1);assert.equal(pupil.rows[0].studentId,'student-a');assert.equal(pupil.assignment.examId,'monthly');
    const other=await request('/api/monthly-mock-status?studentId=student-c',tokens['teacher-b']);
    assert.equal(other.assignment,null);
    const roster=await request('/api/monthly-mock-status',tokens['teacher-a']);assert.equal(roster.rows.length,2);
  }finally{await fixture.stop();}
});

test('the monthly card and report explicitly distinguish first and repeat scores', {timeout:60000},async()=>{
  const month=getMonthlyMockMonth(),finishedAt=new Date(Date.now()-60_000).toISOString(),repeatAt=new Date(Date.now()-30_000).toISOString();
  const tasks=Object.fromEntries(['1','4','7','10','11'].map(key=>[key,{question:key,answer:key}]));
  const first={examId:'monthly',attemptId:'first',attemptNumber:1,isFirstAttempt:true,status:'finished',mode:'timer',finishedAt,timerFinishedAt:finishedAt,tasks,answers:{1:'1',4:'4',10:'10',11:'wrong'},solved:{1:true,4:true,10:true,11:false}};
  const fixture=await createGroupHomeworkFixture(undefined,write=>{
    write('mock-exams',[{id:'monthly',title:'Входной пробник',tasks,access:{all:true,mode:'timer'},monthlyAssignments:{'teacher-a':[month]}}]);
    write('progress',{'student-a':{mockAttemptResults:[first],mockAttempts:{monthly:{...first,attemptId:'retry',attemptNumber:2,isFirstAttempt:false,finishedAt:repeatAt,timerFinishedAt:repeatAt,answers:{...first.answers,7:'wrong',11:'11'},solved:{...first.solved,11:true}}}}});
  });
  try{
    const card=await fixture.request('/api/monthly-mock-status?studentId=student-a',fixture.tokens['teacher-a']);
    assert.equal(card.rows[0].score,27);assert.equal(card.rows[0].attemptNumber,2);assert.equal(card.rows[0].firstAttempt.score,20);
    const report=await fixture.request('/api/student-month-report?studentId=student-a&month='+month,fixture.tokens['teacher-a']);
    assert.equal(report.metrics.mocks.latestScore,27);assert.equal(report.metrics.mocks.latestIsBestAttempt,true);
    assert.match(report.text,/лучший результат/u);
    const roster=await fixture.request('/api/monthly-mock-status',fixture.tokens['teacher-a']);
    assert.equal(Object.hasOwn(roster.rows[0],'firstAttempt'),false);
  }finally{await fixture.stop();}
});
