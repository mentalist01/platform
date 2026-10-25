import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import WebSocket from 'ws';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('lesson awards follow complete server checks, live attendance and teacher confirmation without leaking answers or paying twice',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base,groupId}=f;
  let socket;
  const own=who=>request('/api/student-achievements',tokens[who]);
  try{
    const protectedNames=['teachers','students','teacher-finances','learning-assignments'];
    const protectedFiles=new Map(protectedNames.filter(name=>fs.existsSync(path.join(f.data,name+'.json'))).map(name=>[name,fs.readFileSync(path.join(f.data,name+'.json'),'utf8')]));
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const response=await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${tokens['teacher-a']}`},body:form});assert.equal(response.status,201);const image=await response.json();
    const fileForm=new FormData();fileForm.append('file',new Blob([Buffer.from('source workbook')]),'22.xlsx');for(const [key,value]of Object.entries({studentId:'student-a',taskNumber:22,category:'class'}))fileForm.append(key,String(value));
    const fileResponse=await fetch(base+'/api/files',{method:'POST',headers:{Authorization:`Bearer ${tokens['teacher-a']}`},body:fileForm});assert.equal(fileResponse.status,200);const source=await fileResponse.json();
    const set=await request('/api/lesson-task-sets',tokens['teacher-a'],{name:'Сложные вопросы',taskNumber:22,tasks:[{title:'1',difficult:true,answerMode:'independent',answerCountOverride:2,images:[image.id],answers:['secret-one','secret-two'],attachments:[{sourceFileId:source.id}]}]},'POST',201);
    assert.equal(set.tasks[0].difficult,true);
    const room=`board-group-${groupId}`,{run}=await request('/api/lesson-task-runs',tokens['teacher-a'],{room,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0];
    socket=new WebSocket(`${base.replace('http','ws')}/collab/${room}~pages?_auth=${encodeURIComponent(tokens['student-a'])}`);
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    const act=(body,who='teacher-a',status=200)=>request(`/api/lesson-task-runs/${run.id}/action`,tokens[who],{cardId:card.id,leaseKey:'teacher-check',...body},'POST',status);
    await act({action:'confirm-independent',studentId:'student-a'},'student-a',403);
    await act({action:'confirm-independent',studentId:'student-a'},'teacher-a',409);
    await act({action:'claim'});await act({action:'answer',revision:0,answers:['secret-one','wrong']});
    await act({action:'check',revision:1,fieldIndex:0});
    assert.equal((await own('student-a')).items.find(item=>item.id==='lesson-solves-1').unlocked,false);
    await act({action:'claim'});await act({action:'check',revision:1,fieldIndex:1});
    assert.equal((await own('student-a')).items.find(item=>item.id==='lesson-solves-1').unlocked,false);
    await act({action:'claim'});await act({action:'answer',revision:1,answers:['secret-one','secret-two']});
    const completed=await act({action:'check',revision:2,fieldIndex:1});assert.equal(completed.run.cards[0].status,'solved');
    assert.deepEqual(completed.run.cards[0].achievementParticipants.map(p=>p.id),['student-a']);
    let achievements=await own('student-a');const first=achievements.items.find(item=>item.id==='lesson-solves-1');assert.equal(first.unlocked,true);assert.equal(first.historical,false);assert.equal(first.xpReward,150);
    assert.equal(achievements.items.find(item=>item.id==='lesson-difficult').value,1);
    assert.equal(achievements.items.find(item=>item.id==='lesson-tables').value,0);
    const asset=card.attachments[0],launch=await request(`/api/lesson-task-runs/${run.id}/helper`,tokens['teacher-a'],{cardId:card.id,assetId:asset.assetId},'POST',201);
    const grant=await request('/workbook-helper/v1/exchange',null,{ticket:launch.ticket});
    const savedForm=new FormData();savedForm.append('file',new Blob([Buffer.from('teacher calculation')]),'solution.xlsx');savedForm.append('revision','0');
    const saved=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${grant.token}`},body:savedForm});assert.equal(saved.status,200);
    assert.equal((await own('student-a')).items.find(item=>item.id==='lesson-tables').value,1,'Ctrl+S after checking supplies evidence without another solve');
    assert.equal((await own('student-b')).items.find(item=>item.id==='lesson-solves-1').unlocked,false,'Absent enrolled pupil is not credited');
    const ledgerFiles=fs.readdirSync(path.join(f.data,'lesson-achievements'));assert.equal(ledgerFiles.length,1);
    const ledger=JSON.parse(fs.readFileSync(path.join(f.data,'lesson-achievements',ledgerFiles[0]),'utf8'));assert.equal(ledger.events.length,1);assert.equal(ledger.events[0].difficult,true);
    const pupil=await request('/api/lesson-task-run?room='+encodeURIComponent(room),tokens['student-a']);assert.equal('achievementParticipants' in pupil.run.cards[0],false);assert.equal('referenceAnswers' in pupil.run.cards[0],false);
    await act({action:'confirm-independent',studentId:'student-b'},'teacher-a',409);
    const confirmed=await act({action:'confirm-independent',studentId:'student-a'});assert.equal(confirmed.run.cards[0].achievementParticipants[0].independent,true);
    const xp=achievements.xpTotal;await act({action:'check',revision:2,fieldIndex:1});await act({action:'confirm-independent',studentId:'student-a'});
    assert.equal((await own('student-a')).xpTotal,xp);
    const claimed=await request('/api/student-achievements/claim',tokens['student-a'],{});assert.equal(claimed.items.filter(item=>item.id==='lesson-solves-1').length,1);assert.equal((await request('/api/student-achievements/claim',tokens['student-a'],{})).items.length,0);
    // A copied set with a new task ID and the same condition has the same content identity.
    const copy=await request('/api/lesson-task-sets',tokens['teacher-a'],{...set,id:undefined,version:undefined,tasks:set.tasks.map(task=>({...task,id:undefined}))},'POST',201);
    const page=await request('/api/lesson-pages',tokens['teacher-a'],{room,action:'create',name:'Копия'});
    const copyRun=(await request('/api/lesson-task-runs',tokens['teacher-a'],{room:room+'~page~'+page.id,setId:copy.id,x:0,y:0},'POST',201)).run;
    const body={cardId:copyRun.cards[0].id,leaseKey:'copy'};
    await request(`/api/lesson-task-runs/${copyRun.id}/action`,tokens['teacher-a'],{...body,action:'claim'});
    await request(`/api/lesson-task-runs/${copyRun.id}/action`,tokens['teacher-a'],{...body,action:'answer',revision:0,answers:['secret-one','secret-two']});
    for(const fieldIndex of [0,1]){await request(`/api/lesson-task-runs/${copyRun.id}/action`,tokens['teacher-a'],{...body,action:'claim'});await request(`/api/lesson-task-runs/${copyRun.id}/action`,tokens['teacher-a'],{...body,action:'check',revision:1,fieldIndex});}
    achievements=await own('student-a');assert.equal(achievements.items.find(item=>item.id==='lesson-solves-10').value,1);assert.equal(achievements.xpTotal,xp);
    for(const [name,bytes]of protectedFiles)assert.equal(fs.readFileSync(path.join(f.data,name+'.json'),'utf8'),bytes,name+' must stay unchanged');
    await request('/api/student-achievements?studentId=student-a',tokens['teacher-b'],undefined,'GET',403);
  }finally{socket?.terminate();await f.stop();}
});
