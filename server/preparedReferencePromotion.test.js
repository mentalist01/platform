import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {promotePreparedReference,preparedReferenceReplacementView,replacePreparedReference} from './preparedReferencePromotion.js';
import {preparedReferenceAsset,uploadPreparedReference} from './preparedReferenceSolutions.js';

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

test('declining belongs to the source task across pupil copies, reloads, edits and later saves; manual attachment remains possible',async t=>{
  const f=await fixture(t);await f.save();await f.solve();
  const decline=()=>promotePreparedReference(f.store,teacher,f.raw.id,f.card.id,{action:'dismiss'});
  assert.equal((await decline()).dismissed,true);assert.equal((await decline()).dismissed,true,'a repeated click is idempotent');
  assert.equal(f.view().referencePromotion,null);assert.ok(f.view().referencePromotionAvailable,'the file menu still supports an explicit decision');
  const next=await f.store.start(teacher,{room:'board-other-copy',setId:f.set.id,x:0,y:0}),raw=f.store.data.runs[next.id],card=raw.cards[0];
  await f.store.startHelper(pupil,raw.id,card.id,f.input.id);
  await f.store.saveSolution({auth:pupil,run:raw,card,assetId:f.input.id,generation:card.bindings[f.input.id].generation,buffer:Buffer.from('other copy'),name:'Решение.xlsx',revision:0,viaHelper:true});
  let view=await f.store.action(pupil,raw.id,{action:'answer',cardId:card.id,revision:0,answers:['42']});
  await f.store.action(pupil,raw.id,{action:'check',cardId:card.id,revision:view.cards[0].answerRevision});
  const show=store=>store.publicRun(store.data.runs[raw.id],{auth:teacher}).cards[0];
  assert.equal(show(f.store).referencePromotion,null,'solving another copy must not ask again');
  await f.store.saveSet(teacher,{...f.set,name:'Переименованный набор'});
  const restarted=new PreparedLessonTasks(f.deps);assert.equal(show(restarted).referencePromotion,null);
  const offer=show(restarted).referencePromotionAvailable.files[0];
  assert.equal((await promotePreparedReference(restarted,teacher,raw.id,card.id,{action:'attach',assetId:offer.assetId,solutionId:offer.id,revision:offer.revision})).attached,true);
  assert.equal(show(restarted).referencePromotionAvailable,undefined);assert.equal(show(restarted).referenceSolution.available,true);
});

test('legacy per-card declines migrate into durable source-task decisions without suppressing a different set',async t=>{
  const f=await fixture(t);await f.save();await f.solve();
  f.card.referencePromotionDismissed=true;f.store.save(f.raw);
  const restarted=new PreparedLessonTasks(f.deps),copy={...restarted.data.runs[f.raw.id],cards:[{...f.card,referencePromotionDismissed:false}]};
  assert.equal(restarted.publicRun(copy,{auth:teacher}).cards[0].referencePromotion,null);
  assert.ok(JSON.parse(fs.readFileSync(restarted.file,'utf8')).referencePromotionDismissals);
  const otherSet=await restarted.saveSet(teacher,{name:'Другой набор',taskNumber:9,tasks:f.set.tasks});
  const different={...copy,setId:otherSet.id,tasks:otherSet.tasks};
  assert.ok(restarted.publicRun(different,{auth:teacher}).cards[0].referencePromotion,'a different library set is independent');
  const before=fs.readFileSync(restarted.file,'utf8');new PreparedLessonTasks(f.deps);assert.equal(fs.readFileSync(restarted.file,'utf8'),before,'migration is idempotent');
});

test('replacing a published reference uses the latest saved file and updates compatible pupil boards without moving ink',async t=>{
  const f=await fixture(t);
  const peer=await f.store.start(teacher,{room:'board-reference-peer',setId:f.set.id,x:100,y:200});
  await f.save();await f.solve();await f.attach();
  const oldId=f.set.tasks[0].referenceSolutions[0].assetId;
  await f.save('corrected later solution');
  const anchors=structuredClone(f.doc.getArray('items').toArray());
  const answers=structuredClone(f.card.answers),codeId=f.card.codeId,revision=f.card.answerRevision;
  const offer=await preparedReferenceReplacementView(f.store,teacher,f.raw.id,f.card.id);
  const file=offer.files[0];
  const input={expectedSetVersion:offer.expectedSetVersion,expectedReferenceIds:offer.expectedReferenceIds,referenceId:oldId,assetId:file.assetId,solutionId:file.id,revision:file.revision};
  assert.equal(f.view().referenceReplacementAvailable,true);
  assert.equal('referenceReplacementAvailable' in f.view(pupil),false);
  assert.equal((await f.store.lock(()=>replacePreparedReference(f.store,teacher,f.raw.id,f.card.id,input))).replaced,true);
  const newId=f.set.tasks[0].referenceSolutions[0].assetId;
  assert.notEqual(newId,oldId);
  assert.equal(fs.readFileSync(f.store.assetFile(await preparedReferenceAsset(f.store,pupil,f.raw.id,f.card.id,newId)),'utf8'),'corrected later solution');
  await assert.rejects(preparedReferenceAsset(f.store,pupil,f.raw.id,f.card.id,oldId),{status:404});
  const peerRun=f.store.data.runs[peer.id];
  assert.equal(peerRun.tasks[0].referenceSolutions[0].assetId,newId);
  assert.deepEqual(f.store.publicRun(peerRun,{auth:pupil}).cards[0].referenceSolution,{available:false,files:[]});
  await assert.rejects(preparedReferenceAsset(f.store,pupil,peer.id,peer.cards[0].id,newId),{status:403});
  assert.deepEqual(f.doc.getArray('items').toArray(),anchors);
  assert.deepEqual(f.card.answers,answers);assert.equal(f.card.codeId,codeId);assert.equal(f.card.answerRevision,revision);
  assert.equal(f.card.solutions[f.input.id].revision,file.revision);
  await assert.rejects(replacePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:409},'a repeated stale click cannot replace the newer choice');
  // Recover a lesson snapshot left stale after library persistence.
  f.raw.tasks[0].referenceSolutions=[{assetId:oldId}];f.store.save(f.raw);
  const restarted=new PreparedLessonTasks(f.deps);
  assert.equal(restarted.publicRun(restarted.data.runs[f.raw.id],{auth:teacher}).cards[0].referenceSolution.files[0].id,newId);
  await assert.rejects(preparedReferenceAsset(restarted,pupil,f.raw.id,f.card.id,oldId),{status:404});
  assert.equal(fs.readFileSync(f.store.assetFile(f.store.data.assets[oldId]),'utf8'),'saved-v1');
});

test('replacement rejects other users, changed questions, stale saves, concurrent reference changes and foreign uploads',async t=>{
  const f=await fixture(t);await f.save();await f.solve();await f.attach();
  const offer=await preparedReferenceReplacementView(f.store,teacher,f.raw.id,f.card.id);
  const file=offer.files[0],input={...offer,referenceId:offer.references[0].id,assetId:file.assetId,solutionId:file.id,revision:file.revision};
  for(const actor of [pupil,other]){
    await assert.rejects(preparedReferenceReplacementView(f.store,actor,f.raw.id,f.card.id),{status:403});
    await assert.rejects(replacePreparedReference(f.store,actor,f.raw.id,f.card.id,input),{status:403});
  }
  const authorize=f.store.authorize;
  f.store.authorize=async auth=>({allowed:true,auth,readOnly:true});
  await assert.rejects(replacePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:403});
  f.store.authorize=authorize;
  await f.save('new save');
  await assert.rejects(replacePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:409});
  const foreign=uploadPreparedReference(f.store,other,{originalname:'foreign.xlsx',buffer:Buffer.from('foreign')});
  await assert.rejects(replacePreparedReference(f.store,teacher,f.raw.id,f.card.id,{...input,referenceAssetId:foreign.id}),{status:403});
  const original=structuredClone(f.set.tasks[0].referenceSolutions);
  f.set.version++;
  await assert.rejects(replacePreparedReference(f.store,teacher,f.raw.id,f.card.id,input),{status:409});
  f.set.tasks[0].answers=['changed'];
  await assert.rejects(preparedReferenceReplacementView(f.store,teacher,f.raw.id,f.card.id),{status:409});
  assert.deepEqual(f.set.tasks[0].referenceSolutions,original);
});

test('an uploaded replacement can change one of several reference files before solving',async t=>{
  const f=await fixture(t);
  const first=uploadPreparedReference(f.store,teacher,{originalname:'first.xlsx',buffer:Buffer.from('first')});
  const second=uploadPreparedReference(f.store,teacher,{originalname:'second.pdf',buffer:Buffer.from('second')});
  const references=[first,second].map(asset=>({assetId:asset.id,name:asset.name,sizeBytes:asset.size}));
  f.set.tasks[0].referenceSolutions=references;
  f.raw.tasks[0].referenceSolutions=structuredClone(references);
  f.store.save();f.store.save(f.raw);
  const replacement=uploadPreparedReference(f.store,teacher,{originalname:'new.xlsx',buffer:Buffer.from('new file')});
  const offer=await preparedReferenceReplacementView(f.store,teacher,f.raw.id,f.card.id);
  assert.equal(offer.files.length,0);
  await replacePreparedReference(f.store,teacher,f.raw.id,f.card.id,{...offer,referenceId:first.id,referenceAssetId:replacement.id});
  const published=f.set.tasks[0].referenceSolutions;
  assert.equal(published.length,2);assert.deepEqual(published[1],references[1]);
  assert.notEqual(published[0].assetId,replacement.id,'published files use a separate immutable asset');
  assert.equal(f.view().referencePromotion,null,'replacement must not open an automatic promotion prompt');
  assert.deepEqual(f.view(pupil).referenceSolution,{available:false,files:[]});
  assert.equal(fs.readFileSync(f.store.assetFile(f.store.data.assets[published[0].assetId]),'utf8'),'new file');
});
