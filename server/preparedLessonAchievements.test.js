import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';

test('difficulty is explicit per task and immutable in a lesson; failed optional awards retry from the durable solve receipt',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-achievement-retry-')),doc=new Y.Doc();t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const teacher={role:'teacher',id:'t'},student={role:'student',id:'s'},calls=[];
  let failOnce=true;
  const deps={directory,authorize:async auth=>({allowed:true,auth,studentId:'s',participantIds:[]}),board:async()=>doc,sourceFiles:async()=>[],achievementContext:async()=>({participants:[{id:'s',name:'Ученик'}]}),onAchievement:async(run,card)=>{if(failOnce){failOnce=false;throw Error('temporary reward failure');}calls.push(card.solveReceipt);}};
  let store=new PreparedLessonTasks(deps);
  const image=store.putAsset(teacher,Buffer.from('condition'),'condition.png','image/png',{width:600,height:100});
  const set=await store.saveSet(teacher,{name:'Практика',taskNumber:3,tasks:[{images:[image.id],answers:['7'],difficult:true},{images:[image.id],answers:['8']}]});
  assert.equal(set.tasks[1].difficult,false,'Later tasks are not inferred to be difficult');
  const run=await store.start(teacher,{room:'board-s',setId:set.id,x:0,y:0}),card=run.cards[0];
  await store.saveSet(teacher,{...set,tasks:set.tasks.map(task=>({...task,difficult:false}))},set.id);
  const action=input=>store.action(student,run.id,{cardId:card.id,leaseKey:'answer',...input});
  await action({action:'claim'});await action({action:'answer',revision:0,answers:['7']});
  const solved=await action({action:'check',revision:1});assert.equal(solved.cards[0].status,'solved');assert.equal(solved.cards[0].difficult,true);
  const saved=JSON.parse(fs.readFileSync(path.join(directory,'runs',run.id+'.json'),'utf8'));assert.equal(saved.cards[0].achievementPending,true);assert.equal(saved.cards[0].solveReceipt.difficult,true);
  store=new PreparedLessonTasks(deps);await store.recover(store.data.runs[run.id]);assert.equal(calls.length,1);assert.equal(calls[0].participants[0].id,'s');
  await action({action:'check',revision:1});assert.equal(calls.length,1,'A restored/rechecked solved card cannot emit another receipt');
});
