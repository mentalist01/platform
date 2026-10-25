import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {HomeworkLivesStore,livesMonth} from './homeworkLives.js';
import {partitionConcurrentHomeworks} from '../src/utils/concurrentHomework.js';
import {buildHomeworkStatistics} from '../src/utils/homeworkStats.js';

const python = {studyTrack:'python',goals:[{type:'task',taskNumber:101,levelId:'python',targetQuestions:[1]}]};
const ege = {studyTrack:'ege',goals:[{type:'task',taskNumber:4,levelId:'basic',targetQuestions:[1]}]};

test('real API scopes group homework to each pupil direction for all/selected recipients and draft publication', {timeout:60000}, async()=>{
  const f=await createGroupHomeworkFixture();
  try {
    const teacher=f.tokens['teacher-a'], route=`/api/learning-groups/${f.groupId}`;
    const set=track=>f.request(`${route}/members/student-a/homework-track`,teacher,{studyTrack:track},'PUT');
    await set('ege');
    const assign=async(homework,extra={})=>(await f.request(`${route}/assignments`,teacher,{title:'Проверка направления',dueAt:new Date(Date.now()+86400000).toISOString(),homework,...extra},'POST',201)).assignment;
    const p=await assign(python); assert.deepEqual(p.recipientIds,['student-b']);
    const e=await assign(ege); assert.deepEqual(e.recipientIds,['student-a','student-b']);
    const studentEntries=(await f.request('/api/student-next-lesson',f.tokens['student-a'])).homeworks;
    assert.equal(studentEntries.some(h=>h.learningAssignmentId===p.id),false);
    assert.equal(studentEntries.some(h=>h.learningAssignmentId===e.id),true);
    await f.request(`${route}/assignments`,teacher,{title:'Только неучаствующему',homework:python,recipientMode:'selected',recipientIds:['student-a']},'POST',400);
    const draft=await assign(python,{status:'draft'});
    const published=(await f.request(`${route}/assignments/${draft.id}`,teacher,{status:'assigned',recipientMode:'all'},'PATCH')).assignment;
    assert.deepEqual(published.recipientIds,['student-b']);
    await set('all');
    const next=await assign(python); assert.deepEqual(next.recipientIds,['student-a','student-b']);
    // Previously excluded assignments do not appear retroactively on joining Python.
    assert.equal((await f.request('/api/student-next-lesson',f.tokens['student-a'])).homeworks.some(h=>h.learningAssignmentId===p.id),false);
    await f.request(`${route}/members/student-a/homework-track`,f.tokens['student-a'],{studyTrack:'all'},'PUT',403);
    await f.request(`${route}/members/student-a/homework-track`,f.tokens['teacher-b'],{studyTrack:'all'},'PUT',403);
    await f.request(`${route}/members/student-a/homework-track`,teacher,{studyTrack:'invalid'},'PUT',400);
    assert.equal((await f.request(`/api/learning-groups/${f.groupId}`,teacher)).group.members.find(m=>m.studentId==='student-a').homeworkStudyTrack,'all');
  } finally {await f.stop();}
});

test('excluding old EGE withdraws its obligation, restores an existing deduction and preserves solutions and classmates', {timeout:60000}, async()=>{
  const now=Date.now(),ago=days=>new Date(now-days*86400000).toISOString();
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
    new HomeworkLivesStore(path.join(data,'homework-lives.json'),{now:()=>now-6*86400000}).configure('teacher-a',true);
    write('students',JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8')).map(s=>({...s,createdAt:ago(90)})));
    write('learning-groups',[{id:'old-group',teacherId:'teacher-a',name:'Прежняя выдача',status:'active',members:['student-a','student-b'].map(studentId=>({studentId,status:'active',joinedAt:ago(30)})),createdAt:ago(30)}]);
    write('learning-assignments',[{id:'old-python',groupId:'old-group',teacherId:'teacher-a',title:'Python',status:'assigned',recipientIds:['student-a','student-b'],homework:ege,dueAt:ago(1),publishedAt:ago(4),createdAt:ago(4)}]);
    write('progress',Object.fromEntries(['student-a','student-b'].map(id=>[id,{schedule:Array.from({length:9},(_,i)=>({id:'past-'+i,date:new Date(now-(20+i)*86400000).toISOString().slice(0,10),time:'10:00',durationMinutes:60})),progress:{},homeworks:[{...ege,id:'learning-group-old-python',source:'learning-group',learningGroupId:'old-group',learningAssignmentId:'old-python',learningAssignmentStatus:'assigned',issuedAt:ago(4),dueAt:ago(1),goals:[{...ege.goals[0],targetQuestionIds:['ege-question']}]}],notes:'print(42)',solvedByTask:{101:{python:{solved:['previous-question']}}}}])));
  },{existingGroupId:'old-group'});
  try {
    const teacher=f.tokens['teacher-a'], pupil=f.tokens['student-a'];
    for(const id of ['student-a','student-b'])await f.request(`/api/homework-lives/${id}/plan`,teacher,{count:4,month:livesMonth(now)});
    const before=await f.request('/api/homework-lives',pupil); assert.equal(before.remaining,1,JSON.stringify({before,progress:JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'))['student-a']}));
    const old=JSON.parse(fs.readFileSync(path.join(f.data,'learning-groups.json'),'utf8')).find(g=>g.id==='old-group');
    await f.request('/api/learning-groups/old-group/members/student-a/homework-track',teacher,{studyTrack:'python'},'PUT');
    const entries=(await f.request('/api/student-next-lesson',pupil)).homeworks;
    const row=entries.find(h=>h.learningAssignmentId==='old-python');
    assert.ok(row); assert.equal(row.learningHomeworkTrackExcluded,true);
    assert.equal(row.learningAssignmentStatus,'closed');
    assert.equal(partitionConcurrentHomeworks(entries).active.length,0);
    assert.deepEqual(buildHomeworkStatistics({homeworks:entries}),[]);
    const after=await f.request('/api/homework-lives',pupil); assert.equal(after.remaining,3);
    assert.equal(after.history.length,1); assert.ok(after.history[0].waivedAt);
    assert.equal(after.history[0].waivedById,'group-homework-track');
    assert.match(after.history[0].waiverReason,/направление|Направление/);
    assert.deepEqual(after.pendingReviews,[]);
    assert.equal((await f.request('/api/homework-lives',f.tokens['student-b'])).remaining,1);
    const saved=JSON.parse(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'));
    assert.equal(saved['student-a'].notes,'print(42)');
    assert.deepEqual(saved['student-a'].solvedByTask[101].python.solved,['previous-question']);
    const group=JSON.parse(fs.readFileSync(path.join(f.data,'learning-groups.json'),'utf8')).find(g=>g.id==='old-group');
    assert.deepEqual(group.schedule,old.schedule); assert.equal(group.pricePerLesson,old.pricePerLesson);
    await f.request('/api/learning-groups/old-group/members/student-a/homework-track',teacher,{studyTrack:'all'},'PUT');
    assert.equal((await f.request('/api/student-next-lesson',pupil)).homeworks.find(h=>h.learningAssignmentId==='old-python').learningAssignmentStatus,'closed');
  } finally {await f.stop();}
});
