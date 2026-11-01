import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {promotePreparedReference} from './preparedReferencePromotion.js';
import {preparedReferenceAsset} from './preparedReferenceSolutions.js';

const teacher={id:'t',role:'teacher',name:'Teacher'},pupil={id:'p',role:'student',name:'Pupil'},other={id:'x',role:'teacher'};
async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'reference-promotion-')),doc=new Y.Doc();
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const deps={directory,sourceFiles:async()=>[],board:async()=>doc,code:async()=>doc,authorize:async(auth)=>({allowed:auth.id!==other.id,auth,studentId:'p',participantIds:['p']})};
  const store=new PreparedLessonTasks(deps),image=store.putAsset(teacher,Buffer.from('png'),'condition.png','image/png',{width:600,height:200}),input=store.putAsset(teacher,Buffer.from('source'),'input.xlsx','application/octet-stream');
  const set=await store.saveSet(teacher,{name:'9 · Таблицы',taskNumber:9,tasks:[{title:'1',images:[image.id],answers:['42'],attachments:[{assetId:input.id}]}]});
  const run=await store.start(teacher,{room:'board-teacher-p',setId:set.id,x:0,y:0}),raw=store.data.runs[run.id],card=raw.cards[0];
  const save=async(bytes='saved-v1')=>{
    await store.startHelper(pupil,run.id,card.id,input.id);
    return store.saveSolution({auth:pupil,run:raw,card,assetId:input.id,generation:card.bindings[input.id].generation,buffer:Buffer.from(bytes),name:'Решение.xlsx',revision:card.solutions[input.id]?.revision||0,viaHelper:true});
  };
  const solve=async()=>{let view=store.publicRun(raw,{auth:pupil});view=await store.action(pupil,run.id,{action:'answer',cardId:card.id,revision:view.cards[0].answerRevision,answers:['42']});return store.action(pupil,run.id,{action:'check',cardId:card.id,revision:view.cards[0].answerRevision});};
  const view=(auth=teacher)=>store.publicRun(raw,{auth}).cards[0];
  const attach=()=>{const file=view().referencePromotion.files[0];return store.lock(()=>promotePreparedReference(store,teacher,run.id,card.id,{action:'attach',assetId:file.assetId,solutionId:file.id,revision:file.revision}));};
  return {store,set,raw,card,input,doc,deps,directory,save,solve,view,attach};
}

test('teacher confirmation publishes an immutable saved helper copy to the exact library task and other runs',async t=>{
  const f=await fixture(t),{store,raw,card,set,doc}=f;
  const another=await store.start(teacher,{room:'board-second-pupil',setId:set.id,x:10,y:10});
  await f.save();assert.equal(f.view().referencePromotion,null,'No offer before a correct answer');
  await f.solve();assert.equal('referencePromotion' in f.view(pupil),false);
  assert.equal(store.data.sets[set.id].tasks[0].referenceSolutions,undefined,'Correctness alone never publishes a pupil file');
  const before=JSON.stringify(doc.getArray('items').toArray()),answerRevision=card.answerRevision;
  const result=await f.attach();assert.equal(result.attached,true);
  assert.equal(card.answerRevision,answerRevision);assert.equal(JSON.stringify(doc.getArray('items').toArray()),before);
  const ref=store.data.sets[set.id].tasks[0].referenceSolutions[0];
  assert.equal(fs.readFileSync(store.assetFile(store.data.assets[ref.assetId]),'utf8'),'saved-v1');
  assert.equal(f.view().referencePromotion,null);assert.equal(f.view(pupil).referenceSolution.available,true);
  const peerCard=store.publicRun(store.data.runs[another.id],{auth:pupil}).cards[0];
  assert.deepEqual(peerCard.referenceSolution,{available:false,files:[]});
  await assert.rejects(preparedReferenceAsset(store,pupil,another.id,peerCard.id,ref.assetId),{status:403});
  await f.save('saved-v2');assert.equal(fs.readFileSync(store.assetFile(store.data.assets[ref.assetId]),'utf8'),'saved-v1','Later Ctrl+S cannot change a published reference');
  const restarted=new PreparedLessonTasks(f.deps);
  assert.equal(restarted.publicRun(restarted.data.runs[raw.id],{auth:pupil}).cards[0].referenceSolution.files[0].id,ref.assetId);
  assert.equal(restarted.data.sets[set.id].version,set.version);
});

test('pupils, other teachers and stale confirmation cannot publish; existing references are never replaced',async t=>{
  const f=await fixture(t);await f.save();await f.solve();
  const file=f.view().referencePromotion.files[0],input={action:'attach',assetId:file.assetId,solutionId:file.id,revision:file.revision};
  for(const actor of [pupil,other])await assert.rejects(promotePreparedReference(f.store,actor,f.raw.id,f.card.id,input),{status:403});
  await f.save('newer');await assert.rejects(promotePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:409});
  assert.equal(f.set.tasks[0].referenceSolutions,undefined);
  await f.attach();const refs=structuredClone(f.set.tasks[0].referenceSolutions);
  await assert.rejects(promotePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:409});
  assert.deepEqual(f.set.tasks[0].referenceSolutions,refs);
});

test('declining persists without publishing; old attempts and manually uploaded files do not create offers',async t=>{
  const f=await fixture(t);await f.save();await f.solve();
  const solution=f.card.solutions[f.input.id];solution.viaHelper=false;assert.equal(f.view().referencePromotion,null);
  solution.viaHelper=true;f.card.workbookAttempts={[f.input.id]:{id:'new-attempt',number:2}};assert.equal(f.view().referencePromotion,null);
  delete f.card.workbookAttempts;
  await promotePreparedReference(f.store,teacher,f.raw.id,f.card.id,{action:'dismiss'});
  assert.equal(f.view().referencePromotion,null);assert.equal(f.set.tasks[0].referenceSolutions,undefined);
  await f.save('changed');assert.equal(f.view().referencePromotion,null);
  const restarted=new PreparedLessonTasks(f.deps);assert.equal(restarted.data.runs[f.raw.id].cards[0].referencePromotionDismissed,true);
});

test('a library solution added in another window suppresses the offer even before lesson sync',async t=>{
  const f=await fixture(t);await f.save();await f.solve();
  const asset=f.store.putAsset(teacher,Buffer.from('teacher reference'),'teacher.xlsx','application/octet-stream');
  f.set.tasks[0].referenceSolutions=[{assetId:asset.id}];f.store.save();
  assert.equal(f.view().referencePromotion,null);
  await assert.rejects(promotePreparedReference(f.store,teacher,f.raw.id,f.card.id,{action:'attach'}),{status:409});
});

test('a changed source question and a read-only teacher cannot publish an outdated lesson solution',async t=>{
  const f=await fixture(t);await f.save();await f.solve();
  const file=f.view().referencePromotion.files[0],input={action:'attach',assetId:file.assetId,solutionId:file.id,revision:file.revision};
  const oldAuthorize=f.store.authorize;f.store.authorize=async auth=>({allowed:true,auth,readOnly:true});
  await assert.rejects(promotePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:403});
  f.store.authorize=oldAuthorize;
  f.set.tasks[0].answers=['different'];assert.equal(f.view().referencePromotion,null);
  await assert.rejects(promotePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:409});
  assert.equal(f.set.tasks[0].referenceSolutions,undefined);
});
