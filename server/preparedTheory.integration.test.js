import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('theory images persist through set APIs, display before questions, remain authorized and cannot be checked or assigned as a solved task',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base}=f,a=tokens['teacher-a'],s=tokens['student-a'];
  try{
    const image=async name=>{
      const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:140,channels:4,background:'white'}}).png().toBuffer()]),name);
      const response=await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.ok(response.ok);return response.json();
    };
    const intro=await image('theory.png'),question=await image('question.png');
    const set=await request('/api/lesson-task-sets',a,{name:'17 · Теория и практика',taskNumber:17,theoryImages:[intro.id],tasks:[{images:[question.id],answers:['2','100']}]},'POST',201);
    assert.equal(set.theoryImages.length,1);
    assert.equal((await request('/api/lesson-task-sets',a)).sets.find(row=>row.id===set.id).theoryImageFiles.length,1);
    const room=`board-group-${f.groupId}`;let {run}=await request('/api/lesson-task-runs',a,{room,setId:set.id,x:0,y:0},'POST',201);
    assert.equal(run.cards[0].kind,'theory');assert.equal(run.taskTotal,1);assert.equal(run.cards[0].answerCount,0);
    const pupil=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;assert.equal(pupil.cards[0].kind,'theory');
    const read=await fetch(base+pupil.cards[0].images[0].url,{headers:{Authorization:`Bearer ${s}`}});assert.equal(read.status,200);
    assert.equal((await fetch(base+pupil.cards[0].images[0].url,{headers:{Authorization:`Bearer ${tokens['student-c']}`}})).status,403);
    assert.equal((await fetch(base+`/api/lesson-task-assets/${question.id}?run=${run.id}`,{headers:{Authorization:`Bearer ${s}`}})).status,403);
    await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'check',cardId:run.cards[0].id,revision:0},'POST',400);
    await request('/api/prepared-homework/basket',a,{runId:run.id,cardId:run.cards[0].id},'POST',400);
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'next',expectedCount:1,fromCardId:run.cards[0].id}));
    assert.equal(run.cards[0].status,'reviewed');assert.equal(run.cards[1].kind,'task');assert.equal(run.cards[1].sourceIndex,0);assert.equal(run.cards[1].answerCount,2);
    const after=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;assert.equal(after.cards.length,2);assert.equal('referenceAnswers' in after.cards[1],false);
  }finally{await f.stop();}
});
