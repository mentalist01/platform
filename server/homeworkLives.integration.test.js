import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { HomeworkLivesStore, livesMonth } from './homeworkLives.js';

test('real API isolates teacher/student lives, protects mutations and keeps progress intact', {timeout:60000},async()=>{
  const now=Date.now(),issuedAt=new Date(now-3*86400000).toISOString(),dueAt=new Date(now-86400000).toISOString();
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
    const store=new HomeworkLivesStore(path.join(data,'homework-lives.json'),{now:()=>now-4*86400000});store.data.damagePolicy={since:'2099-01-01T00:00:00Z',monthlyDamage:4};store.configure('teacher-a',true);
    const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8')).map(s=>({...s,createdAt:new Date(now-90*86400000).toISOString()}));write('students',students);
    const entry=id=>({id,issuedAt,dueAt,homeWork:'Python + ЕГЭ',goals:[{type:'task',taskNumber:4,levelId:'basic',targetQuestions:[1,2],targetQuestionIds:['ege-question','ege-second']}]});
    write('tests',{4:{basic:[{id:'ege-question',answer:'17'},{id:'ege-second',answer:'18'}]}});
    write('progress',Object.fromEntries(['student-a','student-b'].map(id=>[id,{schedule:Array.from({length:9},(_,i)=>({id:'past-'+i,date:new Date(now-(20+i)*86400000).toISOString().slice(0,10),time:'10:00',durationMinutes:60})),homeworks:['a','b','c'].map(entry),solvedByTask:{4:{basic:{solved:['ege-question'],answerHistory:{'ege-question':[{submittedAt:new Date(now-2*86400000).toISOString(),correct:true}]}}}}}])));
  });
  try{
    const teacher=f.tokens['teacher-a'],other=f.tokens['teacher-b'],pupil=f.tokens['student-a'];
    await f.request('/api/homework-lives/student-a/plan',teacher,{count:4,month:livesMonth(now)});
    await f.request('/api/homework-lives/student-b/plan',teacher,{count:8,month:livesMonth(now)});
    const progressBefore=fs.readFileSync(path.join(f.data,'progress.json'),'utf8');
    const own=await f.request('/api/homework-lives',pupil);
    assert.equal(own.remaining,0);assert.equal(own.history.length,3);assert.equal(own.pendingReviews.length,1);
    assert.equal(own.studentNotice.readAt,'');
    const noticeBody={id:own.studentNotice.id,month:own.month};
    await f.request('/api/homework-lives/notice/read',teacher,noticeBody,'POST',403);
    await f.request('/api/homework-lives/notice/read',other,noticeBody,'POST',403);
    await f.request('/api/homework-lives/notice/read',f.tokens['student-b'],noticeBody,'POST',409);
    await f.request('/api/homework-lives/notice/read',pupil,{...noticeBody,id:'old-notice'},'POST',409);
    const acknowledged=await f.request('/api/homework-lives/notice/read',pupil,noticeBody);
    assert.ok(acknowledged.studentNotice.readAt);assert.equal(acknowledged.remaining,0);assert.equal(acknowledged.pendingReviews.length,1);
    assert.equal((await f.request('/api/homework-lives/notice/read',pupil,noticeBody)).studentNotice.readAt,acknowledged.studentNotice.readAt);
    assert.ok((await f.request('/api/homework-lives',pupil)).studentNotice.readAt);
    assert.ok((await f.request('/api/teacher-homework-lives',teacher)).students.find(s=>s.studentId==='student-a').pendingReviews[0].studentReadAt);
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
