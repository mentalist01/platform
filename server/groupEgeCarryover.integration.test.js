import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { partitionConcurrentHomeworks } from '../src/utils/concurrentHomework.js';
import { buildHomeworkStatistics } from '../src/utils/homeworkStats.js';

test('real group publication snapshots personal EGE remainders and keeps them after edits and another publication', {timeout:60000},async()=>{
  const tests={7:{basic:[1,2,3,4].map(n=>({id:`q${n}`,question:'Проверка',answer:String(n)}))},101:{python:[{id:'py',question:'print(1)',answer:'1'}]}};
  const f=await createGroupHomeworkFixture(undefined,write=>write('tests',tests));
  try {
    const teacher=f.tokens['teacher-a'], route=`/api/learning-groups/${f.groupId}/assignments`;
    const future=new Date(Date.now()+7*86400000).toISOString();
    const goal=nums=>({type:'task',taskNumber:7,levelId:'basic',targetQuestions:nums,targetQuestionIds:nums.map(n=>`q${n}`)});
    const create=async(title,goals,extra={})=>(await f.request(route,teacher,{title,dueAt:future,
      homework:{studyTrack:'ege',dueAt:future,goals,...extra}},'POST',201)).assignment;
    const old=await create('Старое ЕГЭ',[goal([1,2,3])]);
    const solve=async(id,n)=>f.request('/api/progress/solve',f.tokens[id],{taskNumber:7,levelId:'basic',questionId:`q${n}`,code:String(n)});
    await solve('student-a',1);await solve('student-a',2);await solve('student-b',1);
    await f.request(`${route}/${old.id}`,teacher,{status:'closed'},'PATCH');
    const current=await create('Новое ЕГЭ',[goal([4])],{carryoverEge:true});
    const fetchEntries=async id=>(await f.request('/api/student-next-lesson',f.tokens[id])).homeworks;
    const a=await fetchEntries('student-a'), b=await fetchEntries('student-b');
    const supplement=entries=>entries.find(x=>x.learningEgeCarryover&&x.learningAssignmentId===current.id);
    assert.deepEqual(supplement(a).goals[0].targetQuestionIds,['q3']);
    assert.deepEqual(supplement(b).goals[0].targetQuestionIds,['q2','q3']);
    assert.deepEqual(a.find(x=>x.learningAssignmentId===old.id&&!x.learningEgeCarryover).goals[0].targetQuestionIds,['q1','q2','q3']);
    assert.equal(supplement(a).dueAt,current.dueAt);
    assert.equal(partitionConcurrentHomeworks(a).active.length,2);
    const stored=JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'));
    assert.deepEqual(stored['student-a'].homeworks.find(x=>x.learningAssignmentId===current.id&&!x.learningEgeCarryover).egeCarryoverSnapshot[0].goals[0].targetQuestionIds,['q3']);
    const published=(await f.request(`${route}/${current.id}`,teacher)).assignment;
    assert.equal(published.homework.carryoverEge,true);
    assert.deepEqual(published.homework.goals[0].targetQuestionIds,['q4']);
    await solve('student-b',2);await solve('student-b',3);
    const progressed=await fetchEntries('student-b');
    assert.deepEqual(supplement(progressed).goals[0].targetQuestionIds,['q2','q3']);
    const progress=await f.request('/api/student-data',f.tokens['student-b']);
    assert.equal(buildHomeworkStatistics({homeworks:[supplement(progressed)],studentData:progress,testsDb:tests})[0].completedCount,2);
    await f.request(`${route}/${current.id}`,teacher,{dueAt:new Date(Date.now()+8*86400000).toISOString()},'PATCH');
    assert.equal(supplement(await fetchEntries('student-a')).goals[0].targetQuestionIds[0],'q3');
    const newer=await create('Следующая ЕГЭ',[goal([4])],{carryoverEge:true});
    const nextA=await fetchEntries('student-a'),nextB=await fetchEntries('student-b');
    assert.deepEqual(partitionConcurrentHomeworks(nextA).active.filter(x=>x.learningEgeCarryover).flatMap(x=>x.goals.flatMap(g=>g.targetQuestionIds)),['q3']);
    assert.equal(partitionConcurrentHomeworks(nextB).active.filter(x=>x.learningEgeCarryover).length,0);
    assert.equal(nextA.find(x=>x.learningAssignmentId===newer.id&&!x.learningEgeCarryover).goals[0].targetQuestionIds[0],'q4');
    // Former classmates do not receive another pupil's snapshot.
    assert.equal((await fetchEntries('student-c')).length,0);
    await f.request(`${route}/${newer.id}`,f.tokens['teacher-b'],undefined,'GET',403);
    const target=(await f.request('/api/learning-groups',teacher,{name:'Другая группа'},'POST',201)).group;
    await f.request(`/api/learning-groups/${f.groupId}/members/student-a/transfer`,teacher,{targetGroupId:target.id});
    assert.equal(partitionConcurrentHomeworks(await fetchEntries('student-a')).active.length,0);
  } finally {await f.stop();}
});
