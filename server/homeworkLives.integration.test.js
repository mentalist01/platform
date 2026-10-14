import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { HomeworkLivesStore, livesMonth } from './homeworkLives.js';

test('real API isolates teacher/student lives, protects mutations and keeps progress intact', {timeout:60000},async()=>{
  const now=Date.now(),issuedAt=new Date(now-3*86400000).toISOString(),dueAt=new Date(now-86400000).toISOString();
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
    const store=new HomeworkLivesStore(path.join(data,'homework-lives.json'),{now:()=>now-4*86400000});store.configure('teacher-a',true);
    const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8')).map(s=>({...s,createdAt:new Date(now-90*86400000).toISOString()}));write('students',students);
    const entry=id=>({id,issuedAt,dueAt,homeWork:'Python + ЕГЭ',goals:[{type:'task',taskNumber:101,levelId:'python',targetQuestions:[1],targetQuestionIds:['python-question']},{type:'task',taskNumber:4,levelId:'basic',targetQuestions:[1],targetQuestionIds:['ege-question']}]});
    write('progress',Object.fromEntries(['student-a','student-b'].map(id=>[id,{homeworks:['a','b','c'].map(entry),solvedByTask:{101:{python:{solved:['python-question'],answerHistory:{'python-question':[{submittedAt:new Date(now-2*86400000).toISOString(),correct:true}]}}}}}])));
  });
  try{
    const teacher=f.tokens['teacher-a'],other=f.tokens['teacher-b'],pupil=f.tokens['student-a'];
    await f.request('/api/homework-lives/student-a/plan',teacher,{count:4,month:livesMonth(now)});
    await f.request('/api/homework-lives/student-b/plan',teacher,{count:8,month:livesMonth(now)});
    const progressBefore=fs.readFileSync(path.join(f.data,'progress.json'),'utf8');
    const own=await f.request('/api/homework-lives',pupil);
    assert.equal(own.remaining,0);assert.equal(own.history.length,3);assert.equal(own.pendingReviews.length,1);
    assert.equal((await f.request('/api/homework-lives',f.tokens['student-b'])).remaining,1.5);
    assert.deepEqual((await f.request('/api/teacher-homework-lives',teacher)).students.filter(s=>s.pendingReviews.length).map(s=>s.studentId),['student-a']);
    assert.deepEqual((await f.request('/api/teacher-homework-lives',other)).students,[]);
    await f.request('/api/homework-lives?studentId=student-a',other,undefined,'GET',403);
    await f.request('/api/homework-lives?studentId=student-b',pupil,undefined,'GET',403);
    await f.request('/api/teacher-homework-lives',pupil,undefined,'GET',403);
    await f.request('/api/homework-lives/settings',pupil,{enabled:true},'PATCH',403);
    await f.request('/api/homework-lives/student-a/waive',other,{eventId:'a',reason:'Forbidden'},'POST',403);
    await f.request('/api/homework-lives/student-a/waive',pupil,{eventId:'a',reason:'Forbidden'},'POST',403);
    await f.request('/api/homework-lives/student-a/waive',teacher,{eventId:'a',reason:''},'POST',400);
    const restored=await f.request('/api/homework-lives/student-a/waive',teacher,{eventId:'a',reason:'Домашка не отображалась'});
    assert.equal(restored.remaining,1);assert.deepEqual(restored.pendingReviews,[]);
    assert.equal((await f.request('/api/homework-lives',pupil)).remaining,1);
    assert.equal(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'),progressBefore);
    const saved=JSON.parse(fs.readFileSync(path.join(f.data,'homework-lives.json'),'utf8'));
    assert.equal(Object.values(saved.students).flatMap(s=>Object.values(s.months).flatMap(p=>Object.values(p.events))).filter(e=>e.waivedAt).length,1);
  }finally{await f.stop();}
});
