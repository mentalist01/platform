import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('pupil contacts stay separate from parent contacts and are private to the owning teacher', {timeout:60000}, async () => {
  const fixture = await createGroupHomeworkFixture();
  const {request,tokens,data}=fixture;
  try {
    const a=tokens['teacher-a'],b=tokens['teacher-b'],child=tokens['student-a'];
    const route='/api/students/student-a/contact',file=path.join(data,'student-contacts.json');
    const before=fs.readFileSync(path.join(data,'students.json'),'utf8');
    const parent=(await request('/api/parent/login','',{code:'student-a-code'})).token;
    assert.deepEqual(await request('/api/student-contacts',a),{contacts:{}});
    for(const token of [b,child,parent])await request(route,token,{url:'@wrong_contact'},'PATCH',403);
    for(const token of [child,parent])await request('/api/student-contacts',token,null,'GET',403);
    for(const url of ['javascript:alert(1)','data:text/html,test','https://user:secret@example.com/','+123'])await request(route,a,{url},'PATCH',400);
    await request(route,a,{name:'Без контакта'},'PATCH',400);
    await request('/api/students/student-a/parent-contact',a,{name:'Мама',url:'@example_parent'},'PATCH');
    const parentBefore=fs.readFileSync(path.join(data,'student-parent-contacts.json'),'utf8');
    const saved=await request(route,a,{name:'Личный Telegram',url:'8 (999) 000-00-00'},'PATCH');
    assert.equal(saved.contact.url,'https://t.me/+79990000000');
    assert.deepEqual((await request('/api/student-contacts',a)).contacts['student-a'],saved.contact);
    assert.deepEqual(await request('/api/student-contacts?teacherId=teacher-a',b),{contacts:{}});
    assert.equal(fs.readFileSync(path.join(data,'student-parent-contacts.json'),'utf8'),parentBefore);
    assert.equal(fs.readFileSync(path.join(data,'students.json'),'utf8'),before);
    const stored=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(stored.contacts[0].teacherId,'teacher-a');
    assert.equal(JSON.stringify(await request('/api/students',a)).includes('79990000000'),false);
    for(const token of [child,parent])await request('/api/students',token,null,'GET',403);
    await request('/api/students/student-b/contact',a,{url:'@second_pupil'},'PATCH');
    await request(route,a,{name:'',url:''},'PATCH');
    const current=(await request('/api/student-contacts',a)).contacts;
    assert.equal(current['student-a'],undefined);
    assert.equal(current['student-b'].url,'https://t.me/second_pupil');
    assert.equal(fs.readFileSync(path.join(data,'student-parent-contacts.json'),'utf8'),parentBefore);
    const preserved=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,'{broken');
    await request('/api/student-contacts',a,null,'GET',500);
    await request(route,a,{url:'@example_pupil'},'PATCH',500);
    assert.equal(fs.readFileSync(file,'utf8'),'{broken','a broken journal is never silently overwritten');
    fs.writeFileSync(file,preserved);
    assert.equal((await request('/api/student-contacts',a)).contacts['student-b'].url,'https://t.me/second_pupil');
  } finally {await fixture.stop();}
});
