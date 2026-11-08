import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PreparedTeacherTheory,sanitizeTeacherTheory} from './preparedTeacherTheory.js';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('rich teacher text keeps headings, lists, tables and code but cannot load active or remote content',()=>{
  const html=sanitizeTeacherTheory('<h2>Маска</h2><ol start="2"><li><b>Важно</b></li></ol><pre><code>print(1 &lt; 2)</code></pre><table><tr><td colspan="2">A</td></tr></table><span style="color:#7842d6;font-weight:700;position:fixed;background-image:url(https://evil.test/x)">Текст</span><script>alert(1)</script><img src="https://evil.test/pixel"><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)" onclick="bad()">Ссылка</a>');
  assert.match(html,/<h2>Маска<\/h2>/);assert.match(html,/<ol start="2">/);assert.match(html,/<code>print\(1 &lt; 2\)<\/code>/);assert.match(html,/<td colspan="2">/);
  assert.match(html,/color:#7842d6/);assert.doesNotMatch(html,/script|javascript|onclick|img|iframe|evil\.test|position|background-image/);
});

test('private notes persist with revisions independently of the task set and reject other identities',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'teacher-theory-')),set={id:'set',teacherId:'owner',name:'Набор'},store={directory,data:{sets:{set}},now:()=>1000};
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const notes=new PreparedTeacherTheory(store),auth={id:'owner',role:'teacher'};
  assert.equal(notes.read(auth,'set').version,0);
  const saved=notes.save(auth,'set',{version:0,html:'<h2>Личный текст</h2><p>Только мне</p>'});
  assert.equal(saved.version,1);assert.equal(new PreparedTeacherTheory(store).read(auth,'set').html,saved.html);
  assert.equal(notes.save(auth,'set',{version:1,html:saved.html}).version,1);
  assert.throws(()=>notes.save(auth,'set',{version:0,html:'Старая копия'}),{status:409});
  for(const role of ['student','teacher','admin'])assert.throws(()=>notes.read({id:'other',role},'set'));
  assert.deepEqual(set,{id:'set',teacherId:'owner',name:'Набор'});
});

test('HTTP routes are teacher-only; notes never enter set listings or lesson projections',async t=>{
  const f=await createGroupHomeworkFixture();t.after(()=>f.stop());
  const teacher=f.tokens['teacher-b'],other=f.tokens['teacher-a'],student=f.tokens['student-c'];
  const set=await f.request('/api/lesson-task-sets',teacher,{name:'Секретный план объяснения',taskNumber:13,theoryMode:'steps',theoryItems:[{id:'one',kind:'interactive',typeId:'decimal-to-binary-v1',params:{}}],tasks:[]},'POST',201);
  const url=`/api/lesson-task-sets/${set.id}/teacher-theory`;
  const note=await f.request(url,teacher,{version:0,html:'<h2>PRIVATE-NOTES-ONLY</h2>'},'PUT');assert.equal(note.version,1);
  assert.equal((await f.request(url,teacher)).html,note.html);
  await f.request(url,student,undefined,'GET',403);await f.request(url,other,undefined,'GET',404);
  await f.request(url,teacher,{version:0,html:'stale'},'PUT',409);
  assert.doesNotMatch(JSON.stringify(await f.request('/api/lesson-task-sets',teacher)),/PRIVATE-NOTES-ONLY/);
  const run=await f.request('/api/lesson-task-runs',teacher,{room:'board-teacher-b-student-c',setId:set.id,x:20,y:30},'POST',201);
  assert.doesNotMatch(JSON.stringify(run),/PRIVATE-NOTES-ONLY/);
  assert.doesNotMatch(JSON.stringify(await f.request('/api/lesson-task-run?room=board-teacher-b-student-c',student)),/PRIVATE-NOTES-ONLY/);
  assert.doesNotMatch(JSON.stringify(await f.request('/api/lesson-task-sets',student,undefined,'GET',403)),/PRIVATE-NOTES-ONLY/);
});
