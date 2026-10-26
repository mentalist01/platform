import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('teacher can replace a mistaken group set and undo; pupil views, notes downloads and helper access stay authorized',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base}=f,a=tokens['teacher-a'],s=tokens['student-a'];
  try{
    const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const[key,value]of Object.entries(fields))form.append(key,value);const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(response.ok,await response.clone().text());return response.json();};
    const image=await upload('/api/lesson-task-images','wrong.png',await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer());
    const rightImage=await upload('/api/lesson-task-images','right.png',await sharp({create:{width:600,height:130,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','26.txt',Buffer.from('10\n20\n'),{studentId:'student-a',taskNumber:'26',category:'class'});
    const wrong=await request('/api/lesson-task-sets',a,{name:'Ошибочный',taskNumber:26,tasks:[{title:'1',images:[image.id],answers:['1','2'],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    const right=await request('/api/lesson-task-sets',a,{name:'Нужный',taskNumber:17,tasks:[{title:'1',images:[rightImage.id],answers:['3','4']}]},'POST',201);
    const templateBefore=(await request('/api/lesson-task-sets',a)).sets.find(row=>row.id===wrong.id);
    const room=`board-group-${f.groupId}`;let {run}=await request('/api/lesson-task-runs',a,{room,setId:wrong.id,x:0,y:0},'POST',201);
    const card=run.cards[0],action=(token,input,status=200)=>request(`/api/lesson-task-runs/${run.id}/action`,token,input,'POST',status);
    const launch=await request(`/api/lesson-task-runs/${run.id}/helper`,a,{cardId:card.id,assetId:card.attachments[0].assetId},'POST',201);
    const session=await request('/workbook-helper/v1/exchange','',{ticket:launch.ticket});const headers={Authorization:`Workbook ${session.token}`};
    const content=await fetch(base+'/workbook-helper/v1/content',{headers});const form=new FormData();form.append('file',new Blob([await content.arrayBuffer()]),'solution.ods');form.append('revision','0');
    const save=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers,body:form});assert.equal(save.status,200);const {revision}=await save.json();assert.equal(revision,1);
    const solution=(await request('/api/files?studentId=student-a&taskNumber=26&category=class',a)).find(row=>row.preparedRunId===run.id);assert.ok(solution);
    await action(s,{action:'remove-set',setId:wrong.id},403);await action(tokens['teacher-b'],{action:'remove-set',setId:wrong.id},403);
    ({run}=await action(a,{action:'remove-set',setId:wrong.id}));assert.equal(run.total,0);assert.equal(run.cards.length,0);
    const removalId=run.removedSets[0].id;await action(s,{action:'restore-set',removalId},403);
    const pupil=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;assert.equal(pupil.total,0);assert.equal('removedSets' in pupil,false);
    assert.equal((await fetch(base+card.images[0].url,{headers:{Authorization:`Bearer ${s}`}})).status,403);
    assert.equal((await fetch(base+solution.url,{headers:{Authorization:`Bearer ${s}`}})).status,200,'saved solution stays accessible in notes');
    assert.equal((await fetch(base+solution.url,{headers:{Authorization:`Bearer ${tokens['student-c']}`}})).status,403);
    assert.equal((await fetch(base+'/workbook-helper/v1/content',{headers})).status,410,'an old helper session cannot overwrite a removed task');
    ({run}=await request('/api/lesson-task-runs',a,{room,setId:right.id,x:800,y:200},'POST',201));assert.equal(run.sources[0].id,right.id);assert.equal(run.removedSets.length,1);
    ({run}=await action(a,{action:'restore-set',removalId}));assert.equal(run.sources.length,2);assert.equal(run.cards.find(row=>row.id===card.id).attachments[0].solution.id,solution.id);
    const restored=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;assert.equal(restored.cards.length,2);assert.ok(restored.cards.every(row=>!Object.hasOwn(row,'referenceAnswers')));
    assert.deepEqual((await request('/api/lesson-task-sets',a)).sets.find(row=>row.id===wrong.id),templateBefore,'removing a set from a board does not change the reusable template');
  }finally{await f.stop();}
});
