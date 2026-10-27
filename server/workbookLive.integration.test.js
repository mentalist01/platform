import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {BLANK_WORKBOOK_ODS} from './blankWorkbook.js';

test('shared helper is scoped, requires an upgraded client, persists both authors and checkpoints the common revision',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8'));write('students',[...students,{id:'student-d',teacherId:'teacher-a',name:'Индивидуальный ученик',code:'student-d-code',grade:'11',createdAt:'2026-10-01T10:00:00Z'}]);}),{request,tokens,base}=f,a=tokens['teacher-a'];
  const p=(await request('/api/login','',{code:'student-d-code'})).token;
  try{
    const upload=async(route,name,bytes,fields={})=>{
      const form=new FormData();form.append('file',new Blob([bytes]),name);for(const [key,value]of Object.entries(fields))form.append(key,String(value));
      const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(response.ok,await response.clone().text());return response.json();
    };
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','book.ods',BLANK_WORKBOOK_ODS,{studentId:'student-d',taskNumber:18,category:'class'});
    const set=await request('/api/lesson-task-sets',a,{name:'Совместная таблица',taskNumber:18,tasks:[{images:[image.id],answers:['1','2'],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    let {run}=await request('/api/lesson-task-runs',a,{room:'board-teacher-a-student-d',setId:set.id,x:0,y:0},'POST',201);
    const card=run.cards[0],asset=card.attachments[0],route=`/api/lesson-task-runs/${run.id}/live`,target={cardId:card.id,assetId:asset.assetId};
    await request(route,p,{...target,enabled:true},'POST',403);
    ({run}=await request(route,a,{...target,enabled:true}));assert.equal(run.cards[0].attachments[0].live.enabled,true);
    await request(`/api/lesson-task-runs/${run.id}/helper`,a,target,'POST',409);
    const launch=async token=>(await request(route+'/helper',token,target,'POST',201)).ticket;
    const exchange=async(ticket,version='1.4.0')=>{
      const response=await fetch(base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/'+version},body:JSON.stringify({ticket})});return {response,data:await response.json()};
    };
    const ticket=await launch(a);assert.equal((await exchange(ticket,'1.3.3')).response.status,426);
    const teacher=(await exchange(ticket)).data,pupil=(await exchange(await launch(p))).data;
    assert.equal(teacher.workbookKey,pupil.workbookKey);assert.notEqual(teacher.token,pupil.token);
    const helper=async(token,path,body,status=200)=>{
      const response=await fetch(base+'/workbook-helper/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:`Workbook ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
    };
    const book={sheets:[{id:'sheet1',name:'Лист 1',cells:{}}]};
    await helper(teacher.token,'live/initialize',{sourceHash:'bad',book},409);
    await helper(teacher.token,'live/initialize',{sourceHash:teacher.contentHash,book});
    const command=(id,address,value)=>({id,type:'patch',changes:[{sheetId:'sheet1',address,property:'content',value:{kind:'number',value},baseVersion:0}]});
    const results=await Promise.all([helper(teacher.token,'live/sync',{command:command('teacher1','A1',12),since:0}),helper(pupil.token,'live/sync',{command:command('pupil1','B1',30),since:0})]);
    assert.ok(results.every(result=>result.receipt.status==='accepted'));
    const state=await helper(pupil.token,'live/state');assert.equal(state.revision,2);assert.equal(state.book.sheets[0].cells.A1.content.value,12);assert.equal(state.book.sheets[0].cells.B1.content.value,30);
    const selection={sheetName:'Лист 1',activeCell:[2,1],ranges:[[2,1,8,3]],objects:[]};
    assert.equal((await helper(teacher.token,'live/presence',{selection,name:'Forged',color:'red'})).peers.length,0);
    const visible=await helper(pupil.token,'live/presence',{selection});
    assert.equal(visible.peers.length,1);assert.equal(visible.peers[0].color,'#8b5cf6');assert.notEqual(visible.peers[0].name,'Forged');assert.deepEqual(visible.peers[0].selection,selection);
    assert.equal(JSON.stringify(visible).includes(teacher.token),false);assert.equal(visible.revision,2);
    await helper(pupil.token,'live/presence',{selection:{...selection,ranges:[[0,0,1048576,1]]}},400);
    await helper(teacher.token.slice(0,-1)+'x','live/presence',{selection},401);
    for(let i=0;i<15;i++)await helper(teacher.token,'live/presence',{selection});
    assert.deepEqual(await helper(pupil.token,'live/state'),state,'Presence must not alter the workbook, revision or undo journal');
    await helper(teacher.token,'live/presence',{selection:null});assert.equal((await helper(pupil.token,'live/presence',{selection})).peers.length,0);
    await request(route,a,{...target,enabled:false},'POST',409);
    const regular=new FormData();regular.append('file',new Blob([BLANK_WORKBOOK_ODS]),'book.ods');regular.append('revision','0');
    assert.equal((await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${pupil.token}`},body:regular})).status,409);
    const checkpoint=async liveRevision=>{
      const form=new FormData();form.append('file',new Blob([BLANK_WORKBOOK_ODS]),'Общее решение.ods');form.append('revision','0');form.append('liveRevision',String(liveRevision));form.append('contentHash',crypto.createHash('sha256').update(BLANK_WORKBOOK_ODS).digest('hex'));
      return fetch(base+'/workbook-helper/v1/live/checkpoint',{method:'POST',headers:{Authorization:`Workbook ${teacher.token}`},body:form});
    };
    assert.equal((await checkpoint(1)).status,409);const saved=await checkpoint(2);assert.equal(saved.status,200,await saved.clone().text());
    assert.equal((await helper(pupil.token,'live/state')).checkpointRevision,2);
    const foreign=await fetch(base+'/workbook-helper/v1/live/state',{headers:{Authorization:`Workbook ${teacher.token.slice(0,-1)+'x'}`}});assert.equal(foreign.status,401);
    await request(route,a,{...target,enabled:false});await helper(pupil.token,'live/state',null,410);
    await helper(pupil.token,'live/presence',{selection},410);
    const group=await request('/api/lesson-task-runs',a,{room:`board-group-${f.groupId}`,setId:set.id,x:0,y:0},'POST',201);
    await request(`/api/lesson-task-runs/${group.run.id}/live/helper`,tokens['student-a'],{cardId:group.run.cards[0].id,assetId:group.run.cards[0].attachments[0].assetId},'POST',403);
  }finally{await f.stop();}
});


test('one-click first open joins the same epoch for both individual participants and preserves legacy writer locks',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,(write,data)=>{const students=JSON.parse(fs.readFileSync(path.join(data,'students.json'),'utf8'));write('students',[...students,{id:'student-d',teacherId:'teacher-a',name:'Индивидуальный ученик',code:'student-d-code',grade:'11'}]);});
  try{
    const teacher=f.tokens['teacher-a'],pupil=(await f.request('/api/login','',{code:'student-d-code'})).token;
    const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const[k,v]of Object.entries(fields))form.append(k,v);const r=await fetch(f.base+route,{method:'POST',headers:{Authorization:'Bearer '+teacher},body:form});assert.ok(r.ok,await r.clone().text());return r.json();};
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','book.ods',BLANK_WORKBOOK_ODS,{studentId:'student-d',taskNumber:'18',category:'class'});
    const set=await f.request('/api/lesson-task-sets',teacher,{name:'Одна кнопка',taskNumber:18,tasks:[{images:[image.id],answers:['1','2'],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    const {run}=await f.request('/api/lesson-task-runs',teacher,{room:'board-teacher-a-student-d',setId:set.id,x:0,y:0},'POST',201);
    const target={cardId:run.cards[0].id,assetId:run.cards[0].attachments[0].assetId},route='/api/lesson-task-runs/'+run.id;
    await f.request(route+'/helper',teacher,target,'POST',201);
    await f.request(route+'/live/helper',pupil,{...target,start:true},'POST',409);
    await f.request(route+'/action',teacher,{...target,action:'release-file',allowWithoutSave:true});
    const tickets=await Promise.all([teacher,pupil].map(token=>f.request(route+'/live/helper',token,{...target,start:true},'POST',201)));
    const grants=await Promise.all(tickets.map(async({ticket})=>{const r=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.4.0 (Windows)'},body:JSON.stringify({ticket})});assert.equal(r.status,200);return r.json();}));
    assert.equal(grants[0].live.epoch,grants[1].live.epoch);assert.equal(grants[0].workbookKey,grants[1].workbookKey);
    assert.notEqual(grants[0].live.actorId,grants[1].live.actorId);
    await f.request(route+'/live',teacher,{...target,enabled:false});
    const legacy=await f.request(route+'/helper',teacher,target,'POST',201);
    const blocked=await fetch(f.base+route+'/live/helper',{method:'POST',headers:{Authorization:'Bearer '+pupil,'Content-Type':'application/json'},body:JSON.stringify({...target,start:true})});
    const transition=await blocked.json();assert.equal(blocked.status,409);assert.equal(transition.code,'PREVIOUS_TABLE_OPEN');assert.equal(transition.previous.canClose,false);
    await f.request(route+'/live/helper',pupil,{...target,start:true,closePrevious:true,previousGeneration:transition.previous.generation},'POST',409);
    await f.request(route+'/live/helper',teacher,{...target,start:true,closePrevious:true,previousGeneration:transition.previous.generation+1},'POST',409);
    await f.request(route+'/live/helper',teacher,{...target,start:true,closePrevious:true,previousGeneration:transition.previous.generation},'POST',201);
    const stale=await fetch(f.base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.4.0 (Windows)'},body:JSON.stringify({ticket:legacy.ticket})});assert.equal(stale.status,409,'old separate helper cannot overwrite the common workbook');

    await f.request(route+'/live/helper',f.tokens['teacher-b'],{...target,start:true},'POST',403);
    const group=await f.request('/api/lesson-task-runs',teacher,{room:'board-group-'+f.groupId,setId:set.id,x:0,y:0},'POST',201);
    await f.request('/api/lesson-task-runs/'+group.run.id+'/live/helper',f.tokens['student-a'],{cardId:group.run.cards[0].id,assetId:group.run.cards[0].attachments[0].assetId,start:true},'POST',403);
  }finally{await f.stop();}
});
