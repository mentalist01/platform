import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {PreparedSetExchange} from './preparedSetExchange.js';
import {preparedSolveReceipt} from './lessonAchievements.js';
import {COLLAB_SOLUTIONS_MAP_KEY} from '../src/utils/collabSolutions.js';

function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-theory-')),documents=new Map(),auth={id:'teacher-a',role:'teacher'},pupil={id:'pupil',role:'student'};
  const doc=async room=>{if(!documents.has(room))documents.set(room,new Y.Doc());return documents.get(room);};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor,studentId:'pupil',participantIds:[]}),board:doc,code:doc,sourceFiles:async()=>[]};
  t.after(()=>{for(const value of documents.values())value.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const store=new PreparedLessonTasks(deps),image=store.putAsset(auth,Buffer.from('theory'),'theory.png','image/png',{width:600,height:250});
  const question=store.putAsset(auth,Buffer.from('condition'),'condition.png','image/png',{width:600,height:100});
  const make=(name,theory=true)=>store.saveSet(auth,{name,taskNumber:17,theoryImages:theory?[image.id]:[],tasks:[{title:'1',images:[question.id],answers:['2','100']}]});
  return {store,auth,pupil,image,question,make,doc,deps};
}
test('theory is an initial read-only step with no answers, code tab or achievement; Next opens the first real task',async t=>{
  const {store,auth,pupil,make,doc,deps}=fixture(t),set=await make('17 · Введение');
  let view=await store.start(auth,{room:'board-a-pupil',setId:set.id,x:0,y:0}),raw=store.data.runs[view.id];
  assert.equal(view.total,2);assert.equal(view.taskTotal,1);assert.equal(view.sources[0].total,1);assert.equal(view.sources[0].hasTheory,true);
  assert.equal(view.cards[0].kind,'theory');assert.equal(view.cards[0].answerCount,0);
  assert.equal((await doc('collab-a-pupil')).getMap(COLLAB_SOLUTIONS_MAP_KEY).size,0,'Reading theory creates no Python file');
  await assert.rejects(store.action(pupil,view.id,{action:'check',cardId:view.cards[0].id,accept:true}),/Теория/);
  assert.throws(()=>preparedSolveReceipt(raw,raw.cards[0],store.data.assets),/Theory/);
  view=await store.action(auth,view.id,{action:'next',expectedCount:1,fromCardId:view.cards[0].id});
  assert.equal(view.cards[0].status,'reviewed');assert.equal(view.cards[1].title,'1');assert.equal(view.cards[1].sourceIndex,0);assert.equal(view.cards[1].taskNumber,17);
  assert.equal((await doc('collab-a-pupil')).getMap(COLLAB_SOLUTIONS_MAP_KEY).size,1);
  const restarted=new PreparedLessonTasks(deps);assert.equal(restarted.data.runs[view.id].tasks[0].kind,'theory');assert.equal(restarted.data.runs[view.id].tasks[0].answers.length,0);
});
test('a second set starts with its own theory; adding theory to a running legacy set preserves cards and code identities',async t=>{
  const {store,auth,make,image}=fixture(t),a=await make('Первый',false),b=await make('Второй');
  let view=await store.start(auth,{room:'board-a-pupil',setId:a.id,x:0,y:0}),first=view.cards[0];
  view=await store.appendSet(auth,view.id,{setId:b.id,setVersion:b.version});assert.equal(view.taskTotal,2);assert.equal(view.total,3);
  view=await store.action(auth,view.id,{action:'skip',expectedCount:1,fromCardId:first.id});assert.equal(view.cards[1].kind,'theory');assert.equal(view.cards[1].setName,b.name);
  view=await store.action(auth,view.id,{action:'next',expectedCount:2,fromCardId:view.cards[1].id});assert.equal(view.cards[2].kind,'task');assert.equal(view.cards[2].title,'1');
  const updated=await store.saveSet(auth,{...a,theoryImages:[image.id]},a.id);
  assert.equal(store.publicRun(store.data.runs[view.id],{auth}).sources[0].theoryUpdateAvailable,true);
  view=await store.action(auth,view.id,{action:'sync-queue',setId:a.id,setVersion:updated.version});
  assert.equal(view.total,4);assert.equal(view.cards[0].id,first.id);assert.equal(view.cards[0].codeId,first.codeId);assert.equal(view.cards[0].index,1);assert.equal(view.cards[0].sourceIndex,0);
  const catalog=await store.taskCatalog(auth,view.id);assert.equal(catalog.tasks[0].kind,'theory');assert.equal(catalog.tasks[0].setName,a.name);
  view=await store.action(auth,view.id,{action:'choose',taskId:catalog.tasks[0].id});
  const intro=view.cards.find(card=>card.kind==='theory'&&card.setId===a.id);assert.ok(intro);
  view=await store.action(auth,view.id,{action:'next',expectedCount:4,fromCardId:intro.id});assert.equal(view.teacherCardId,first.id);assert.equal(view.cards.length,4);
});
test('theory is included in private set sharing, independent copies, and owner validation',async t=>{
  const {store,auth,make,image}=fixture(t),set=await make('С теорией'),other={id:'teacher-b',role:'teacher'};
  const exchange=new PreparedSetExchange(store,()=>[{id:auth.id},{id:other.id}]);
  exchange.publish(auth,set.id,{version:0,recipientIds:[other.id]});
  const preview=exchange.preview(other,set.id);assert.equal(preview.set.theoryImageFiles.length,1);assert.match(preview.set.theoryImageFiles[0].url,/lesson-task-exchange/);
  const {set:copy}=exchange.copy(other,set.id,{version:1});assert.equal(copy.theoryImages.length,1);assert.notEqual(copy.theoryImages[0],image.id);assert.equal(store.data.assets[copy.theoryImages[0]].teacherId,other.id);
  exchange.publish(auth,set.id,{version:1,recipientIds:[]});assert.throws(()=>exchange.preview(other,set.id),/закрыт/);assert.equal(store.setView(store.data.sets[copy.id]).theoryImageFiles.length,1);
  await assert.rejects(store.saveSet(other,{name:'Чужая теория',taskNumber:17,theoryImages:[image.id],tasks:[{images:[copy.tasks[0].images[0]],answers:['2','100']}]}),/изображению теории/);
});
