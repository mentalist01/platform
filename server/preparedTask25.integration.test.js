import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('№25 can save and publish fewer filled rows, pupil must match both values and leave unused rows empty',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base}=f,a=tokens['teacher-a'],s=tokens['student-a'];
  try{
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const image=await(await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form})).json();
    const answers=Array(20).fill('');answers[0]='123';answers[10]='3';answers[1]='456';answers[11]='6';
    const input={name:'25 · Маски',taskNumber:25,tasks:[{title:'1',images:[image.id],answers}]};
    const draft=await request('/api/lesson-task-sets',a,{...input,autosave:true},'POST',201);assert.equal(Boolean(draft.draft),false);
    const set=await request(`/api/lesson-task-sets/${draft.id}`,a,{...input,version:draft.version},'PUT');assert.equal(Boolean(set.draft),false);assert.equal(set.tasks[0].answers.length,20);
    const half=[...answers];half[11]='';await request('/api/lesson-task-sets',a,{...input,tasks:[{...input.tasks[0],answers:half}]},'POST',400);
    await request('/api/lesson-task-sets',a,{...input,taskNumber:17},'POST',400);
    const room=`board-group-${f.groupId}`;let {run}=await request('/api/lesson-task-runs',a,{room,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0];
    const action=async values=>{
      await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'claim',cardId:card.id,leaseKey:'pupil'});
      ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'answer',cardId:card.id,leaseKey:'pupil',revision:card.answerRevision,answers:values}));card=run.cards[0];
      ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'check',cardId:card.id,leaseKey:'pupil',revision:card.answerRevision}));card=run.cards[0];
    };
    await action(half);assert.equal(card.status,'active');assert.equal(card.lastResult,'wrong');
    const extra=[...answers];extra[2]='789';extra[12]='9';await action(extra);assert.equal(card.lastResult,'wrong');
    await action(answers);assert.equal(card.status,'solved');assert.equal(card.lastResult,'correct');
    assert.equal('referenceAnswers' in card,false);
  }finally{await f.stop();}
});
