import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';

test('real answers unlock durable achievements without farming, changing XP twice, or leaking other students',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture();const token=f.tokens['student-a'];
  const collection=()=>f.request('/api/student-achievements',token);
  const claim=()=>f.request('/api/student-achievements/claim',token,{});
  try{
    const before=fs.readFileSync(path.join(f.data,'progress.json'),'utf8');
    assert.equal((await collection()).items.length,148);assert.deepEqual((await claim()).items,[]);
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

test('historical XP credits once across tabs and survives unrelated saves and reopening',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,write=>write('progress',{'student-a':{xpTotal:321,coinsTotal:17,notes:'Сохранить заметку',solvedByTask:{4:{basic:{solved:['old-1','old-2','old-3','old-4','old-5']}}}}}));
  const token=f.tokens['student-a'];
  try{
    const rawBefore=JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))['student-a'];
    const results=await Promise.all([f.request('/api/student-achievements',token),f.request('/api/student-achievements',token)]);
    // First solve chain = 150; five solutions of type 4 = 225.
    assert.ok(results.every(result=>result.xpTotal===696&&result.achievementXpTotal===375));
    const claims=await Promise.all([f.request('/api/student-achievements/claim',token,{}),f.request('/api/student-achievements/claim',token,{})]);
    assert.equal(claims.reduce((sum,result)=>sum+result.historicalXpGained,0),375);
    assert.deepEqual(claims.flatMap(result=>result.items),[]);
    const rawAfter=JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))['student-a'];
    const unchanged=structuredClone(rawAfter);delete unchanged.achievementRewards;unchanged.xpTotal=rawBefore.xpTotal;
    assert.deepEqual(unchanged,rawBefore,'XP credit must preserve every unrelated raw progress field');
    await f.request('/api/student-notes',f.tokens['teacher-a'],{studentId:'student-a',notes:'Новая заметка'},'PATCH');
    const data=await f.request('/api/student-data?studentId=student-a',token);
    assert.equal(data.xpTotal,696);assert.equal(data.coinsTotal,17);assert.equal(data.notes,'Новая заметка');
    assert.deepEqual(data.solvedByTask[4].basic.solved,['old-1','old-2','old-3','old-4','old-5']);
    assert.equal((await f.request('/api/student-achievements/claim',token,{})).historicalXpGained,0);
    assert.equal((await f.request('/api/student-achievements',token)).xpTotal,696);
  }finally{await f.stop();}
});

test('first real answer includes achievement XP in the saved total and repeated solves grant zero',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(),token=f.tokens['student-a'];
  try{
    const solved=await f.request('/api/progress/solve',token,{taskNumber:4,levelId:'basic',questionId:'ege-question',code:'17'});
    assert.equal(solved.xpTotal,solved.xpGained+225); // first solution 150 + first practice day 75
    const claims=await f.request('/api/student-achievements/claim',token,{});
    assert.equal(claims.historicalXpGained,0);
    assert.equal(claims.items.reduce((sum,item)=>sum+item.xpGained,0),225);
    const repeated=await f.request('/api/progress/solve',token,{taskNumber:4,levelId:'basic',questionId:'ege-question',code:'17'});
    assert.equal(repeated.xpGained,0);assert.equal(repeated.xpTotal,solved.xpTotal);
    assert.deepEqual((await f.request('/api/student-achievements/claim',token,{})).items,[]);
  }finally{await f.stop();}
});

test('existing paid version-one rewards receive the increase once without changing other progress', {timeout:60000}, async()=>{
  const prior={xpTotal:1125,coinsTotal:19,notes:'Сохранить',solvedByTask:{4:{basic:{solved:['old-1','old-2','old-3','old-4','old-5']}}},achievementRewards:{version:1,chains:{egeSolved:50,'egeTask:4':75},notifications:{},total:125,historicalXp:125,historicalClaimedXp:125}};
  const f=await createGroupHomeworkFixture(undefined,write=>write('progress',{'student-a':prior})),token=f.tokens['student-a'];
  try{
    const collections=await Promise.all([f.request('/api/student-achievements',token),f.request('/api/student-achievements',token)]);
    assert.ok(collections.every(row=>row.xpTotal===1375&&row.achievementXpTotal===375));
    const claims=await Promise.all([f.request('/api/student-achievements/claim',token,{}),f.request('/api/student-achievements/claim',token,{})]);
    assert.equal(claims.reduce((sum,row)=>sum+row.historicalXpGained,0),250);
    assert.deepEqual(claims.flatMap(row=>row.items),[]);
    const after=JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))['student-a'];
    assert.equal(after.achievementRewards.version,2);assert.equal(after.achievementRewards.historicalClaimedXp,375);
    assert.deepEqual({...after,xpTotal:prior.xpTotal,achievementRewards:prior.achievementRewards},prior);
    await f.request('/api/student-notes',f.tokens['teacher-a'],{studentId:'student-a',notes:'После обновления'},'PATCH');
    assert.equal((await f.request('/api/student-achievements',token)).xpTotal,1375);
    assert.equal((await f.request('/api/student-achievements/claim',token,{})).historicalXpGained,0);
  }finally{await f.stop();}
});

test('first answer after a reward increase separates the old-award top-up from the new practice-day reward', {timeout:60000}, async()=>{
  const f=await createGroupHomeworkFixture(undefined,write=>write('progress',{'student-a':{xpTotal:1125,solvedByTask:{4:{basic:{solved:['old-1','old-2','old-3','old-4','old-5']}}},achievementRewards:{version:1,chains:{egeSolved:50,'egeTask:4':75},notifications:{},total:125,historicalXp:125,historicalClaimedXp:125}}})),token=f.tokens['student-a'];
  try{
    const result=await f.request('/api/progress/solve',token,{taskNumber:4,levelId:'basic',questionId:'ege-question',code:'17'});
    assert.equal(result.xpTotal,1125+result.xpGained+250+75);
    const claim=await f.request('/api/student-achievements/claim',token,{});
    assert.equal(claim.historicalXpGained,250);
    assert.deepEqual(claim.items.map(item=>[item.id,item.xpGained]),[['active-days-1',75]]);
    assert.equal((await f.request('/api/student-achievements',token)).xpTotal,result.xpTotal);
    assert.equal((await f.request('/api/student-achievements/claim',token,{})).historicalXpGained,0);
  }finally{await f.stop();}
});
