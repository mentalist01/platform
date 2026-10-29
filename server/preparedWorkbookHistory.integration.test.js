import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {BLANK_WORKBOOK_ODS} from './blankWorkbook.js';

test('fresh attempts retain original, history and Notes, reject stale helpers, and respect group permissions',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8'));write('students',[...students,{id:'student-d',teacherId:'teacher-a',name:'Индивидуальный ученик',code:'student-d-code',grade:'11'}]);});
  const teacher=f.tokens['teacher-a'],pupil=(await f.request('/api/login','',{code:'student-d-code'})).token;
  const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const[k,v]of Object.entries(fields))form.append(k,v);const r=await fetch(f.base+route,{method:'POST',headers:{Authorization:'Bearer '+teacher},body:form});assert.ok(r.ok,await r.clone().text());return r.json();};
  const download=async(url,auth=teacher)=>{const r=await fetch(f.base+url,{headers:{Authorization:'Bearer '+auth}});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);return r.text();};
  const exchange=async ticket=>{const r=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.5.8 (Windows)'},body:JSON.stringify({ticket})});assert.equal(r.status,200,await r.clone().text());return r.json();};
  const helper=async(grant,route,body,status=200)=>{const r=await fetch(f.base+'/workbook-helper/v1/'+route,{method:body?'POST':'GET',headers:{Authorization:'Workbook '+grant.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
  const save=async(grant,bytes,revision,status=200,liveRevision)=>{const form=new FormData();form.append('file',new Blob([bytes]),'Решение.ods');form.append('revision',String(revision));form.append('contentHash',crypto.createHash('sha256').update(bytes).digest('hex'));if(liveRevision!==undefined)form.append('liveRevision',String(liveRevision));const r=await fetch(f.base+'/workbook-helper/v1/'+(liveRevision===undefined?'content':'live/checkpoint'),{method:liveRevision===undefined?'PUT':'POST',headers:{Authorization:'Workbook '+grant.token},body:form});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
  try{
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','Оригинал.ods',Buffer.from('ORIGINAL'),{studentId:'student-d',taskNumber:'18',category:'class'});
    const set=await f.request('/api/lesson-task-sets',teacher,{name:'Повторить таблицу',taskNumber:18,tasks:[{images:[image.id],answers:['1','2'],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    const {run}=await f.request('/api/lesson-task-runs',teacher,{room:'board-teacher-a-student-d',setId:set.id,x:0,y:0},'POST',201),card=run.cards[0],asset=card.attachments[0],target={cardId:card.id,assetId:asset.assetId},base='/api/lesson-task-runs/'+run.id,query='?'+new URLSearchParams(target);
    const history=()=>f.request(base+'/workbook-history'+query,teacher);
    assert.equal((await history()).total,0);assert.equal(await download((await history()).source.url),'ORIGINAL');
    await f.request(base+'/workbook-history'+query,f.tokens['teacher-b'],undefined,'GET',403);
    await f.request(base+'/workbook-history'+query,f.tokens['student-c'],undefined,'GET',403);
    const launch=async(auth=teacher)=>(await f.request(base+'/live/helper',auth,{...target,start:true},'POST',201)).ticket;
    const first=await exchange(await launch());await helper(first,'live/fallback',{kind:'TestOrdinaryFallback'});
    const v1=await save(first,'FIRST',0);assert.equal(v1.revision,1);assert.equal((await save(first,'FIRST',1)).revision,2);assert.equal((await history()).total,1);
    const v2=await save(first,'SECOND',2);assert.equal(v2.revision,3);
    const before=await history(),firstVersion=before.versions.find(v=>v.revision===1);assert.equal(before.total,2);assert.equal(await download(firstVersion.url),'FIRST');assert.equal(await download(before.source.url),'ORIGINAL');
    assert.ok(!JSON.stringify(before).includes('storage'));assert.ok(!JSON.stringify(before).includes(first.token));
    const notes=await f.request('/api/files?studentId=student-d&taskNumber=18&category=class',teacher),canonical=notes.find(v=>v.preparedRunId===run.id);assert.ok(canonical);assert.equal(await download(canonical.url),'SECOND');
    await f.request(base+'/workbook-restart',teacher,{...target,expectedRevision:3,expectedAttemptId:''},'POST',400);
    await f.request(base+'/workbook-restart',teacher,{...target,confirmClosed:true,expectedRevision:2,expectedAttemptId:''},'POST',409);
    const pending=await launch();
    const restart=await f.request(base+'/workbook-restart',pupil,{...target,confirmClosed:true,expectedRevision:3,expectedAttemptId:''});assert.equal(restart.attempt.number,2);
    await helper(first,'live/state',undefined,410);await save(first,'STALE',3,410);
    const staleTicket=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.5.8'},body:JSON.stringify({ticket:pending})});assert.equal(staleTicket.status,410);
    assert.equal(await download(canonical.url),'SECOND','Starting fresh does not remove the previous Notes file');
    const fresh=await exchange(await launch(pupil));assert.notEqual(fresh.workbookKey,first.workbookKey);assert.equal(fresh.contentHash,crypto.createHash('sha256').update('ORIGINAL').digest('hex'));assert.equal(fresh.revision,3);
    const source=await fetch(f.base+'/workbook-helper/v1/content',{headers:{Authorization:'Workbook '+fresh.token}});assert.equal(await source.text(),'ORIGINAL');assert.equal(source.headers.get('x-workbook-revision'),'3');
    const updated=(await f.request('/api/lesson-task-run?room='+encodeURIComponent(run.room),teacher)).run.cards[0].attachments[0];assert.equal(updated.attempt.number,2);assert.equal(updated.attempt.hasSaved,false);assert.equal(updated.solution.id,canonical.id);
    await helper(fresh,'live/fallback',{kind:'TestOrdinaryFallback'});assert.equal((await save(fresh,'THIRD',3)).revision,4);
    const after=await history();assert.equal(after.total,3);assert.equal(after.versions[0].attemptNumber,2);assert.equal(after.versions[0].savedBy.id,'student-d');assert.equal(await download(firstVersion.url),'FIRST');assert.equal(await download(canonical.url),'THIRD');
    await f.request(base+'/workbook-restart',teacher,{...target,confirmClosed:true,expectedRevision:4,expectedAttemptId:''},'POST',409);

    // An unsaved native collaborative change prevents starting over.
    await f.request(base+'/live',teacher,{...target,enabled:true,retry:true});const native=await exchange(await launch());
    await helper(native,'live/initialize',{sourceHash:native.contentHash,book:{sheets:[{id:'sheet',name:'Лист 1',cells:{}}]}});
    await helper(native,'live/sync',{command:{id:'pending',type:'patch',changes:[{sheetId:'sheet',address:'A1',property:'content',value:{kind:'number',value:9},baseVersion:0}]},since:0});
    await f.request(base+'/workbook-restart',teacher,{...target,confirmClosed:true,expectedRevision:4,expectedAttemptId:restart.attempt.id},'POST',409);
    assert.equal((await helper(native,'live/state')).revision,1);await save(native,'NATIVE',4,200,1);
    const third=await f.request(base+'/workbook-restart',teacher,{...target,confirmClosed:true,expectedRevision:5,expectedAttemptId:restart.attempt.id});assert.equal(third.attempt.number,3);assert.equal((await history()).total,4);

    // The old single-writer helper also restarts from original and loses its
    // old upload grant; the new attempt gets a different native document key.
    const page=await f.request('/api/lesson-pages',teacher,{room:run.room,action:'create',name:'История отдельной таблицы'});
    const plain=(await f.request('/api/lesson-task-runs',teacher,{room:run.room+'~page~'+page.id,setId:set.id,x:0,y:0},'POST',201)).run,pc=plain.cards[0],pt={cardId:pc.id,assetId:pc.attachments[0].assetId},pb='/api/lesson-task-runs/'+plain.id;
    const pg=await exchange((await f.request(pb+'/helper',teacher,pt,'POST',201)).ticket);await save(pg,'PLAIN',0);
    await f.request(pb+'/workbook-restart',teacher,{...pt,confirmClosed:true,expectedRevision:1,expectedAttemptId:''});
    const oldRead=await fetch(f.base+'/workbook-helper/v1/content',{headers:{Authorization:'Workbook '+pg.token}});assert.equal(oldRead.status,410);await save(pg,'OLD-PLAIN',1,410);
    const pg2=await exchange((await f.request(pb+'/helper',teacher,pt,'POST',201)).ticket);assert.notEqual(pg2.workbookKey,pg.workbookKey);
    const freshPlain=await fetch(f.base+'/workbook-helper/v1/content',{headers:{Authorization:'Workbook '+pg2.token}});assert.equal(await freshPlain.text(),'ORIGINAL');await save(pg2,'NEW-PLAIN',1);
    const ph=await f.request(pb+'/workbook-history?'+new URLSearchParams(pt),teacher);assert.equal(ph.total,2);assert.equal(ph.versions[0].attemptNumber,2);

    const group=(await f.request('/api/lesson-task-runs',teacher,{room:'board-group-'+f.groupId,setId:set.id,x:0,y:0},'POST',201)).run,gc=group.cards[0],gt={cardId:gc.id,assetId:gc.attachments[0].assetId},gb='/api/lesson-task-runs/'+group.id;
    await f.request(gb+'/workbook-restart',f.tokens['student-a'],{...gt,confirmClosed:true,expectedRevision:0,expectedAttemptId:''},'POST',403);
    const gh=await f.request(gb+'/workbook-history?'+new URLSearchParams(gt),f.tokens['student-a']);assert.equal(gh.total,0);assert.equal(await download(gh.source.url,f.tokens['student-a']),'ORIGINAL');
  }finally{await f.stop();}
});

test('text tasks restart with the original input and a blank workbook; history paginates and survives removing its set',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(),a=f.tokens['teacher-a'];
  const upload=async(route,name,bytes,fields={})=>{const data=new FormData();data.append('file',new Blob([bytes]),name);for(const[k,v]of Object.entries(fields))data.append(k,v);const r=await fetch(f.base+route,{method:'POST',headers:{Authorization:'Bearer '+a},body:data});assert.ok(r.ok,await r.clone().text());return r.json();};
  try{
    const image=await upload('/api/lesson-task-images','task.png',await sharp({create:{width:500,height:100,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','26_1.txt','100\n1\n2\n3\n',{studentId:'student-a',taskNumber:'26',category:'class'});
    const set=await f.request('/api/lesson-task-sets',a,{name:'Текст и таблица',taskNumber:26,tasks:[{images:[image.id],answers:['3','100'],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    const {run}=await f.request('/api/lesson-task-runs',a,{room:'board-group-'+f.groupId,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0],target={cardId:card.id,assetId:card.attachments[0].assetId},base='/api/lesson-task-runs/'+run.id,query='?'+new URLSearchParams(target);
    const grant=async()=>{const launch=await f.request(base+'/helper',a,target,'POST',201);const r=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.5.8'},body:JSON.stringify({ticket:launch.ticket})});assert.equal(r.status,200);return r.json();};
    const first=await grant();assert.ok(first.sourceText);
    const initial=await fetch(f.base+'/workbook-helper/v1/content',{headers:{Authorization:'Workbook '+first.token}});assert.deepEqual(Buffer.from(await initial.arrayBuffer()),BLANK_WORKBOOK_ODS);
    for(let index=0;index<35;index++){
      const data=new FormData();data.append('file',new Blob(['saved version '+index]),'Таблица.ods');data.append('revision',String(index));
      const r=await fetch(f.base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:'Workbook '+first.token},body:data});assert.equal(r.status,200,await r.clone().text());
    }
    const history=await f.request(base+'/workbook-history'+query,f.tokens['student-a']);assert.equal(history.total,35);assert.equal(history.versions.length,30);assert.ok(history.nextBefore);
    const older=await f.request(base+'/workbook-history'+query+'&before='+history.nextBefore,f.tokens['student-a']);assert.equal(older.versions.length,5);assert.equal(older.nextBefore,null);assert.equal(new Set([...history.versions,...older.versions].map(v=>v.id)).size,35);
    const original=await fetch(f.base+history.source.url,{headers:{Authorization:'Bearer '+f.tokens['student-a']}});assert.equal(await original.text(),'100\n1\n2\n3\n');
    await f.request(base+'/workbook-restart',a,{...target,confirmClosed:true,expectedRevision:35,expectedAttemptId:''});const fresh=await grant();
    assert.equal(fresh.revision,35);assert.equal(fresh.contentHash,crypto.createHash('sha256').update(BLANK_WORKBOOK_ODS).digest('hex'));
    const blank=await fetch(f.base+'/workbook-helper/v1/content',{headers:{Authorization:'Workbook '+fresh.token}});assert.deepEqual(Buffer.from(await blank.arrayBuffer()),BLANK_WORKBOOK_ODS);
    const text=await fetch(f.base+'/workbook-helper/v1/source-text',{headers:{Authorization:'Workbook '+fresh.token}});assert.equal(await text.text(),'100\n1\n2\n3\n');
    await f.request(base+'/action',a,{action:'remove-set',setId:set.id});
    const removed=await f.request(base+'/workbook-history'+query,f.tokens['student-a']);assert.equal(removed.total,35);
    const old=await fetch(f.base+older.versions.at(-1).url,{headers:{Authorization:'Bearer '+f.tokens['student-a']}});assert.equal(await old.text(),'saved version 0');
  }finally{await f.stop();}
});
