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
    const intro=await image('theory.png'),second=await image('theory-2.png'),third=await image('theory-3.png'),question=await image('question.png');
    const theoryDisplay={[intro.id]:{scalePercent:150},[second.id]:{scalePercent:50,relativeTo:intro.id,placement:'right',focus:'pair'},[third.id]:{scalePercent:150,relativeTo:intro.id,placement:'below'}};
    const set=await request('/api/lesson-task-sets',a,{name:'17 · Теория и практика',taskNumber:17,theoryImages:[intro.id,second.id,third.id],theoryMode:'steps',theoryDisplay,tasks:[{images:[question.id],answers:['2','100']}]},'POST',201);
    assert.equal(set.theoryImages.length,3);assert.equal(set.theoryMode,'steps');
    assert.equal((await request('/api/lesson-task-sets',a)).sets.find(row=>row.id===set.id).theoryImageFiles.length,3);
    const room=`board-group-${f.groupId}`;let {run}=await request('/api/lesson-task-runs',a,{room,setId:set.id,x:0,y:0},'POST',201);
    assert.equal(run.cards[0].kind,'theory');assert.equal(run.taskTotal,1);assert.equal(run.cards[0].answerCount,0);
    assert.equal(set.theoryDisplay[second.id].relativeTo,intro.id);assert.equal(run.cards[0].theoryDisplay.scalePercent,150);assert.equal(run.cards[0].nextTheoryPlacement,'right');
    const pupil=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;assert.equal(pupil.cards[0].kind,'theory');
    const read=await fetch(base+pupil.cards[0].images[0].url,{headers:{Authorization:`Bearer ${s}`}});assert.equal(read.status,200);
    assert.equal((await fetch(base+pupil.cards[0].images[0].url,{headers:{Authorization:`Bearer ${tokens['student-c']}`}})).status,403);
    assert.equal((await fetch(base+`/api/lesson-task-assets/${question.id}?run=${run.id}`,{headers:{Authorization:`Bearer ${s}`}})).status,403);
    await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'check',cardId:run.cards[0].id,revision:0},'POST',400);
    await request('/api/prepared-homework/basket',a,{runId:run.id,cardId:run.cards[0].id},'POST',400);
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'next',expectedCount:1,fromCardId:run.cards[0].id}));
    assert.equal(run.cards[0].status,'reviewed');assert.equal(run.cards[1].kind,'theory');assert.deepEqual(run.cards[1].theoryStep,{index:1,count:3});
    assert.equal(run.cards[1].theoryDisplay.scalePercent,50);assert.equal(run.cards[1].previousTheoryCardId,run.cards[0].id);assert.equal(run.cards[1].nextTheoryPlacement,'below');
    await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'theory-next',cardId:run.cards[1].id},'POST',403);
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'theory-next',cardId:run.cards[1].id}));
    assert.equal(run.cards[2].kind,'theory');
    assert.equal(run.cards[2].previousTheoryCardId,run.cards[0].id);
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,a,{action:'theory-next',cardId:run.cards[2].id}));
    assert.equal(run.cards[3].kind,'task');assert.equal(run.cards[3].sourceIndex,0);assert.equal(run.cards[3].answerCount,2);
    const after=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;assert.equal(after.cards.length,4);assert.equal('referenceAnswers' in after.cards[3],false);assert.equal(after.canManage,false);assert.deepEqual(after.theoryFocus,run.theoryFocus);assert.equal(after.theoryFocus.cardId,run.cards[3].id);
  }finally{await f.stop();}
});
