import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';

test('private mocks and all-pupil access cannot cross teacher accounts',{timeout:60000},async()=>{
  const exam=(id,teacherId)=>({id,teacherId,title:'Same title',tasks:{1:{question:'Private',answer:'1'}},access:{all:true,students:[],mode:'classic'},monthlyAssignments:{[teacherId]:[getMonthlyMockMonth()]}});
  const f=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[exam('exam-a','teacher-a'),exam('exam-b','teacher-b')]));
  const a=f.tokens['teacher-a'],b=f.tokens['teacher-b'],c=f.tokens['student-c'];
  const saved=()=>JSON.parse(fs.readFileSync(path.join(f.data,'mock-exams.json'),'utf8'));
  try {
    assert.deepEqual((await f.request('/api/mock-exams',a)).map(e=>e.id),['exam-a']);
    assert.deepEqual((await f.request('/api/mock-exams',b)).map(e=>e.id),['exam-b']);
    assert.deepEqual((await f.request('/api/mock-exams',c)).map(e=>e.id),['exam-b']);
    const originalB=saved().find(e=>e.id==='exam-b');
    await f.request('/api/mock-exams/exam-a',b,{access:{all:false}},'PATCH',403);
    await f.request('/api/mock-exams/exam-a',b,undefined,'DELETE',403);
    await f.request('/api/mock-exams/exam-a/monthly-review',b,undefined,'GET',403);
    await f.request('/api/mock-exams/task-analytics?examId=exam-a',b,undefined,'GET',404);
    await f.request('/api/mock-exams/attempt?examId=exam-a',c,undefined,'GET',403);
    await f.request('/api/mock-exams/attempt',c,{examId:'exam-a',startOnly:true},'PUT',403);
    await f.request('/api/broadcast-notifications',b,{text:'Test',mockExamId:'exam-a'},'POST',403);
    const created=await f.request('/api/mock-exams',a,{title:'New',teacherId:'teacher-b'});
    assert.equal(created.teacherId,'teacher-a','The client cannot choose a different owner');
    assert.ok(!(await f.request('/api/mock-exams',b)).some(e=>e.id===created.id));
    await f.request('/api/mock-exams/exam-a',a,{access:{all:false},monthlyAssignment:{assigned:false,month:getMonthlyMockMonth()}},'PATCH');
    assert.deepEqual(saved().find(e=>e.id==='exam-b'),originalB,'Publishing settings stay independent');
    await f.request('/api/mock-exams/exam-a',a,undefined,'DELETE');
    assert.deepEqual(saved().find(e=>e.id==='exam-b'),originalB);
  } finally {await f.stop();}
});
