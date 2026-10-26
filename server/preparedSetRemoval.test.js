import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {createEmptyCollabSolution,getCollabSolutionChannels,listCollabSolutions} from '../src/utils/collabSolutions.js';

async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-remove-')),docs=new Map(),codeDoc=new Y.Doc();
  t.after(()=>{for(const doc of docs.values())doc.destroy();codeDoc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor,participantIds:['s'],studentId:'s'}),
    board:async room=>{if(!docs.has(room))docs.set(room,new Y.Doc());return docs.get(room);},code:async()=>codeDoc,sourceFiles:async()=>[]};
  const store=new PreparedLessonTasks(deps),image=store.putAsset(auth,Buffer.from('image'),'image.png','image/png',{width:600,height:120});
  const make=(name,count=2,number=3,extra={})=>store.saveSet(auth,{name,taskNumber:number,tasks:Array.from({length:count},(_,i)=>({title:String(i+1),images:[image.id],answers:['7'],...extra}))});
  const first=await make('Первый'),second=await make('Второй',1,4);
  const run=await store.start(auth,{room:'board-t-s',setId:first.id,x:10,y:20}),doc=await deps.board(run.room);
  return {store,deps,auth,pupil,image,make,first,second,run,doc,codeDoc};
}

test('removing a source preserves the other queue, ink, library, saved answers, code and exact resized anchors across restart',async t=>{
  const f=await fixture(t),{store,auth,run,doc,codeDoc}=f,firstCard=run.cards[0];
  await store.action(auth,run.id,{action:'claim',cardId:firstCard.id,leaseKey:'answer'});
  await store.action(auth,run.id,{action:'answer',cardId:firstCard.id,leaseKey:'answer',revision:0,answers:['7']});
  await store.action(auth,run.id,{action:'check',cardId:firstCard.id,leaseKey:'answer',revision:1});
  await store.action(auth,run.id,{action:'claim-code',cardId:firstCard.id,leaseKey:'code'});
  await store.action(auth,run.id,{action:'code',cardId:firstCard.id,leaseKey:'code',revision:0,code:'print(7)'});
  const channels=getCollabSolutionChannels(codeDoc,firstCard.codeId);channels.codeText.insert(0,'print(7)\n# collaborative edit');
  createEmptyCollabSolution(codeDoc,{id:'unrelated',name:'Старый код'});getCollabSolutionChannels(codeDoc,'unrelated').codeText.insert(0,'keep');
  await store.appendSet(auth,run.id,{setId:f.second.id,setVersion:f.second.version});
  const catalog=await store.taskCatalog(auth,run.id),secondTask=catalog.tasks.at(-1);
  const shown=await store.action(auth,run.id,{action:'choose',taskId:secondTask.id}),secondCard=shown.cards.at(-1);
  const items=doc.getArray('items'),index=items.toArray().findIndex(item=>item.id===firstCard.anchorId);
  const anchor={...items.get(index),x:125,y:222,width:990};items.delete(index,1);items.push([anchor,{id:'ink',type:'stroke',points:[{x:0,y:10},{x:500,y:10}]}]);
  const before=structuredClone(items.toArray()),library=JSON.stringify(store.data.sets);
  await assert.rejects(store.action(f.pupil,run.id,{action:'remove-set',setId:f.first.id}),{status:403});
  await assert.rejects(store.action({id:'other',role:'teacher'},run.id,{action:'remove-set',setId:f.first.id}),{status:403});
  const removed=await store.action(auth,run.id,{action:'remove-set',setId:f.first.id});
  assert.deepEqual(removed.sources.map(source=>source.id),[f.second.id]);assert.equal(removed.cards[0].id,secondCard.id);assert.equal(removed.cards[0].index,0);assert.equal(removed.cards[0].taskNumber,4);
  assert.equal(removed.removedSets.length,1);assert.equal(items.toArray().some(item=>item.id===firstCard.anchorId),false);
  assert.deepEqual(items.toArray().find(item=>item.id==='ink'),before.find(item=>item.id==='ink'));
  assert.equal(JSON.stringify(store.data.sets),library);assert.equal(listCollabSolutions(codeDoc).some(row=>row.id===firstCard.codeId),false);assert.equal(listCollabSolutions(codeDoc).some(row=>row.id==='unrelated'),true);
  assert.equal('removedSets' in store.publicRun(store.data.runs[run.id],{auth:f.pupil}),false);
  const restarted=new PreparedLessonTasks(f.deps);await restarted.recover(restarted.data.runs[run.id]);
  const restored=await restarted.action(auth,run.id,{action:'restore-set',removalId:removed.removedSets[0].id});
  assert.deepEqual(restored.sources.map(source=>source.id),[f.first.id,f.second.id]);assert.equal(restored.cards[0].id,firstCard.id);assert.equal(restored.cards[0].status,'solved');assert.deepEqual(restored.cards[0].answers,['7']);
  assert.equal(restored.cards.at(-1).id,secondCard.id);assert.equal(restored.cards.at(-1).index,2);assert.deepEqual(items.toArray().find(item=>item.id===firstCard.anchorId),anchor);
  assert.equal(channels.codeText.toString(),'print(7)\n# collaborative edit');assert.equal(restarted.data.runs[run.id].cards[0].code.text,'print(7)');assert.equal(listCollabSolutions(codeDoc).some(row=>row.id===firstCard.codeId),true);
  const next=await restarted.action(auth,run.id,{action:'next',expectedCount:2,fromCardId:firstCard.id});assert.equal(next.cards.at(-1).index,1,'the original queue can continue after undo');
});

test('removing the only set permits placing a different set; undo handles task ID collisions and a queued source with no cards',async t=>{
  const f=await fixture(t),{store,auth,run}=f,taskId=f.first.tasks[0].id;
  const removed=await store.action(auth,run.id,{action:'remove-set',setId:f.first.id});
  assert.equal(removed.mode,'plain');assert.equal(removed.total,0);await store.recover(store.data.runs[run.id]);assert.equal(store.data.runs[run.id].cards.length,0);
  const replacement=await f.make('Нужный набор',1,3,{id:taskId});
  const placed=await store.start(auth,{room:run.room,setId:replacement.id,x:500,y:700});
  assert.equal(placed.id,run.id);assert.equal(placed.cards[0].title,'1');assert.equal(placed.removedSets.length,1);
  const restored=await store.action(auth,run.id,{action:'restore-set',removalId:removed.removedSets[0].id});
  assert.equal(restored.total,3);assert.equal(new Set(store.data.runs[run.id].tasks.map(task=>task.id)).size,3);
  assert.deepEqual(restored.sources.map(source=>source.id),[f.first.id,replacement.id]);
  assert.equal(restored.cards.find(card=>card.id===placed.cards[0].id).setId,replacement.id);
  await store.action(auth,run.id,{action:'remove-set',setId:f.first.id});
  await store.appendSet(auth,run.id,{setId:f.second.id,setVersion:f.second.version});
  const waiting=await store.action(auth,run.id,{action:'remove-set',setId:replacement.id});
  await store.recover(store.data.runs[run.id]);assert.equal(store.data.runs[run.id].cards.length,0,'opening a pupil board must not silently advance the remaining queue');
  assert.equal(waiting.total,1);assert.ok(waiting.firstTaskId);
  const started=await store.action(auth,run.id,{action:'choose',taskId:waiting.firstTaskId});assert.equal(started.cards[0].setId,f.second.id);
});

test('failed storage never hides the set; a removed workbook remains in notes and stale helper tickets stop cleanly',async t=>{
  const f=await fixture(t),{store,auth,run}=f,card=store.data.runs[run.id].cards[0];
  const originalSave=store.save,original=JSON.stringify(store.data.runs[run.id]);store.save=()=>{throw Error('disk unavailable');};
  await assert.rejects(store.action(auth,run.id,{action:'remove-set',setId:f.first.id}),/disk unavailable/);store.save=originalSave;
  assert.equal(JSON.stringify(store.data.runs[run.id]),original);
  const asset=store.putAsset(auth,Buffer.from('original'),'input.xlsx','application/octet-stream');
  store.data.runs[run.id].tasks[0].attachments=[{assetId:asset.id,name:asset.name,runtime:false}];
  const {ticket}=await store.startHelper(auth,run.id,card.id,asset.id),session=await store.exchange(ticket);
  const {ticket:waitingTicket}=await store.startHelper(auth,run.id,card.id,asset.id);
  const solution=await store.saveSolution({auth,run:store.data.runs[run.id],card,assetId:asset.id,generation:card.bindings[asset.id].generation,buffer:Buffer.from('saved'),name:'solution.xlsx',revision:0});
  const removed=await store.action(auth,run.id,{action:'remove-set',setId:f.first.id});
  await assert.rejects(store.saveSolution({auth,run:store.data.runs[run.id],card,assetId:asset.id,generation:card.bindings[asset.id].generation,buffer:Buffer.from('late save'),name:'solution.xlsx',revision:1}),{status:410});
  assert.equal(store.notesForStudent('s',auth).find(file=>file.id===solution.id).taskNumber,3);
  await assert.rejects(store.exchange(waitingTicket),{status:410});await assert.rejects(store.helperSession(session.token),{status:410});
  const reopened=new PreparedLessonTasks(f.deps);assert.equal(reopened.notesForStudent('s',auth).find(file=>file.id===solution.id).name,'solution.xlsx');
  const restored=await reopened.action(auth,run.id,{action:'restore-set',removalId:removed.removedSets[0].id});assert.equal(restored.cards[0].attachments[0].solution.id,solution.id);
});

test('removal does not lose a pending achievement receipt',async t=>{
  const f=await fixture(t),run=f.store.data.runs[f.run.id],card=run.cards[0];
  card.solveReceipt={runId:run.id,cardId:card.id,participants:[{id:'s'}]};card.achievementPending=true;f.store.save(run);
  await f.store.action(f.auth,run.id,{action:'remove-set',setId:f.first.id});
  let awards=0;
  const restarted=new PreparedLessonTasks({...f.deps,onAchievement:async(_run,saved)=>{assert.equal(saved.solveReceipt.cardId,card.id);awards++;}});
  await restarted.recover(restarted.data.runs[run.id]);await restarted.recover(restarted.data.runs[run.id]);
  assert.equal(awards,1);assert.equal(restarted.data.runs[run.id].detachedSets[0].cards[0].achievementPending,false);
});
