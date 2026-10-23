import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';

test('real answers unlock durable achievements without farming, changing XP twice, or leaking other students',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture();const token=f.tokens['student-a'];
  const collection=()=>f.request('/api/student-achievements',token);
  const claim=()=>f.request('/api/student-achievements/claim',token,{});
  try{
    const before=fs.readFileSync(path.join(f.data,'progress.json'),'utf8');
    assert.equal((await collection()).items.length,132);assert.deepEqual((await claim()).items,[]);
    assert.equal(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'),before,'collection cannot rewrite solutions or economy');
    const answer={taskNumber:4,levelId:'basic',questionId:'ege-question',code:'wrong'};
    await f.request('/api/progress/solve',token,answer,'POST',400);assert.deepEqual((await claim()).items,[]);
    const solved=await f.request('/api/progress/solve',token,{...answer,code:'17'});assert.ok(solved.xpGained>0);
    const claims=await Promise.all([claim(),claim()]);const rewards=claims.flatMap(r=>r.items);
    assert.deepEqual(rewards.map(item=>item.id).sort(),['active-days-1','corrections-1','ege-solves-1']);
    await f.request('/api/progress/solve',token,{...answer,code:'17'});assert.deepEqual((await claim()).items,[]);
    const state=JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))['student-a'];assert.equal(state.xpTotal,solved.xpTotal);
    assert.equal((await collection()).items.find(item=>item.id==='ege-solves-1').unlocked,true);
    await f.request('/api/student-achievements?studentId=student-a',f.tokens['student-b'],undefined,'GET',403);
    await f.request('/api/student-achievements?studentId=student-a',f.tokens['teacher-b'],undefined,'GET',403);
    await f.request('/api/student-achievements/claim',f.tokens['teacher-a'],{},'POST',403);
    await f.request('/api/student-achievements/claim',f.tokens['student-b'],{studentId:'student-a'},'POST',403);
    assert.equal((await f.request('/api/student-achievements',f.tokens['student-b'])).items.some(item=>item.unlocked),false);
    assert.equal((await f.request('/api/student-achievements?studentId=student-a',f.tokens['teacher-a'])).items.find(item=>item.id==='corrections-1').unlocked,true);
  }finally{await f.stop();}
});
test('real untimed finishes award once; an active mock never awards a score',{timeout:60000},async()=>{
  const month=getMonthlyMockMonth();
  const f=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[{id:'monthly',title:'Пробник',tasks:{1:{question:'1',answer:'1'}},access:{all:true,mode:'classic'},monthlyAssignments:{'teacher-a':[month]}}]));
  const token=f.tokens['student-a'],send=body=>f.request('/api/mock-exams/attempt',token,{examId:'monthly',mode:'classic',...body},'PUT');
  try{
    await send({startOnly:true});assert.deepEqual((await f.request('/api/student-achievements/claim',token,{})).items,[]);
    await send({answers:{1:'1'}});assert.deepEqual((await f.request('/api/student-achievements/claim',token,{})).items,[]);
    await send({answers:{1:'1'},finishAttempt:true});const awards=await f.request('/api/student-achievements/claim',token,{});assert.ok(awards.items.some(item=>item.id==='mock-count-1'));
    assert.equal((await f.request('/api/student-achievements',token)).items.find(item=>item.id==='mock-count-3').value,1);
    assert.deepEqual((await f.request('/api/student-achievements/claim',token,{})).items,[]);
  }finally{await f.stop();}
});

test('timed finish awards without waiting for a collection GET and keeps the timer result intact',{timeout:60000},async()=>{
  const month=getMonthlyMockMonth();
  const f=await createGroupHomeworkFixture(undefined,write=>write('mock-exams',[{id:'monthly',title:'Пробник с таймером',tasks:{1:{question:'1',answer:'1'}},access:{all:true,mode:'timer'},monthlyAssignments:{'teacher-a':[month]}}]));
  const token=f.tokens['student-a'],send=body=>f.request('/api/mock-exams/attempt',token,{examId:'monthly',mode:'timer',...body},'PUT');
  try{
    await send({startOnly:true});const result=await send({answers:{1:'1'},finishTimerExam:true});
    const before=fs.readFileSync(path.join(f.data,'progress.json'),'utf8');
    assert.ok((await f.request('/api/student-achievements/claim',token,{})).items.some(item=>item.id==='mock-count-1'));
    const collection=await f.request('/api/student-achievements',token);
    assert.equal(collection.items.find(item=>item.id==='mock-count-1').unlocked,true);
    assert.equal(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'),before);
    assert.ok(result.finishedAt || result.timerFinishedAt || result.status==='finished');
  }finally{await f.stop();}
});
