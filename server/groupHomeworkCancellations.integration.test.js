import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {partitionConcurrentHomeworks} from '../src/utils/concurrentHomework.js';
import {HomeworkLivesStore} from './homeworkLives.js';
const goal=(task,ids,levelId='basic')=>({type:'task',taskNumber:task,levelId,targetQuestions:ids,targetQuestionIds:ids.map(n=>`${task}-${levelId}-${n}`)});
const tests=Object.fromEntries([4,7].map(task=>[task,Object.fromEntries(['basic','advanced'].map(level=>[level,[1,2,3,4].map(n=>({id:`${task}-${level}-${n}`,question:'Проверка',answer:String(n)}))]))]));

test('whole-task and number cancellation affect every pupil, survive carryover, allow a new explicit issue and undo', {timeout:60000},async()=>{
 const f=await createGroupHomeworkFixture(undefined,write=>write('tests',tests));
 try{
  const teacher=f.tokens['teacher-a'],route=`/api/learning-groups/${f.groupId}/assignments`,dueAt=new Date(Date.now()+7*86400000).toISOString();
  const create=async(goals,carryoverEge=false)=>(await f.request(route,teacher,{title:'ЕГЭ',dueAt,homework:{studyTrack:'ege',dueAt,goals,carryoverEge}},'POST',201)).assignment;
  const old=await create([goal(7,[1,2]),goal(4,[1,2]),goal(4,[1],'advanced')]);
  await f.request('/api/progress/solve',f.tokens['student-a'],{taskNumber:7,levelId:'basic',questionId:'7-basic-1',code:'1'});
  await f.request(`${route}/${old.id}`,teacher,{status:'closed'},'PATCH');
  const current=await create([goal(7,[3,4])],true),endpoint=`${route}/${current.id}/ege-cancellations`;
  const active=async(id)=>(partitionConcurrentHomeworks((await f.request('/api/student-next-lesson',f.tokens[id])).homeworks).active);
  const row=async(id,task)=>(await active(id))[0].goals.find(g=>g.taskNumber===task&&g.levelId==='basic');
  assert.deepEqual((await f.request(endpoint,teacher)).tasks.map(x=>`${x.taskNumber}|${x.levelId}`),['4|advanced','4|basic','7|basic']);
  await f.request(endpoint,f.tokens['teacher-b'],undefined,'GET',403);
  await f.request(endpoint,f.tokens['student-a'],undefined,'GET',403);
  await f.request(endpoint,teacher,{taskNumber:7,levelId:'basic',targetQuestionIds:['forged']},'POST',400);
  const cancellation=(await f.request(endpoint,teacher,{taskNumber:4,all:true},'POST',201)).cancellation;
  for(const id of ['student-a','student-b'])assert.equal((await active(id))[0].goals.some(g=>g.taskNumber===4),false);
  const disk=JSON.parse(fs.readFileSync(path.join(f.data,'group-homework-cancellations.json'),'utf8'));
  assert.equal(disk.length,2);assert.ok(disk.every(record=>record.sourceAssignmentIds.includes(old.id)&&record.sourceAssignmentIds.includes(current.id)));
  await f.request(`${endpoint}/${cancellation.id}`,teacher,undefined,'DELETE');
  assert.equal((await active('student-a'))[0].goals.filter(g=>g.taskNumber===4).length,2);
  await f.request(endpoint,teacher,{taskNumber:4,all:true},'POST',201);
  await f.request(endpoint,teacher,{taskNumber:7,levelId:'basic',targetQuestionIds:['7-basic-2']},'POST',201);
  assert.deepEqual((await row('student-a',7)).targetQuestions,[3,4]);
  assert.deepEqual((await row('student-b',7)).targetQuestions,[1,3,4]);
  const fresh=await create([goal(7,[2])],true);
  assert.deepEqual((await row('student-a',7)).targetQuestions,[2,3,4]);
  assert.deepEqual((await row('student-b',7)).targetQuestions,[1,2,3,4]);
  assert.equal((await active('student-b'))[0].goals.some(g=>g.taskNumber===4),false);
  const next=await create([goal(4,[2])],true);
  assert.deepEqual((await row('student-a',4)).targetQuestions,[2]);
  assert.equal((await active('student-a'))[0].learningAssignmentId,next.id);
  const stored=JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'));
  assert.ok(stored['student-a'].solvedByTask[7].basic.solved.includes('7-basic-1'));
  assert.deepEqual((await f.request(`${route}/${fresh.id}`,teacher)).assignment.homework.goals[0].targetQuestions,[2]);
 }finally{await f.stop();}
});

test('lives use cancellation even with stale pupil projection and retain damage already recorded before cancellation', {timeout:60000},async()=>{
 const now=Date.now(),ago=days=>new Date(now-days*86400000).toISOString();
 const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
   write('tests',tests);
   new HomeworkLivesStore(path.join(data,'homework-lives.json'),{now:()=>now-6*86400000}).configure('teacher-a',true);
   write('students',JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8')).map(student=>({...student,createdAt:ago(90)})));
 });
 try{
  const teacher=f.tokens['teacher-a'],route=`/api/learning-groups/${f.groupId}/assignments`,dueAt=new Date(now+86400000).toISOString();
  const assignment=(await f.request(route,teacher,{title:'ЕГЭ',dueAt,homework:{studyTrack:'ege',dueAt,goals:[goal(4,[1])]}},'POST',201)).assignment;
  await f.request(`${route}/${assignment.id}`,teacher,{dueAt:new Date(now-60000).toISOString(),homework:{...assignment.homework,dueAt:new Date(now-60000).toISOString()}},'PATCH');
  const before=await f.request('/api/homework-lives',f.tokens['student-b']);
  assert.equal(before.remaining,1);
  await f.request(`${route}/${assignment.id}/ege-cancellations`,teacher,{taskNumber:4,all:true},'POST',201);
  const progressPath=path.join(f.data,'progress.json'),progress=JSON.parse(fs.readFileSync(progressPath,'utf8'));
  progress['student-a'].homeworks.forEach(entry=>delete entry.learningEgeCancellations);
  fs.writeFileSync(progressPath,JSON.stringify(progress));
  const a=await f.request('/api/homework-lives',f.tokens['student-a']),b=await f.request('/api/homework-lives',f.tokens['student-b']);
  assert.equal(a.remaining,3);assert.deepEqual(a.history,[]);
  assert.equal(b.remaining,before.remaining);assert.equal(b.history[0].loss,before.history[0].loss);
 }finally{await f.stop();}
});
