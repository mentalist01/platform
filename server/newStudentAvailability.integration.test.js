import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {createStudentAvailabilityStore} from './studentAvailability.js';

test('new pupils can choose group hours immediately while existing pupils keep their teacher setting', {timeout:60000}, async()=>{
  const f=await createGroupHomeworkFixture();
  try {
    const teacher=f.tokens['teacher-a'];
    assert.equal((await f.request('/api/student-availability/prompt',f.tokens['student-c'])).prompt,null);
    const created=[];
    for(const name of ['Новый ученик после пробного','Новая ученица после пробного']) {
      const pupil=await f.request('/api/students',teacher,{name,grade:'11'});
      const token=(await f.request('/api/login','',{code:pupil.code})).token;
      created.push({pupil,token});
      assert.deepEqual((await f.request('/api/student-availability/prompt',token)).prompt,{kind:'personal'});
      assert.equal((await f.request('/api/students/'+pupil.id+'/group-placement',teacher)).seekingGroup,true);
      const form=await f.request('/api/student-availability',token);
      assert.equal(form.answer,null);
      await f.request('/api/student-availability/answer',token,{durationMinutes:60,revision:form.revision,choices:{'0-600':'yes','2-600':'maybe'}});
      const saved=await f.request('/api/student-availability',token);
      assert.deepEqual(saved.answer.choices,{'0-600':'yes','2-600':'maybe'});
      assert.equal((await f.request('/api/learning-groups',token)).groups.length,0,'choosing hours does not enrol or bill a pupil');
      await f.request('/api/students/'+pupil.id+'/group-placement/settings',f.tokens['teacher-b'],{seekingGroup:false},'POST',403);
    }
    await f.request('/api/students/'+created[0].pupil.id+'/group-placement/settings',teacher,{seekingGroup:false});
    assert.equal((await f.request('/api/student-availability/prompt',created[0].token)).prompt,null);
    const restored=createStudentAvailabilityStore(path.join(f.data,'student-availability.json'));
    assert.equal(restored.seekingGroup({teacherId:'teacher-a',studentId:created[0].pupil.id}),false);
    assert.equal(restored.seekingGroup({teacherId:'teacher-a',studentId:created[1].pupil.id}),true);
    assert.equal(restored.seekingGroup({teacherId:'teacher-b',studentId:'student-c'}),false);
    assert.deepEqual((await f.request('/api/student-availability',created[0].token)).answer.choices,{'0-600':'yes','2-600':'maybe'});
    await f.request('/api/learning-groups',teacher,{name:'Подобранная группа',studentIds:[created[1].pupil.id]},'POST',201);
    assert.equal((await f.request('/api/student-availability/prompt',created[1].token)).prompt,null,'approved group membership replaces personal onboarding');
  } finally {await f.stop();fs.rmSync(f.root,{recursive:true,force:true});}
});
