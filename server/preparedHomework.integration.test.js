import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {BLANK_WORKBOOK_ODS} from './blankWorkbook.js';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('lesson card becomes a required group homework with private code, files, verified completion and preserved source',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base,groupId}=f,a=tokens['teacher-a'],p=tokens['student-a'],q=tokens['student-b'];
  const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const [key,value]of Object.entries(fields))form.append(key,value);const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(response.ok,await response.clone().text());return response.json();};
  try{
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer());
    const file=await upload('/api/files','17.txt',Buffer.from('41\n59\n'),{studentId:'student-a',taskNumber:'17',category:'class'});
    const set=await request('/api/lesson-task-sets',a,{name:'17',taskNumber:17,tasks:[{title:'5',images:[image.id],answers:['2','100'],attachments:[{sourceFileId:file.id,runtime:true,runtimeName:'17.txt'}]}]},'POST',201);
    const {run}=await request('/api/lesson-task-runs',a,{room:`board-group-${groupId}`,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0];
    await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'claim-code',cardId:card.id,leaseKey:'seed'});
    await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'code',cardId:card.id,leaseKey:'seed',revision:0,code:"f=open('17.txt')\n",input:'started'});
    await request('/api/prepared-homework/basket',p,{runId:run.id,cardId:card.id},'POST',403);
    const {goal}=await request('/api/prepared-homework/basket',a,{runId:run.id,cardId:card.id},'POST',201);
    await request(`/api/prepared-homework/${goal.preparedId}/open`,p,{},'POST',404);
    const dueAt=new Date(Date.now()+86400000).toISOString();
    await request('/api/student-next-lesson',a,{studentId:'student-a',dueAt,goals:[goal]},'PATCH',404,'A group snapshot is not silently assigned to an unrelated individual context');
    const {assignment}=await request(`/api/learning-groups/${groupId}/assignments`,a,{title:'Дорешать с урока',content:'',dueAt,status:'published',homework:{goals:[goal],dueAt}},'POST',201);
    assert.equal(assignment.homework.goals[0].type,'prepared');
    assert.equal((await request(`/api/prepared-homework/basket?groupId=${groupId}`,a)).goals.length,0);
    const own=await request(`/api/prepared-homework/${goal.preparedId}/open`,p,{}),other=await request(`/api/prepared-homework/${goal.preparedId}/open`,q,{});
    assert.notEqual(own.run.id,other.run.id);assert.equal(own.workspace.code.code,"f=open('17.txt')\n");assert.equal(own.run.groupId,'');assert.equal(own.run.canEditFiles,true);
    assert.equal('referenceAnswers' in own.run.cards[0],false);
    const code={...own.workspace.code,code:'print(100)'};
    await request(`/api/prepared-homework/${goal.preparedId}/workspace`,p,{revision:0,code,board:own.workspace.board},'PUT');
    await request(`/api/prepared-homework/${goal.preparedId}/workspace`,p,{revision:0,code:{code:'stale'},board:own.workspace.board},'PUT',409);
    assert.equal((await request(`/api/prepared-homework/${goal.preparedId}/open`,q,{})).workspace.code.code,"f=open('17.txt')\n");
    const privateFile=own.run.cards[0].attachments[0];assert.equal(await(await fetch(base+privateFile.url,{headers:{Authorization:`Bearer ${p}`}})).text(),'41\n59\n');
    await request('/api/lesson-task-run?room='+encodeURIComponent(own.run.room),q,undefined,'GET',403);
    const act=body=>request(`/api/lesson-task-runs/${own.run.id}/action`,p,{cardId:own.run.cards[0].id,leaseKey:'answer',...body});
    await act({action:'claim'});await act({action:'answer',revision:0,answers:['1','2']});await act({action:'check',revision:1});
    let homework=(await request('/api/student-next-lesson',p)).homeworks.find(row=>row.learningAssignmentId===assignment.id);assert.equal(homework.goals[0].preparedResult.completedAt,null);
    await act({action:'claim'});await act({action:'answer',revision:1,answers:['2','100']});await act({action:'check',revision:2});
    homework=(await request('/api/student-next-lesson',p)).homeworks.find(row=>row.learningAssignmentId===assignment.id);assert.ok(homework.goals[0].preparedResult.completedAt);
    const otherHomework=(await request('/api/student-next-lesson',q)).homeworks.find(row=>row.learningAssignmentId===assignment.id);assert.equal(otherHomework.goals[0].preparedResult.completedAt,null);
    const review=await request(`/api/learning-groups/${groupId}/assignments/${assignment.id}/homework-review/student-a`,a);assert.equal(review.summary.completed,1);assert.equal(review.items.length,0);assert.equal(review.preparedGoals[0].preparedId,goal.preparedId);
    const source=(await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),a)).run;assert.equal(source.cards[0].status,'active');assert.deepEqual(source.cards[0].answers,['','']);
    assert.equal(fs.readdirSync(path.join(f.data,'lesson-achievements')).length,0,'Homework completion never pretends to be a live lesson solve');
  }finally{await f.stop();}
});


test('individual homework preserves teacher acceptance and private workbook saves; group deadlines and selected recipients are enforced',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,write=>write('students',['a','b','c','d'].map(id=>({id:'student-'+id,name:id,code:'student-'+id+'-code',teacherId:id==='c'?'teacher-b':'teacher-a',grade:'11'})))),{request,tokens,base,groupId}=f,a=tokens['teacher-a'],gp=tokens['student-a'],p=(await request('/api/login',null,{code:'student-d-code'})).token,q=tokens['student-b'];
  const upload=async(route,name,bytes,fields={})=>{const form=new FormData();form.append('file',new Blob([bytes]),name);for(const [key,value]of Object.entries(fields))form.append(key,value);const r=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(r.ok,await r.clone().text());return r.json();};
  const saveHelper=async(token,revision,bytes)=>{const form=new FormData();form.append('file',new Blob([bytes]),'solution.ods');form.append('revision',String(revision));const r=await fetch(base+'/workbook-helper/v1/content',{method:'PUT',headers:{Authorization:`Workbook ${token}`},body:form});assert.ok(r.ok,await r.clone().text());return r.json();};
  const future=new Date(Date.now()+86400000).toISOString();
  try{
    const image=await upload('/api/lesson-task-images','condition.png',await sharp({create:{width:600,height:100,channels:4,background:'white'}}).png().toBuffer()),file=await upload('/api/files','26.txt',Buffer.from('100 4\n80\n30\n50\n40'),{studentId:'student-d',taskNumber:'26',category:'class'});
    const set=await request('/api/lesson-task-sets',a,{name:'26',taskNumber:26,tasks:[{title:'6',images:[image.id],format:'manual',answerCountOverride:1,answers:[''],attachments:[{sourceFileId:file.id}]}]},'POST',201);
    const {run}=await request('/api/lesson-task-runs',a,{room:'board-teacher-a-student-d',setId:set.id,x:0,y:0},'POST',201),card=run.cards[0],asset=card.attachments[0];
    const launch=await request(`/api/lesson-task-runs/${run.id}/helper`,a,{cardId:card.id,assetId:asset.assetId},'POST',201),grant=await request('/workbook-helper/v1/exchange',null,{ticket:launch.ticket});
    await saveHelper(grant.token,0,Buffer.from('started in lesson'));
    const {goal}=await request('/api/prepared-homework/basket',a,{runId:run.id,cardId:card.id},'POST',201);
    await request('/api/student-next-lesson',a,{studentId:'student-d',dueAt:future,goals:[{...goal,preparedResult:{completedAt:new Date().toISOString()}}]},'PATCH');
    const data=await request('/api/student-next-lesson',p),entry=data.homeworks.find(row=>row.goals.some(g=>g.preparedId===goal.preparedId));assert.equal(entry.goals[0].preparedResult.completedAt,null);
    assert.equal((await request('/api/prepared-homework/basket?studentId=student-d',a)).goals.length,0);
    const own=await request(`/api/prepared-homework/${goal.preparedId}/open`,p,{}),otherTeacher=tokens['teacher-b'];
    await request(`/api/prepared-homework/${goal.preparedId}/open`,q,{},'POST',404);await request(`/api/prepared-homework/${goal.preparedId}/open`,otherTeacher,{studentId:'student-d'},'POST',404);
    const seeded=own.run.cards[0].attachments[0].solution;assert.equal(await(await fetch(base+seeded.url,{headers:{Authorization:`Bearer ${p}`}})).text(),'started in lesson');
    const privateLaunch=await request(`/api/lesson-task-runs/${own.run.id}/helper`,p,{cardId:own.run.cards[0].id,assetId:asset.assetId},'POST',201),privateGrant=await request('/workbook-helper/v1/exchange',null,{ticket:privateLaunch.ticket});
    assert.equal(privateGrant.revision,0);assert.equal(await(await fetch(base+'/workbook-helper/v1/content',{headers:{Authorization:`Workbook ${privateGrant.token}`}})).text(),'started in lesson');
    await saveHelper(privateGrant.token,0,Buffer.from('private pupil solution'));
    const updated=(await request(`/api/prepared-homework/${goal.preparedId}/open`,p,{})).run.cards[0].attachments[0].solution;assert.notEqual(updated.id,card.attachments[0].solution?.id);
    const notes=await request('/api/files?taskNumber=26&category=class',p);assert.ok(notes.some(row=>row.id===updated.id));assert.equal((await request('/api/files?taskNumber=26&category=class',q)).some(row=>row.id===updated.id),false);
    const source=(await request('/api/lesson-task-run?room=board-teacher-a-student-d',a)).run.cards[0].attachments[0].solution;assert.equal(await(await fetch(base+source.url,{headers:{Authorization:`Bearer ${a}`}})).text(),'started in lesson');
    const act=(token,body,status=200)=>request(`/api/lesson-task-runs/${own.run.id}/action`,token,{cardId:own.run.cards[0].id,leaseKey:'manual',...body},'POST',status);
    await act(p,{action:'claim'});await act(p,{action:'answer',revision:0,answers:['my answer']});await act(p,{action:'check',revision:1,accept:true},409);await act(p,{action:'release'});await act(a,{action:'claim'});await act(a,{action:'check',revision:1,accept:true});assert.ok((await request('/api/student-next-lesson',p)).homeworks.find(row=>row.id===entry.id).goals[0].preparedResult.completedAt);

    const {run:groupRun}=await request('/api/lesson-task-runs',a,{room:`board-group-${groupId}`,setId:set.id,x:0,y:0},'POST',201),queued=await request('/api/prepared-homework/basket',a,{runId:groupRun.id,cardId:groupRun.cards[0].id},'POST',201);
    const route=`/api/learning-groups/${groupId}/assignments`,assignment=(await request(route,a,{title:'Личное ДЗ',dueAt:future,status:'draft',recipientMode:'selected',recipientIds:['student-a'],homework:{goals:[queued.goal],dueAt:future}},'POST',201)).assignment;
    await request(`/api/prepared-homework/${queued.goal.preparedId}/open`,gp,{},'POST',404);assert.equal((await request(`/api/prepared-homework/basket?groupId=${groupId}`,a)).goals.length,1);
    await request(`${route}/${assignment.id}`,a,{status:'assigned'},'PATCH');
    const personal=await request(`/api/prepared-homework/${queued.goal.preparedId}/open`,gp,{});await request(`/api/prepared-homework/${queued.goal.preparedId}/open`,q,{},'POST',404);
    const groupGrant=await request('/workbook-helper/v1/exchange',null,{ticket:(await request(`/api/lesson-task-runs/${personal.run.id}/helper`,gp,{cardId:personal.run.cards[0].id,assetId:asset.assetId},'POST',201)).ticket});assert.deepEqual(Buffer.from(await(await fetch(base+'/workbook-helper/v1/content',{headers:{Authorization:`Workbook ${groupGrant.token}`}})).arrayBuffer()),BLANK_WORKBOOK_ODS);
    await request(`${route}/${assignment.id}`,a,{dueAt:new Date(Date.now()-60000).toISOString(),homework:{...assignment.homework,dueAt:new Date(Date.now()-60000).toISOString()}},'PATCH');
    const closed=await request(`/api/prepared-homework/${queued.goal.preparedId}/open`,gp,{});assert.equal(closed.readOnly,true);
    await request(`/api/prepared-homework/${queued.goal.preparedId}/workspace`,gp,{revision:0,code:personal.workspace.code,board:personal.workspace.board},'PUT',403);
    await request(`/api/lesson-task-runs/${personal.run.id}/action`,gp,{cardId:personal.run.cards[0].id,leaseKey:'late',action:'claim'},'POST',403);
    assert.equal((await fetch(base+'/workbook-helper/v1/content',{headers:{Authorization:`Workbook ${groupGrant.token}`}})).status,403);
    await request(`${route}/${assignment.id}`,a,{dueAt:future,homework:{...assignment.homework,dueAt:future}},'PATCH');assert.equal((await request(`/api/prepared-homework/${queued.goal.preparedId}/open`,gp,{})).readOnly,false);
  }finally{await f.stop();}
});
