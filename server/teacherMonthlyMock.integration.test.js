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
