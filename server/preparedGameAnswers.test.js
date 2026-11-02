import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {configurePreparedGameAnswers} from '../src/utils/preparedAnswerGroups.js';

const config=(a=[1,2],b=[2],c=[1])=>[a,b,c].map((counts,index)=>({number:19+index,counts}));
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-game-')),doc=new Y.Doc();
  const teacher={id:'teacher',role:'teacher'},pupil={id:'pupil',role:'student'},other={id:'other',role:'student'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor,groupId:'group',participantIds:['pupil','other']}),board:async()=>doc,sourceFiles:async()=>[]};
  const store=new PreparedLessonTasks(deps),image=store.putAsset(teacher,Buffer.from('image'),'condition.png','image/png',{width:600,height:180});
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const task=(answers,layout=config())=>({...configurePreparedGameAnswers({answers:[]},layout),images:[image.id],attachments:[],answers});
  const save=(tasks)=>store.saveSet(teacher,{name:'Игры',taskNumber:19,tasks});
  const answer=(run,patches,auth=pupil)=>store.action(auth,run.id,{action:'answer',cardId:run.cards[0].id,answerSchema:run.cards[0].answerSchema,patches});
  const check=(run,fieldIndex,auth=pupil)=>store.action(auth,run.id,{action:'check',cardId:run.cards[0].id,answerSchema:run.cards[0].answerSchema,fieldIndex});
  return {store,deps,doc,teacher,pupil,other,task,save,answer,check};
}
test('19a, 19b, 20 and 21 check as separate complete answers; only the whole solved block advances',async t=>{
  const f=fixture(t),{store,teacher,pupil,other}=f;
  const key=['27','12','13','4','11','7'],set=await f.save([f.task(key),f.task(key)]);
  let run=await store.start(teacher,{room:'board-group',setId:set.id,x:0,y:0});const first=run.cards[0];
  const view=store.publicRun(store.data.runs[run.id],{auth:pupil});
  assert.deepEqual(view.cards[0].answerGroups,config());assert.equal('referenceAnswers' in view.cards[0],false);
  await store.action(teacher,run.id,{action:'auto',value:true});
  run=await f.answer(run,key.map((value,index)=>({index,value:index===2?'99':value})));
  run=await f.check(run,0);assert.equal(run.cards.length,1);assert.deepEqual(run.cards[0].fieldResults,['correct',null,null,null,null,null]);
  run=await f.check(run,1);assert.deepEqual(run.cards[0].fieldResults,['correct','wrong','wrong',null,null,null]);
  run=await f.answer(run,[{index:2,value:'13'}],other);assert.deepEqual(run.cards[0].fieldResults,['correct',null,null,null,null,null]);
  run=await f.check(run,2,other);assert.deepEqual(run.cards[0].fieldResults,['correct','correct','correct',null,null,null]);
  await assert.rejects(f.answer(run,[{index:1,value:'changed'}]),{status:409});
  run=await f.check(run,3);assert.equal(run.cards[0].status,'active');
  run=await f.check(run,5);assert.equal(run.cards[0].status,'solved');assert.equal(run.cards.length,2);
  run=await f.check(run,5);assert.equal(run.cards.length,2);
  const restarted=new PreparedLessonTasks(f.deps),stored=restarted.data.runs[run.id];
  assert.equal(stored.cards[0].id,first.id);assert.deepEqual(stored.tasks[0].answerGroups,config());assert.equal(stored.cards[0].status,'solved');
});
test('all cells of a subquestion are required, schemas prevent stale writes and invalid structures are rejected',async t=>{
  const f=fixture(t),set=await f.save([f.task(['27','12','13','4','11','7'])]);
  let run=await f.store.start(f.teacher,{room:'board-group',setId:set.id,x:0,y:0});
  run=await f.answer(run,[{index:1,value:'12'}]);await assert.rejects(f.check(run,1),{status:400});
  await assert.rejects(f.check(run,100),{status:400});
  for(const changes of [{answerGroups:config([0])},{answerGroups:config([1])},{answerMode:'combined'},{answerTable:{rows:3,columns:2}},{answerCountOverride:4}]){
    await assert.rejects(f.save([{...f.task(['27','12','13','4','11','7']),...changes}]),{status:400});
  }
  await assert.rejects(f.store.saveSet(f.pupil,{...set}),{status:403});
});
test('live changes preserve later question answers, the condition and code identity; changed keys reset the whole group',async t=>{
  const f=fixture(t),{store,teacher,doc}=f;
  let set=await f.save([f.task(['33','34','101','35'],config([1],[2],[1]))]);
  let run=await store.start(teacher,{room:'board-group',setId:set.id,x:0,y:0});const card=run.cards[0],scene=JSON.stringify(doc.getArray('items').toArray());
  run=await f.answer(run,['33','34','101','35'].map((value,index)=>({index,value})));run=await f.check(run,1);
  set=await store.saveSet(teacher,{...set,tasks:[{...set.tasks[0],answers:['33','34','102','35']}]},set.id);
  run=await store.action(teacher,run.id,{action:'sync-set',setId:set.id,setVersion:set.version});
  assert.deepEqual(run.cards[0].fieldResults,[null,null,null,null]);assert.deepEqual(run.cards[0].answers,['33','34','101','35']);
  const expanded=configurePreparedGameAnswers(set.tasks[0],config([1,2],[2],[1]));expanded.answers[1]='12';expanded.answers[2]='13';
  set=await store.saveSet(teacher,{...set,tasks:[expanded]},set.id);
  run=await store.action(teacher,run.id,{action:'sync-set',setId:set.id,setVersion:set.version});
  assert.deepEqual(run.cards[0].answers,['33','','','34','101','35']);assert.equal(run.cards[0].id,card.id);assert.equal(run.cards[0].codeId,card.codeId);assert.equal(JSON.stringify(doc.getArray('items').toArray()),scene);
  await assert.rejects(store.action(f.pupil,run.id,{action:'answer',cardId:card.id,answerSchema:card.answerSchema,patches:[{index:1,value:'old shape'}]}),{status:409});
});
