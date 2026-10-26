import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('teacher and group pupils edit without claims; separate cells merge, same-cell last write wins, any participant checks the shared result',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(),{tokens,request,base}=f,a=tokens['teacher-a'],s=tokens['student-a'],b=tokens['student-b'];
  try{
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:140,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const upload=await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});const image=await upload.json();
    const set=await request('/api/lesson-task-sets',a,{name:'Общий ввод',taskNumber:17,tasks:[{answers:['12','34'],images:[image.id]}]},'POST',201);
    let {run}=await request('/api/lesson-task-runs',a,{room:`board-group-${f.groupId}`,setId:set.id,x:0,y:0},'POST',201);const card=run.cards[0],schema=card.answerSchema;
    const edit=(token,patches,status=200)=>request(`/api/lesson-task-runs/${run.id}/action`,token,{action:'answer',cardId:card.id,answerSchema:schema,patches},'POST',status);
    const outputs=await Promise.all([edit(s,[{index:0,value:'12'}]),edit(b,[{index:1,value:'34'}])]);assert.ok(outputs.every(value=>value.run.cards[0].lease===null));
    run=(await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),a)).run;assert.deepEqual(run.cards[0].answers,['12','34']);
    await edit(a,[{index:0,value:'99'}]);({run}=await edit(s,[{index:0,value:'12'}]));assert.deepEqual(run.cards[0].answers,['12','34']);
    await edit(tokens['student-c'],[{index:0,value:'hijack'}],403);
    await edit(s,[{index:2,value:'outside'}],400);await edit(s,[{index:0,value:'a'},{index:0,value:'b'}],400);
    await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'answer',cardId:card.id,answerSchema:'stale-grid',patches:[{index:0,value:'stale'}]},'POST',409);
    const checked=await request(`/api/lesson-task-runs/${run.id}/action`,b,{action:'check',cardId:card.id,answerSchema:schema,revision:0});
    assert.equal(checked.run.cards[0].status,'solved');assert.equal('referenceAnswers' in checked.run.cards[0],false);
    await edit(a,[{index:0,value:'overwrite solved'}],409);
  }finally{await f.stop();}
});
