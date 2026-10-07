import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createLessonPaceStore, registerLessonPace } from './lessonPace.js';

test('pace feedback is personal, limited to finished lessons, persisted and visible only to its teacher', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lesson-pace-'));
  const file=path.join(root,'pace.json'),store=createLessonPaceStore(file);
  const groups=[{id:'g',teacherId:'t'}];
  const lessons=[{id:'done',groupId:'g',status:'completed',participantIds:['a','b'],startAt:new Date().toISOString()},
    {id:'live',groupId:'g',status:'active',participantIds:['a','b'],startAt:new Date().toISOString()}];
  const app=express(); app.use(express.json());
  app.use((req,res,next)=>{req.auth={id:req.headers['x-user'],role:req.headers['x-role']};next();});
  registerLessonPace(app,{store,lessons:()=>lessons,groupById:id=>groups.find(g=>g.id===id),
    canRead:(auth,l)=>l.participantIds.includes(auth.id),canManage:(auth,g)=>auth.role==='teacher'&&auth.id===g.teacherId,studentName:id=>id});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
  const call=async(url,id='a',role='student',body,status=200)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${url}`,{method:body?'PUT':'GET',headers:{'x-user':id,'x-role':role,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const json=await response.json();assert.equal(response.status,status,JSON.stringify(json));return json;
  };
  assert.equal((await call('learning-lesson-feedback/pending')).lesson.id,'done');
  const endpoint='learning-groups/g/lessons/done/pace';
  await call(endpoint,'a','student',undefined,403);
  await call(endpoint,'stranger','student',{value:50},403);
  await call('learning-groups/g/lessons/live/pace','a','student',{value:50},409);
  for(const value of [-1,101,0.5,'50',null]) await call(endpoint,'a','student',{value},400);
  await call(endpoint,'a','student',{value:0,studentId:'b'});
  const results = await call(endpoint, 't', 'teacher');
  assert.deepEqual(results.pendingStudents, [{ studentId: 'b', name: 'b' }]);
  assert.equal(results.responses[0].value, 0);
  assert.equal(store.get('done','b'),undefined);
  assert.equal((await call('learning-lesson-feedback/pending')).lesson,null);
  assert.equal((await call('learning-lesson-feedback/pending','b')).lesson.id,'done');
  await call(endpoint,'a','student',{value:100});
  assert.equal((await call(endpoint,'t','teacher')).responses.length,1);
  assert.equal(createLessonPaceStore(file).get('done','a').value,100);
  await call(endpoint,'other','teacher',undefined,403);
  lessons.push({ id: 'old', groupId: 'g', status: 'completed', participantIds: ['a'],
    startAt: new Date(Date.now() - 30 * 86400000).toISOString() });
  assert.equal((await call('learning-lesson-feedback/pending')).lesson.id, 'old', 'Unanswered feedback never expires after seven days');
  assert.equal((await call('learning-lesson-feedback/pending')).lesson.id, 'old', 'Reopening does not dismiss feedback');
  await call('learning-groups/g/lessons/old/pace', 'a', 'student', { value: 35 });
  assert.equal((await call('learning-lesson-feedback/pending')).lesson, null);
  assert.equal(createLessonPaceStore(file).get('old', 'a').value, 35);
});

test('individual and group answers share the pending queue and teacher roster without sharing access', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-pace-mixed-'));
  const file = path.join(root, 'pace.json'), store = createLessonPaceStore(file);
  const groups = [{ id: 'g', teacherId: 't', name: 'Группа' }, { id: 'foreign', teacherId: 'other' }];
  const lessons = [{ id: 'group', groupId: 'g', status: 'completed', participantIds: ['a', 'observer'], startAt: '2026-10-07T10:00:00Z' },
    { id: 'foreign-group', groupId: 'foreign', status: 'completed', participantIds: ['b'], startAt: '2026-10-07T10:00:00Z' }];
  const individual = [
    { id: 'individual:one', kind: 'individual', teacherId: 't', status: 'completed', participantIds: ['a'], startAt: '2026-10-07T11:00:00Z', topic: 'Циклы' },
    { id: 'individual:live', kind: 'individual', teacherId: 't', status: 'active', participantIds: ['a'] },
    { id: 'individual:foreign', kind: 'individual', teacherId: 'other', status: 'completed', participantIds: ['b'], startAt: '2026-10-07T11:00:00Z' },
  ];
  const students = [{ id: 'a', teacherId: 't' }, { id: 'observer', teacherId: 't' }, { id: 'b', teacherId: 'other' }];
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.auth = { id: req.headers['x-user'], role: req.headers['x-role'] }; next(); });
  registerLessonPace(app, { store, lessons: () => lessons, individualLessons: () => individual,
    groupById: id => groups.find(group => group.id === id), studentName: id => id,
    canRead: (auth, lesson) => lesson.participantIds.includes(auth.id),
    requiresFeedback: (lesson, id) => id !== 'observer',
    canManage: (auth, group) => auth.role === 'teacher' && group?.teacherId === auth.id,
    canReadIndividual: (auth, lesson) => lesson.participantIds.includes(auth.id) && students.find(row => row.id === auth.id)?.teacherId === lesson.teacherId,
    teacherStudents: auth => students.filter(student => student.teacherId === auth.id),
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const call = async (route, id = 'a', role = 'student', body, status = 200) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
      method: body ? 'PUT' : 'GET', headers: { 'Content-Type': 'application/json', 'x-user': id, 'x-role': role },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json(); assert.equal(response.status, status, JSON.stringify(json)); return json;
  };
  assert.equal((await call('learning-lesson-feedback/pending')).lesson.kind, 'individual');
  assert.equal((await call('learning-lesson-feedback/pending', 'observer')).lesson, null);
  const endpoint = 'individual-lessons/individual%3Aone/pace';
  await call(endpoint, 'b', 'student', { value: 50 }, 403);
  await call(endpoint, 't', 'teacher', { value: 50 }, 403);
  await call('individual-lessons/individual%3Alive/pace', 'a', 'student', { value: 50 }, 409);
  for (const value of [-1, 101, 0.5, '50', null]) await call(endpoint, 'a', 'student', { value }, 400);
  await call(endpoint, 'a', 'student', { value: 0, studentId: 'b', teacherId: 'other' });
  assert.equal(store.get('individual:one', 'b'), undefined);
  assert.equal((await call('learning-lesson-feedback/pending')).lesson.id, 'group');
  await call('learning-groups/g/lessons/group/pace', 'a', 'student', { value: 100 });
  assert.equal((await call('learning-lesson-feedback/pending')).lesson, null);
  await call(endpoint, 'a', 'student', { value: 35 });
  const roster = await call('lesson-pace/students', 't', 'teacher');
  assert.deepEqual(roster.students.map(row => row.studentId), ['a', 'observer']);
  assert.equal(roster.students[0].latest.feedback.value, 35);
  assert.equal(roster.students[0].pendingCount, 0);
  assert.equal(roster.students[1].latest, null);
  const history = await call('lesson-pace/students/a', 't', 'teacher');
  assert.deepEqual(history.lessons.map(row => row.kind), ['individual', 'group']);
  assert.equal(history.lessons[1].feedback.value, 100);
  assert.equal(createLessonPaceStore(file).get('individual:one', 'a').value, 35);
  await call('lesson-pace/students/a', 'other', 'teacher', undefined, 404);
  await call('lesson-pace/students', 'a', 'student', undefined, 403);
  await call('lesson-pace/students/a', 'a', 'parent', undefined, 403);
  for (let i = 0; i < 35; i++) individual.push({ ...individual[0], id: `individual:page-${i}` });
  assert.equal((await call('lesson-pace/students/a', 't', 'teacher')).nextOffset, 30);
  assert.equal((await call('lesson-pace/students/a?offset=30', 't', 'teacher')).lessons.length, 7);
});
