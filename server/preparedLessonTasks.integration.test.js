import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {BLANK_WORKBOOK_ODS} from './blankWorkbook.js';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('authenticated library and group run; teacher saves the group workbook; pupils only download its source and latest saved solution', {timeout:90000}, async()=>{
  const fixture=await createGroupHomeworkFixture();
  const {request,tokens,base,groupId}=fixture;
  const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const [key,value]of Object.entries(fields))form.append(key,String(value));const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${tokens['teacher-a']}`},body:form});const data=await response.json();assert.equal(response.status,route==='/api/files'?200:201,JSON.stringify(data));return data;};
  try {
    const ordinary=await request('/api/lesson-task-run?room='+encodeURIComponent(`board-group-${groupId}`),tokens['teacher-a']);assert.equal(ordinary.run,null,'Existing pages remain ordinary by default');
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:200,channels:4,background:'white'}}).png().toBuffer());
    const source=await upload('/api/files','source.xlsx',Buffer.from('unchanged original workbook'),{studentId:'student-a',taskNumber:3,category:'class'});
    const otherSources=await request('/api/lesson-task-sources',tokens['teacher-b']);assert.equal(otherSources.files.some(f=>f.id===source.id),false,'A different teacher cannot prepare a set from private Notes files');
    const set=await request('/api/lesson-task-sets',tokens['teacher-a'],{name:'Общий разбор',taskNumber:3,partNumber:1,tasks:[{title:'Первая',images:[image.id],format:'exact',answers:['secret-42'],attachments:[{sourceFileId:source.id}]},{title:'Будущее условие',images:[image.id],answers:['another-secret'],format:'exact'}]},'POST',201);
    await request('/api/lesson-task-sets',tokens['student-a'],undefined,'GET',403);
    const room=`board-group-${groupId}`;
    let {run}=await request('/api/lesson-task-runs',tokens['teacher-a'],{room,setId:set.id,x:100,y:100},'POST',201);
    let pupil=await request('/api/lesson-task-run?room='+encodeURIComponent(room),tokens['student-b']);assert.equal(pupil.run.canManage,false);assert.equal(pupil.run.cards.length,1);assert.equal(JSON.stringify(pupil).includes('secret-42'),false);assert.equal(JSON.stringify(pupil).includes('another-secret'),false);
    await request('/api/lesson-task-run?room='+encodeURIComponent(room),tokens['student-c'],undefined,'GET',403);
    const card=run.cards[0],asset=card.attachments[0];
    assert.equal(run.canEditFiles,true);assert.equal(pupil.run.canEditFiles,false);
    await request(`/api/lesson-task-runs/${run.id}/helper`,tokens['student-a'],{cardId:card.id,assetId:asset.assetId},'POST',403);
    await request(`/api/lesson-task-runs/${run.id}/action`,tokens['student-a'],{action:'release-file',cardId:card.id,assetId:asset.assetId},'POST',403);
    const deniedUpload=new FormData();deniedUpload.append('file',new Blob([Buffer.from('pupil overwrite')]),'solution.xlsx');deniedUpload.append('cardId',card.id);deniedUpload.append('assetId',asset.assetId);deniedUpload.append('revision','0');
    assert.equal((await fetch(base+`/api/lesson-task-runs/${run.id}/solution`,{method:'POST',headers:{Authorization:`Bearer ${tokens['student-a']}`},body:deniedUpload})).status,403);
    const pupilSource=await fetch(base+asset.url,{headers:{Authorization:`Bearer ${tokens['student-a']}`}});assert.equal(await pupilSource.text(),'unchanged original workbook');

    const launch=await request(`/api/lesson-task-runs/${run.id}/helper`,tokens['teacher-a'],{cardId:card.id,assetId:asset.assetId},'POST',201);
    await request(`/api/lesson-task-runs/${run.id}/helper`,tokens['student-b'],{cardId:card.id,assetId:asset.assetId},'POST',403);
    const exchange=await request('/workbook-helper/v1/exchange',null,{ticket:launch.ticket});assert.match(exchange.token,/^pt_/);assert.equal(exchange.revision,0);
    const content=await fetch(base+'/workbook-helper/v1/content',{headers:{Authorization:`Workbook ${exchange.token}`}});assert.equal(content.status,200);assert.equal(Buffer.from(await content.arrayBuffer()).toString(),'unchanged original workbook');
    const bytes=Buffer.from('teacher solution'),form=new FormData();form.append('file',new Blob([bytes]),'solution.xlsx');form.append('revision','0');form.append('contentHash',crypto.createHash('sha256').update(bytes).digest('hex'));form.append('solutionName','solution.xlsx');
    const saved=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${exchange.token}`},body:form});const receipt=await saved.json();assert.equal(saved.status,200,JSON.stringify(receipt));assert.equal(receipt.revision,1);
    pupil=await request('/api/lesson-task-run?room='+encodeURIComponent(room),tokens['student-b']);const solution=pupil.run.cards[0].attachments[0].solution;assert.equal(solution.name,'solution.xlsx');
    const notesA=await request('/api/files?studentId=student-a&taskNumber=3&category=class',tokens['teacher-a']),notesB=await request('/api/files?taskNumber=3&category=class',tokens['student-b']);assert.ok(notesA.some(f=>f.id===solution.id));assert.ok(notesB.some(f=>f.id===solution.id));
    assert.equal(notesA.find(f=>f.id===solution.id).workbookReadOnly,false);assert.equal(notesB.find(f=>f.id===solution.id).workbookReadOnly,true);
    await request('/api/workbook-helper/launch',tokens['student-b'],{fileId:solution.id},'POST',403);
    await request('/api/files/'+solution.id,tokens['student-b'],{name:'Changed.xlsx'},'PATCH',404);
    await request('/api/files/'+solution.id,tokens['student-b'],undefined,'DELETE',404);

    const response=await fetch(base+solution.url,{headers:{Authorization:`Bearer ${tokens['student-b']}`}});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    await request(`/api/lesson-task-runs/${run.id}/action`,tokens['teacher-a'],{action:'release-file',cardId:card.id,assetId:asset.assetId});
    const outdated=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${exchange.token}`},body:form});assert.equal(outdated.status,409,'The previous writer cannot overwrite after handing the file over');
    const secondLaunch=await request(`/api/lesson-task-runs/${run.id}/helper`,tokens['teacher-a'],{cardId:card.id,assetId:asset.assetId},'POST',201);
    const secondSession=await request('/workbook-helper/v1/exchange',null,{ticket:secondLaunch.ticket});assert.equal(secondSession.revision,1);
    const form2=new FormData();form2.append('file',new Blob([Buffer.from('second revision')]),'solution.xlsx');form2.append('revision','1');
    const save2=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${secondSession.token}`},body:form2});assert.equal(save2.status,200);assert.equal((await save2.json()).revision,2);
    const conflict=new FormData();conflict.append('file',new Blob([Buffer.from('stale revision')]),'solution.xlsx');conflict.append('revision','1');
    const stale=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${secondSession.token}`},body:conflict});assert.equal(stale.status,409);
    const notesAfter=await request('/api/files?taskNumber=3&category=class',tokens['student-b']);assert.equal(notesAfter.filter(f=>f.id===solution.id).length,1,'Further saves update the same Notes entry');
    const latestDownload=await fetch(base+solution.url,{headers:{Authorization:`Bearer ${tokens['student-b']}`}});assert.equal(await latestDownload.text(),'second revision','A conflicting save never replaces the canonical solution');
    const original=JSON.parse(fs.readFileSync(path.join(fixture.data,'files.json'),'utf8')).find(file=>file.id===source.id);assert.equal(fs.readFileSync(path.join(fixture.root,'uploads',original.storageName),'utf8'),'unchanged original workbook');
    run=(await request(`/api/lesson-task-runs/${run.id}/action`,tokens['teacher-a'],{action:'mode',mode:'plain'})).run;assert.equal(run.cards.length,1);assert.equal(run.mode,'plain');
    run=(await request(`/api/lesson-task-runs/${run.id}/action`,tokens['teacher-a'],{action:'mode',mode:'prepared'})).run;assert.equal(run.cards[0].attachments[0].solution.id,solution.id);
    const input=await upload('/api/files','numbers.txt',Buffer.from('420\n580\n'),{studentId:'student-a',taskNumber:17,category:'class'});
    const pythonSet=await request('/api/lesson-task-sets',tokens['teacher-a'],{name:'Семнадцатое',taskNumber:17,tasks:[{title:'0',images:[image.id],format:'exact',answers:['2 1000'],attachments:[{sourceFileId:input.id,runtime:true,runtimeName:'17.txt'},{sourceFileId:source.id,runtime:false}]},{title:'1',images:[image.id],answers:['3 1500']}]},'POST',201);
    assert.deepEqual(pythonSet.tasks[0].answers,['2','1000'],'Old editor submissions also split into two fields');
    const page=await request('/api/lesson-pages',tokens['teacher-a'],{room,action:'create',name:'№17'});
    const pythonRoom=room+'~page~'+page.id;
    let pythonRun=(await request('/api/lesson-task-runs',tokens['teacher-a'],{room:pythonRoom,setId:pythonSet.id,x:0,y:0},'POST',201)).run;
    const pcard=pythonRun.cards[0];assert.equal(pcard.answerCount,2);assert.equal(pcard.title,'0');assert.equal(pcard.attachments[0].runtimeName,'17.txt');assert.equal(pcard.attachments[1].runtime,false);
    const inputContent=await fetch(base+pcard.attachments[0].url,{headers:{Authorization:`Bearer ${tokens['student-a']}`}});assert.equal(await inputContent.text(),'420\n580\n');
    const action=body=>request(`/api/lesson-task-runs/${pythonRun.id}/action`,tokens['student-a'],{cardId:pcard.id,leaseKey:'python-input',...body});
    await action({action:'claim'});await action({action:'answer',revision:0,answers:['2 1000']}).then(()=>assert.fail('Single-cell input accepted'),e=>assert.match(e.message,/400/));
    await action({action:'answer',revision:0,answers:['1000','2']});assert.equal((await action({action:'check',revision:1})).run.cards[0].status,'active');
    await action({action:'claim'});await action({action:'answer',revision:1,answers:['2','1000']});assert.equal((await action({action:'check',revision:2})).run.cards[0].status,'solved');
    pythonRun=(await request(`/api/lesson-task-runs/${pythonRun.id}/action`,tokens['teacher-a'],{action:'next',expectedCount:1})).run;
    assert.equal(pythonRun.cards[1].title,'1');assert.notEqual(pythonRun.cards[0].codeId,pythonRun.cards[1].codeId,'Every task gets its own code document automatically');
    const extra=await upload('/api/files','extra.txt',Buffer.from('new input'),{studentId:'student-a',taskNumber:17,category:'class'});
    const changed=await request(`/api/lesson-task-sets/${pythonSet.id}`,tokens['teacher-a'],{...pythonSet,tasks:pythonSet.tasks.map((task,index)=>index?task:{...task,answers:['9','9999'],attachments:[...task.attachments,{sourceFileId:extra.id,runtime:true,runtimeName:'extra.txt'}]})},'PUT');
    const runAction=(token,body,status=200)=>request(`/api/lesson-task-runs/${pythonRun.id}/action`,token,body,'POST',status);
    const beforeSync=(await request('/api/lesson-task-run?room='+encodeURIComponent(pythonRoom),tokens['teacher-a'])).run;
    assert.equal(beforeSync.filesUpdateAvailable,true);assert.equal(beforeSync.cards[0].attachments.length,2);
    await runAction(tokens['student-a'],{action:'sync-files',setVersion:changed.version},403);
    await runAction(tokens['teacher-a'],{action:'sync-files',setVersion:changed.version-1},409);
    const synced=(await runAction(tokens['teacher-a'],{action:'sync-files',setVersion:changed.version})).run;
    assert.equal(synced.cards[0].attachments.length,3);assert.equal(synced.cards[0].status,'solved');assert.equal(synced.cards[0].id,pcard.id);assert.deepEqual(synced.cards[0].answers,['2','1000']);assert.equal(synced.filesUpdateAvailable,false);
    assert.equal(synced.cards[0].attachments[0].runtimeName,'17.txt');
    const storedRun=JSON.parse(fs.readFileSync(path.join(fixture.data,'prepared-lesson-tasks','runs',pythonRun.id+'.json'),'utf8'));assert.deepEqual(storedRun.tasks[0].answers,['2','1000'],'Sync never rewrites the lesson reference answer');
    const addedDownload=await fetch(base+synced.cards[0].attachments[2].url,{headers:{Authorization:`Bearer ${tokens['student-b']}`}});assert.equal(await addedDownload.text(),'new input');
    const repeated=(await runAction(tokens['teacher-a'],{action:'sync-files',setVersion:changed.version})).run;assert.equal(repeated.cards[0].attachments.length,3);
    await request(`/api/lesson-task-sets/${pythonSet.id}`,tokens['teacher-a'],pythonSet,'PUT',409);
  } finally {await fixture.stop();}
});

test('prepared 26/27 text opens a blank workbook plus immutable source through the installed helper', {timeout:60000}, async()=>{
  const f=await createGroupHomeworkFixture(),{base,tokens,request}=f;
  const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const[k,v]of Object.entries(fields))form.append(k,String(v));const r=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${tokens['teacher-a']}`},body:form});assert.ok(r.ok,await r.clone().text());return r.json();};
  try{
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:150,channels:4,background:'white'}}).png().toBuffer());
    for(const [taskNumber,ext] of [[26,'txt'],[27,'csv'],[26,'tsv']]){
      const bytes=Buffer.from('100 4\n80\n30\n50\n40\n'),source=await upload('/api/files',`26_1.${ext}`,bytes,{studentId:'student-a',taskNumber,category:'class'});
      const set=await request('/api/lesson-task-sets',tokens['teacher-a'],{name:'Text workbook',taskNumber,tasks:[{images:[image.id],answers:['2','50'],answerCountOverride:2,format:'fields',attachments:[{sourceFileId:source.id}]}]},'POST',201);
      const page=await request('/api/lesson-pages',tokens['teacher-a'],{room:`board-group-${f.groupId}`,action:'create',name:'Text '+ext});
      const {run}=await request('/api/lesson-task-runs',tokens['teacher-a'],{room:`board-group-${f.groupId}~page~${page.id}`,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0],asset=card.attachments[0];
      assert.equal(asset.helper,true);assert.equal(asset.helperText,true);
      const expanded=await request(`/api/lesson-task-sets/${set.id}`,tokens['teacher-a'],{...set,tasks:[...set.tasks,...Array.from({length:5},(_,i)=>({...set.tasks[0],id:undefined,title:String(i+2),answers:['9','99']}))]},'PUT');
      assert.equal((await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),tokens['teacher-a'])).run.newTasksAvailable,5);
      const sync=(token,version,status=200)=>request(`/api/lesson-task-runs/${run.id}/action`,token,{action:'sync-queue',setVersion:version},'POST',status);
      await sync(tokens['student-a'],expanded.version,403);await sync(tokens['teacher-a'],set.version,409);
      const extended=(await sync(tokens['teacher-a'],expanded.version)).run;assert.equal(extended.total,6);assert.equal(extended.cards.length,1);assert.equal(extended.cards[0].id,card.id);assert.equal(extended.cards[0].codeId,card.codeId);assert.equal(extended.cards[0].attachments[0].assetId,asset.assetId);assert.equal(extended.newTasksAvailable,0);
      assert.equal((await sync(tokens['teacher-a'],expanded.version)).run.total,6,'Repeated connection never duplicates tasks');
      const advanced=(await request(`/api/lesson-task-runs/${run.id}/action`,tokens['teacher-a'],{action:'skip',expectedCount:1})).run;assert.equal(advanced.cards[1].title,'2');
      const launch=await request(`/api/lesson-task-runs/${run.id}/helper`,tokens['teacher-a'],{cardId:card.id,assetId:asset.assetId},'POST',201);
      await request(`/api/lesson-task-runs/${run.id}/helper`,tokens['student-b'],{cardId:card.id,assetId:asset.assetId},'POST',403);
      const old=await fetch(base+'/workbook-helper/v1/exchange',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'IvanEgeWorkbookHelper/1.1.0'},body:JSON.stringify({ticket:launch.ticket})});assert.equal(old.status,426);
      const grant=await request('/workbook-helper/v1/exchange',null,{ticket:launch.ticket});assert.match(grant.fileName,/\.ods$/);assert.equal(grant.sourceText.fileName,`26_1.${ext}`);assert.equal(grant.contentHash,crypto.createHash('sha256').update(BLANK_WORKBOOK_ODS).digest('hex'));
      const headers={Authorization:`Workbook ${grant.token}`};
      const original=await fetch(base+'/workbook-helper/v1/source-text',{headers});assert.equal(original.status,200);assert.equal(original.headers.get('X-Source-Text-Content-Hash'),grant.sourceText.contentHash);assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes);
      const empty=await fetch(base+'/workbook-helper/v1/content',{headers});assert.deepEqual(Buffer.from(await empty.arrayBuffer()),BLANK_WORKBOOK_ODS);
      const uploadSolution=async(name,revision)=>{const form=new FormData();form.append('file',new Blob([Buffer.from('saved calculation')]),name);form.append('revision',String(revision));return fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers,body:form});};
      assert.equal((await uploadSolution('source.txt',0)).status,415,'Text cannot replace the workbook solution');
      const saved=await uploadSolution('calculation.ods',0);assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
      const next=(await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),tokens['student-b'])).run.cards[0].attachments[0];assert.equal(next.solution.name,'calculation.ods');
      const notes=await request(`/api/files?taskNumber=${taskNumber}&category=class`,tokens['student-b']);assert.ok(notes.some(file=>file.id===next.solution.id));
      const raw=await fetch(base+'/workbook-helper/v1/source-text',{headers});assert.deepEqual(Buffer.from(await raw.arrayBuffer()),bytes,'Source text remains intact after Ctrl+S');
      assert.equal((await fetch(base+'/workbook-helper/v1/source-text',{headers:{Authorization:'Workbook pt_invalid'}})).status,401);
    }
  }finally{await f.stop();}
});
