import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {configurePreparedGameAnswers} from '../src/utils/preparedAnswerGroups.js';

test('HTTP preserves game structure in sharing and homework, keeps answers private and checks pairs atomically',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base}=f,a=tokens['teacher-a'],s=tokens['student-a'];
  try{
    const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:120,channels:4,background:'white'}}).png().toBuffer()]),'condition.png');
    const image=await(await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form})).json();
    const answerGroups=[{number:19,counts:[1,2]},{number:20,counts:[2]},{number:21,counts:[1]}],answers=['27','12','13','4','11','7'];
    const task={...configurePreparedGameAnswers({answers:[]},answerGroups),images:[image.id],answers};
    const set=await request('/api/lesson-task-sets',a,{name:'19–21',taskNumber:19,tasks:[task]},'POST',201);
    const sharing=await request(`/api/lesson-task-sets/${set.id}/sharing`,a,{version:0,recipientIds:['teacher-b']},'PUT');
    const copy=await request(`/api/lesson-task-exchange/${set.id}/copy`,tokens['teacher-b'],{version:sharing.version},'POST',201);
    assert.deepEqual(copy.set.tasks[0].answerGroups,answerGroups);assert.deepEqual(copy.set.tasks[0].answers,answers);
    let {run}=await request('/api/lesson-task-runs',a,{room:`board-group-${f.groupId}`,setId:set.id,x:0,y:0},'POST',201),card=run.cards[0];
    const pupil=(await request('/api/lesson-task-run?room='+encodeURIComponent(run.room),s)).run;
    assert.deepEqual(pupil.cards[0].answerGroups,answerGroups);assert.equal('referenceAnswers' in pupil.cards[0],false);
    ({run}=await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'answer',cardId:card.id,answerSchema:card.answerSchema,patches:answers.map((value,index)=>({index,value}))}));
    for(const fieldIndex of [0,1,3,5])({run}=await request(`/api/lesson-task-runs/${run.id}/action`,s,{action:'check',cardId:card.id,answerSchema:card.answerSchema,fieldIndex}));
    assert.equal(run.cards[0].status,'solved');assert.equal('referenceAnswers' in run.cards[0],false);
    const basket=await request('/api/prepared-homework/basket',a,{runId:run.id,cardId:card.id},'POST',201);
    const snapshot=JSON.parse(fs.readFileSync(path.join(f.data,'prepared-homework','snapshot-'+basket.goal.preparedId+'.json')));
    assert.deepEqual(snapshot.task.answerGroups,answerGroups);
  }finally{await f.stop();}
});
