import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('one route for an active group, own board access, individual isolation and two-part transition',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,groupId}=f,teacher=tokens['teacher-a'],url=`/api/group-study-progress/${groupId}`,book=`board-group-${groupId}~pages`;
  try{
    await request(url,'',undefined,'GET',401);await request(url,tokens['student-a'],undefined,'GET',403);await request(url,tokens['teacher-b'],undefined,'GET',404);
    const individualBefore=await request('/api/student-study-progress/student-a',teacher);
    const list=await request('/api/student-study-progress',teacher);assert.equal(list.groups[0].id,groupId);assert.ok(list.records[`group:${groupId}`]);
    const page=await request('/api/lesson-pages',teacher,{room:book,action:'create',name:'18 задание'});
    let result=await request(url,teacher,{action:'current',revision:0,pageId:page.id,blockId:'18',partNumber:1});assert.equal(result.record.groupId,groupId);
    await request(url,teacher,{action:'current',revision:0,pageId:page.id,blockId:'17',partNumber:1},'POST',409);
    await request(url,teacher,{action:'link',revision:result.record.revision,pageId:'another-notebook',blockId:'18',partNumber:1},'POST',404);
    result=await request(url,teacher,{action:'complete',revision:result.record.revision,pageId:page.id});assert.equal(result.next.blockId,'9');
    result=await request(url,teacher,{action:'transition',revision:result.record.revision,operationId:crypto.randomUUID(),blockId:'9',partNumber:1,name:'Задание №9',parts:result.transition.parts.map(part=>({partNumber:part.partNumber,name:part.name}))});
    assert.equal(result.record.current.blockId,'9');assert.equal(result.pages.filter(p=>p.parentId).length,2);
    assert.deepEqual((await request('/api/student-study-progress/student-a',teacher)).record,individualBefore.record);
    assert.equal((await request(url,teacher)).record.revision,result.record.revision);
    const raw=JSON.parse(fs.readFileSync(path.join(f.data,'group-study-progress.json')));assert.equal(raw.records[`teacher-a:${groupId}`].groupId,groupId);
    const response=await fetch(f.base+url,{headers:{Authorization:`Bearer ${teacher}`}});assert.match(response.headers.get('cache-control'),/private, no-store/);
  }finally{await f.stop();}
});

test('a chosen pair becomes a group before start, with exact members and no personal progress changes',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,write=>{
    write('students',[...['a','b','c'].map((id,i)=>({id:`student-${id}`,name:id,code:`student-${id}-code`,teacherId:i===2?'teacher-b':'teacher-a',grade:'11'})),...['d','e'].map(id=>({id,teacherId:'teacher-a',name:id,code:`code-${id}`,grade:'11'}))]);
  }),{request,tokens}=f,teacher=tokens['teacher-a'];
  try{
    const before=(await request('/api/student-study-progress',teacher)).records;
    const created=await request('/api/learning-groups',teacher,{name:'Пара по теме 17',studentIds:['d','e']},'POST',201);
    assert.equal(created.group.status,'ready');assert.deepEqual(created.group.members.filter(m=>m.status==='active').map(m=>m.studentId).sort(),['d','e']);
    assert.deepEqual((await request('/api/student-study-progress',teacher)).records,before);
    await request(`/api/group-study-progress/${created.group.id}`,teacher,undefined,'GET',404);
    await request('/api/learning-groups',teacher,{name:'Пара по теме 17',studentIds:['d','e']},'POST',409);
    await request('/api/learning-groups',teacher,{name:'Чужой ученик',studentIds:['student-c','d']},'POST',409);
    assert.equal((await request('/api/learning-groups',teacher)).groups.filter(g=>g.name==='Пара по теме 17').length,1);
  }finally{await f.stop();}
});
