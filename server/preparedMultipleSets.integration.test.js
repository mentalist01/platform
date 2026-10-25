import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('authenticated append isolates teachers, hides future conditions, resolves per-card runtime and saves homework and table under the correct topic',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{base,request,tokens}=f,a=tokens['teacher-a'],s=tokens['student-a'];
  try{
    const upload=async(route,name,bytes,fields={})=>{
      const form=new FormData();form.append('file',new Blob([bytes]),name);for(const [key,value]of Object.entries(fields))form.append(key,value);
      const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(response.ok,await response.clone().text());return response.json();
    };
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer());
    const laterImage=await upload('/api/lesson-task-images','later.png',await sharp({create:{width:600,height:150,channels:4,background:'#f0e8ff'}}).png().toBuffer());
    const fileA=await upload('/api/files','same.txt',Buffer.from('17\n'),{studentId:'student-a',taskNumber:'17',category:'class'});
    const fileB=await upload('/api/files','same.txt',Buffer.from('26\n'),{studentId:'student-a',taskNumber:'26',category:'class'});
    const set=async(name,number,img,file,partNumber=1)=>request('/api/lesson-task-sets',a,{name,taskNumber:number,partNumber,tasks:[{title:'1',images:[img.id],answers:['2','100'],attachments:[{sourceFileId:file.id,runtime:true,runtimeName:'same.txt'}]}]},'POST',201);
    const first=await set('17 · Основы',17,image,fileA),second=await set('26 · Часть 2',26,laterImage,fileB,2);
    const room=`board-group-${f.groupId}`;let {run}=await request('/api/lesson-task-runs',a,{room,setId:first.id,x:0,y:0},'POST',201);
    const route=`/api/lesson-task-runs/${run.id}/sets`,input={setId:second.id,setVersion:second.version};
    await request(route,s,input,'POST',403);await request(route,tokens['teacher-b'],input,'POST',403);
    await request(route,a,{...input,setVersion:0},'POST',409);
    ({run}=await request(route,a,input));assert.equal(run.total,2);assert.equal(run.cards.length,1);assert.equal(run.sources[1].name,second.name);
    assert.equal((await request(route,a,input)).run.total,2);
    const firstDownload=await fetch(base+run.cards[0].attachments[0].url,{headers:{Authorization:`Bearer ${s}`}});assert.equal(await firstDownload.text(),'17\n');
    const forbidden=await fetch(base+`/api/lesson-task-assets/${laterImage.id}?run=${run.id}`,{headers:{Authorization:`Bearer ${s}`}});assert.equal(forbidden.status,403,'Future conditions stay private');
    await request(`/api/lesson-task-runs/${run.id}/tasks`,s,undefined,'GET',403);
    const catalog=await request(`/api/lesson-task-runs/${run.id}/tasks`,a);assert.equal(catalog.tasks[1].setId,second.id);assert.equal(catalog.tasks[1].sourceIndex,0);
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'choose',taskId:catalog.tasks[1].id}));
    const card=run.cards[1];assert.equal(card.taskNumber,26);assert.equal(card.partNumber,2);
    const runtime=await fetch(base+card.attachments[0].url,{headers:{Authorization:`Bearer ${s}`}});assert.equal(await runtime.text(),'26\n','Same runtime name is scoped to the selected task');
    const queued=await request('/api/prepared-homework/basket',a,{runId:run.id,cardId:card.id},'POST',201);assert.equal(queued.goal.taskNumber,26);assert.equal(queued.goal.partNumber,2);
    const {ticket}=await request(`/api/lesson-task-runs/${run.id}/helper`,a,{cardId:card.id,assetId:card.attachments[0].assetId},'POST',201);
    const session=await request('/workbook-helper/v1/exchange','',{ticket});
    const headers={Authorization:`Workbook ${session.token}`};
    const source=await fetch(base+'/workbook-helper/v1/source-text',{headers});assert.equal(await source.text(),'26\n');
    const blank=await fetch(base+'/workbook-helper/v1/content',{headers}),bytes=await blank.arrayBuffer();assert.equal(blank.status,200);
    const form=new FormData();form.append('file',new Blob([bytes]),'решение.ods');form.append('revision','0');
    const saved=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers,body:form});assert.equal(saved.status,200,await saved.clone().text());
    const notes=await request('/api/files?studentId=student-a&taskNumber=26&category=class',a);
    const solution=notes.find(file=>file.preparedRunId===run.id);assert.ok(solution);assert.equal(solution.taskNumber,26);assert.equal(solution.workbookPartNumber,2);
    assert.equal((await request('/api/files?studentId=student-a&taskNumber=17&category=class',a)).some(file=>file.id===solution.id),false);
    const pupil=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;
    assert.equal(pupil.sources.length,2);assert.equal('referenceAnswers' in pupil.cards[1],false);
  }finally{await f.stop();}
});
