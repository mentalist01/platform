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
