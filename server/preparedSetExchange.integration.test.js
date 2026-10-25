import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('authenticated exchange routes isolate teacher access and copy attachments into a runnable private library',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{tokens,request,base}=f,a=tokens['teacher-a'],b=tokens['teacher-b'],s=tokens['student-a'];
  try{
    const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const [key,value]of Object.entries(fields))form.append(key,value);const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(response.ok,await response.clone().text());return response.json();};
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer());
    const source=await upload('/api/files','17_2.txt',Buffer.from('42\n58\n'),{studentId:'student-a',taskNumber:'17',category:'class'});
    const set=await request('/api/lesson-task-sets',a,{name:'Обмен 17',taskNumber:17,tasks:[{title:'5',images:[image.id],answers:['2','100'],attachments:[{sourceFileId:source.id,runtime:true,runtimeName:'17_2.txt'}]}]},'POST',201);
    await request('/api/lesson-task-set-exchange',s,undefined,'GET',403);
    await request(`/api/lesson-task-sets/${set.id}/sharing`,b,{version:0,recipientIds:['teacher-a']},'PUT',404);
    assert.deepEqual((await request('/api/lesson-task-set-exchange',b)).sets,[]);
    await request(`/api/lesson-task-sets/${set.id}/sharing`,a,{version:0,recipientIds:['teacher-b']},'PUT');
    const preview=await request(`/api/lesson-task-exchange/${set.id}`,b);assert.equal(preview.set.tasks[0].title,'5');
    assert.equal(JSON.stringify(preview).includes(source.id),false,'Private Notes references are omitted');
    await request(`/api/lesson-task-exchange/${set.id}`,s,undefined,'GET',403);
    assert.equal((await fetch(base+preview.set.tasks[0].imageFiles[0].url+`?_auth=${encodeURIComponent(b)}`)).status,200);
    const originalAsset=set.tasks[0].attachments[0].assetId;
    assert.equal((await fetch(base+`/api/lesson-task-assets/${originalAsset}`,{headers:{Authorization:`Bearer ${b}`}})).status,404,'Share does not grant unrestricted asset access');
    const {set:copy}=await request(`/api/lesson-task-exchange/${set.id}/copy`,b,{version:1},'POST',201);
    const retry=await request(`/api/lesson-task-exchange/${set.id}/copy`,b,{version:1},'POST',201);assert.equal(retry.set.id,copy.id);
    const copiedContent=await fetch(base+copy.tasks[0].attachments[0].url,{headers:{Authorization:`Bearer ${b}`}});assert.equal(await copiedContent.text(),'42\n58\n');
    const {run}=await request('/api/lesson-task-runs',b,{room:'board-teacher-b-student-c',setId:copy.id,x:0,y:0},'POST',201);
    const card=run.cards[0];
    const runtime=card.attachments[0];assert.equal(runtime.runtime,true);assert.equal(runtime.runtimeName,'17_2.txt');
    const content=await fetch(base+runtime.url,{headers:{Authorization:`Bearer ${tokens['student-c']}`}});assert.equal(content.status,200);
    fs.writeFileSync(path.join(f.root,runtime.runtimeName),Buffer.from(await content.arrayBuffer()));
    const executed=execFileSync(process.platform==='win32'?'C:/Python313/python.exe':'python3',['-c',"a=list(map(int,open('17_2.txt')));print(len(a),sum(a))"],{cwd:f.root,encoding:'utf8'});assert.match(executed,/2 100/);
    await request(`/api/lesson-task-sets/${set.id}/sharing`,a,{version:1,recipientIds:[]},'PUT');
    await request(`/api/lesson-task-exchange/${set.id}`,b,undefined,'GET',404);
    assert.equal((await fetch(base+preview.set.tasks[0].imageFiles[0].url,{headers:{Authorization:`Bearer ${b}`}})).status,404);
    assert.equal((await request('/api/lesson-task-sets',b)).sets[0].id,copy.id);
    const cached=await fetch(base+'/api/lesson-task-set-exchange',{headers:{Authorization:`Bearer ${b}`}});assert.match(cached.headers.get('cache-control'),/private, no-store/);
  }finally{await f.stop();}
});
