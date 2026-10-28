import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {workbookFallbackDiagnostic} from './workbookFallback.js';

test('startup logs redact paths, tokens and unknown metadata',()=>{
  const d=workbookFallbackDiagnostic({version:'1.5.7',engine:'excel',code:'0x80040154',stage:'Excel C:\\Users\\private',summary:'failed token=secret',kind:'COMException'},0);
  assert.equal(d.code,'0X80040154');assert.equal(d.version,'1.5.7');
  assert.ok(!JSON.stringify(d).includes('private'));assert.ok(!JSON.stringify(d).includes('secret'));
});

test('ordinary fallback saves XLS with last-save-wins, persists diagnostics and keeps authorization',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{
    const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8'));
    write('students',[...students,{id:'student-d',teacherId:'teacher-a',name:'Test',code:'student-d-code',grade:'11'}]);
  });
  try{
    const teacher=f.tokens['teacher-a'],pupil=(await f.request('/api/login','',{code:'student-d-code'})).token;
    const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const[k,v]of Object.entries(fields))form.append(k,v);const r=await fetch(f.base+route,{method:'POST',headers:{Authorization:'Bearer '+teacher},body:form});assert.ok(r.ok,await r.clone().text());return r.json();};
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','22_04.xls',Buffer.from('original XLS'),{studentId:'student-d',taskNumber:'22',category:'class'});
    const set=await f.request('/api/lesson-task-sets',teacher,{name:'Fallback',taskNumber:22,tasks:[{images:[image.id],answers:['1','2'],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    const {run}=await f.request('/api/lesson-task-runs',teacher,{room:'board-teacher-a-student-d',setId:set.id,x:0,y:0},'POST',201);
    const target={cardId:run.cards[0].id,assetId:run.cards[0].attachments[0].assetId},route='/api/lesson-task-runs/'+run.id+'/live';
    const open=async(auth,ordinary=false)=>{const {ticket}=await f.request(route+'/helper',auth,{...target,start:true,ordinary},'POST',201);const r=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.5.7'},body:JSON.stringify({ticket})});assert.equal(r.status,200);return r.json();};
    const student=await open(pupil);assert.equal(student.live.protocol,1);
    const fallback=await fetch(f.base+'/workbook-helper/v1/live/fallback',{method:'POST',headers:{Authorization:'Workbook '+student.token,'Content-Type':'application/json'},body:JSON.stringify({version:'1.5.7',engine:'excel',code:'0x80040154',stage:'startup',summary:'C:\\Users\\private'})});
    assert.equal(fallback.status,200);
    const adult=await open(teacher);assert.equal(adult.live,null);
    const save=async(token,bytes,revision='0')=>{const form=new FormData();form.append('file',new Blob([bytes]),'22_04.xls');form.append('revision',revision);const r=await fetch(f.base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:'Workbook '+token},body:form});assert.equal(r.status,200,await r.clone().text());return r.json();};
    assert.equal((await save(student.token,'student first')).revision,1);
    assert.equal((await save(adult.token,'teacher next','0')).revision,2);
    assert.equal((await save(student.token,'student last','0')).revision,3);
    const r=await fetch(f.base+'/workbook-helper/v1/content',{headers:{Authorization:'Workbook '+adult.token}});assert.equal(await r.text(),'student last');
    const params=new URLSearchParams(target);
    const log=await f.request(route+'/diagnostics?'+params,teacher);assert.equal(log.events.length,1);assert.equal(log.events[0].code,'0X80040154');assert.ok(!JSON.stringify(log).includes('private'));
    await f.request(route+'/diagnostics?'+params,pupil,undefined,'GET',403);
    await f.request(route+'/helper',f.tokens['student-a'],{...target,start:true,ordinary:true},'POST',403);
    const board=(await f.request('/api/lesson-task-run?room='+encodeURIComponent(run.room),teacher)).run;
    assert.equal(board.cards[0].attachments[0].solution.name,'22_04.xls');
    assert.equal(board.cards[0].attachments[0].live.ordinaryFallback,true);
  }finally{await f.stop();}
});
