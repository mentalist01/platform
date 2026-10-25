import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {reshapePreparedAnswers} from '../src/utils/preparedAnswerTable.js';

test('table dimensions persist, copy between teachers, appear privately in homework, and validate on the server',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base}=f,a=tokens['teacher-a'],s=tokens['student-a'];
  try{
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const image=await(await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form})).json();
    const answers=['3','9','34471','103413','2','4','77563','155126','2','4','77569','155138','2','4','77573','155146'];
    const input={name:'25 · Таблица',taskNumber:25,tasks:[{title:'1',images:[image.id],answers,answerTable:{rows:4,columns:4}}]};
    const set=await request('/api/lesson-task-sets',a,input,'POST',201);
    assert.deepEqual(set.tasks[0].answerTable,{rows:4,columns:4});
    assert.equal(set.tasks[0].answerCountOverride,16);
    const listing=await request('/api/lesson-task-sets',a);assert.deepEqual(listing.sets.find(row=>row.id===set.id).tasks[0].answers,answers);
    for(const answerTable of [{rows:4,columns:0},{rows:4.5,columns:4},{rows:30,columns:2},{rows:4,columns:3}]){
      await request('/api/lesson-task-sets',a,{...input,tasks:[{...input.tasks[0],answerTable}]},'POST',400);
    }
    const sharing=await request(`/api/lesson-task-sets/${set.id}/sharing`,a,{version:0,recipientIds:['teacher-b']},'PUT');
    const copy=await request(`/api/lesson-task-exchange/${set.id}/copy`,tokens['teacher-b'],{version:sharing.version},'POST',201);
    assert.deepEqual(copy.set.tasks[0].answerTable,{rows:4,columns:4});assert.deepEqual(copy.set.tasks[0].answers,answers);
    const room=`board-group-${f.groupId}`;let {run}=await request('/api/lesson-task-runs',a,{room,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0];
    const pupil=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;
    assert.deepEqual(pupil.cards[0].answerTable,{rows:4,columns:4});assert.equal('referenceAnswers' in pupil.cards[0],false);
    await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'claim',cardId:card.id,leaseKey:'pupil'});
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'answer',cardId:card.id,leaseKey:'pupil',revision:card.answerRevision,answers}));card=run.cards[0];
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'check',cardId:card.id,leaseKey:'pupil',revision:card.answerRevision}));assert.equal(run.cards[0].status,'solved');
    // Homework snapshots clone the whole task, including the matrix layout.
    const basket=await request('/api/prepared-homework/basket',a,{runId:run.id,cardId:card.id},'POST',201);
    assert.ok(basket.goal.preparedId);
    const fs=await import('node:fs'),path=await import('node:path');
    const snapshot=JSON.parse(fs.readFileSync(path.join(f.data,'prepared-homework','snapshot-'+basket.goal.preparedId+'.json')));
    assert.deepEqual(snapshot.task.answerTable,{rows:4,columns:4});
  }finally{await f.stop();}
});

test('updating a legacy table on an open board keeps visible pupil answers and prevents lost cells',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base}=f,a=tokens['teacher-a'];
  try{
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const image=await(await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form})).json();
    const answers=Array(20).fill('');answers[0]='3';answers[10]='9';answers[1]='34471';answers[11]='103413';
    let set=await request('/api/lesson-task-sets',a,{name:'Таблица',taskNumber:25,tasks:[{images:[image.id],answers}]},'POST',201);
    const {run}=await request('/api/lesson-task-runs',a,{room:`board-group-${f.groupId}`,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0];
    await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'claim',cardId:card.id,leaseKey:'teacher'});
    const pupilAnswers=[...answers];pupilAnswers[12]='extra';
    const answered=await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'answer',cardId:card.id,leaseKey:'teacher',revision:0,answers:pupilAnswers});
    const task=reshapePreparedAnswers(set.tasks[0],4,1);
    set=await request(`/api/lesson-task-sets/${set.id}`,a,{...set,version:set.version,tasks:[task]},'PUT');
    const update=(await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),a)).run;
    assert.equal(update.checkingUpdateAvailable,true);
    await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'sync-checking',setVersion:set.version},'POST',409);
    const afterReject=(await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),a)).run;
    assert.deepEqual(afterReject.cards[0].answers,pupilAnswers);
    await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'answer',cardId:card.id,leaseKey:'teacher',revision:answered.run.cards[0].answerRevision,answers});
    const synced=(await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'sync-checking',setVersion:set.version})).run;
    assert.deepEqual(synced.cards[0].answers,['3','9','34471','103413']);assert.deepEqual(synced.cards[0].answerTable,{rows:4,columns:1});
    assert.equal(synced.cards[0].id,card.id);assert.equal(synced.cards[0].codeId,card.codeId);
  }finally{await f.stop();}
});
