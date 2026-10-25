import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('real API partitions a saved set and creates a parent with isolated part runs, then reuses the second part',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
    write('teachers',[...JSON.parse(fs.readFileSync(path.join(data,'teachers.json'))),{id:'t',name:'Учитель перехода',code:'stage-teacher'}]);
    write('students',[...JSON.parse(fs.readFileSync(path.join(data,'students.json'))),{id:'p',teacherId:'t',name:'Тест частей',code:'stage-pupil',grade:'11'}]);
  }),{request}=f,token=(await request('/api/login','',{code:'stage-teacher'})).token,url='/api/student-study-progress/p';
  try{
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:800,height:160,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const image=await(await fetch(f.base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form})).json();
    let set=await request('/api/lesson-task-sets',token,{name:'9 объединённый',taskNumber:9,tasks:['1','2','3','4'].map(title=>({title,images:[image.id],answers:['1']}))},'POST',201);
    let data=await request(url,token);data=await request(url,token,{action:'current',revision:data.record.revision,pageId:'main',blockId:'18',partNumber:1});
    data=await request(url,token,{action:'complete',revision:data.record.revision,pageId:'main'});assert.equal(data.transition.parts.length,2);assert.equal(data.transition.parts[1].suggested,null);
    set=await request(`/api/lesson-task-sets/${set.id}`,token,{...set,tasks:set.tasks.map((task,index)=>({...task,startsPart:index===2}))},'PUT');assert.equal(set.tasks[2].startsPart,true);
    data=await request(url,token);assert.ok(data.transition.parts.every(part=>part.suggested?.setId===set.id));
    const operationId=crypto.randomUUID(),input={action:'transition',revision:data.record.revision,operationId,blockId:'9',partNumber:1,name:'Задание №9',parts:data.transition.parts.map(part=>({partNumber:part.partNumber,name:part.name,setId:set.id,version:set.version,sourcePartNumber:part.partNumber}))};
    await request(url,f.tokens['student-a'],input,'POST',403);await request(url,f.tokens['teacher-b'],input,'POST',404);
    const created=await request(url,token,input),root=created.pages.find(page=>page.title==='Задание №9'),parts=created.pages.filter(page=>page.parentId===root.id);
    assert.equal(parts.length,2);assert.equal(created.record.current.pageId,parts[0].id);
    for(const [index,page]of parts.entries()){
      const {run}=await request(`/api/lesson-task-run?room=${encodeURIComponent(`board-t-p~page~${page.id}`)}`,token);
      assert.equal(run.total,2);assert.equal(run.cards[0].title,String(index*2+1));assert.equal(run.cards[0].partNumber,index+1);
      assert.deepEqual(run.cards[0].referenceAnswers,['1']);
    }
    const repeat=await request(url,token,input);assert.equal(repeat.pages.length,created.pages.length);
    data=await request(url,token,{action:'complete',revision:repeat.record.revision,pageId:parts[0].id});assert.equal(data.transition.next.partNumber,2);
    const next=await request(url,token,{action:'transition',revision:data.record.revision,operationId:crypto.randomUUID(),blockId:'9',partNumber:2,name:data.transition.name,parts:data.transition.parts.map(part=>({partNumber:part.partNumber,name:part.name,existingPageId:part.existingPageId}))});
    assert.equal(next.pages.length,created.pages.length);assert.equal(next.record.current.pageId,parts[1].id);
  }finally{await f.stop();}
});
