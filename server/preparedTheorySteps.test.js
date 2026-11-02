import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks,preparedTheoryPoint} from './preparedLessonTasks.js';
import {preparedSetSequence} from '../src/utils/preparedRunSources.js';
import {COLLAB_SOLUTIONS_MAP_KEY} from '../src/utils/collabSolutions.js';

function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'theory-steps-')),docs=new Map(),auth={id:'teacher',role:'teacher'},pupil={id:'pupil',role:'student'};
  const doc=async room=>{if(!docs.has(room))docs.set(room,new Y.Doc());return docs.get(room);};
  const deps={directory,board:doc,code:doc,sourceFiles:async()=>[],authorize:async actor=>({allowed:true,auth:actor,studentId:pupil.id,participantIds:[]})};
  const store=new PreparedLessonTasks(deps),images=[250,500,180,300].map((height,i)=>store.putAsset(auth,Buffer.from(`image-${i}`),`page-${i}.png`,'image/png',{width:600,height}).id);
  t.after(()=>{for(const d of docs.values())d.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const make=(extra={})=>store.saveSet(auth,{name:'Машина Тьюринга',taskNumber:12,theoryImages:images.slice(0,3),tasks:[{title:'1',images:[images[3]],answers:['7']}],...extra});
  return {store,auth,pupil,doc,images,make,deps};
}

test('three sheets appear one at a time vertically, keep annotations, and repeated arrow clicks never duplicate a sheet',async t=>{
  const {store,auth,pupil,doc,make,deps}=fixture(t),set=await make();
  let view=await store.start(auth,{room:'board-teacher-pupil',setId:set.id,x:100,y:120});
  const run=store.data.runs[view.id],items=(await doc(run.room)).getArray('items'),first=view.cards[0];
  assert.equal(set.theoryMode,'steps');assert.equal(view.cards.length,1);assert.equal(view.total,4);assert.equal(view.taskTotal,1);
  assert.deepEqual(first.theoryStep,{index:0,count:3});assert.equal(first.images.length,1);
  assert.equal((await doc('collab-teacher-pupil')).getMap(COLLAB_SOLUTIONS_MAP_KEY).size,0);
  const ink={id:'ink',type:'stroke',points:[{x:120,y:210},{x:200,y:220}]};items.push([ink]);
  await assert.rejects(store.action(pupil,view.id,{action:'theory-next',cardId:first.id}),/преподаватель/);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:first.id});
  const second=view.cards[1],a=items.toArray().find(i=>i.id===first.anchorId),b=items.toArray().find(i=>i.id===second.anchorId);
  assert.ok(b.y>a.y+a.height);assert.equal(b.x,a.x);assert.equal(first.images[0].id,view.cards[0].images[0].id);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:first.id});assert.equal(view.cards.length,2);assert.equal(view.teacherCardId,second.id);
  view=await store.action(auth,view.id,{action:'next',expectedCount:2,fromCardId:second.id});
  const third=view.cards[2],c=items.toArray().find(i=>i.id===third.anchorId);assert.ok(c.y>b.y+b.height);assert.equal(c.x,b.x);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:third.id});
  const question=view.cards[3],q=items.toArray().find(i=>i.id===question.anchorId);
  assert.equal(q.x,a.x);assert.ok(q.y>Math.max(a.y+a.height,b.y+b.height,c.y+c.height));
  assert.deepEqual(items.toArray().find(i=>i.id==='ink'),ink);assert.equal(question.sourceIndex,0);
  assert.equal((await doc('collab-teacher-pupil')).getMap(COLLAB_SOLUTIONS_MAP_KEY).size,1);
  await assert.rejects(store.action(auth,view.id,{action:'theory-next',cardId:question.id}),/из теории/);
  const restarted=new PreparedLessonTasks(deps);assert.equal(restarted.data.runs[view.id].cards.length,4);assert.deepEqual(restarted.data.runs[view.id].tasks[1].theoryStep,{index:1,count:3});
});

test('two sheets open side by side, while the first question opens beneath both sheets',async t=>{
  const {store,auth,doc,make,images}=fixture(t),set=await make({theoryImages:images.slice(0,2)});
  let view=await store.start(auth,{room:'board-two',setId:set.id,x:100,y:120});
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[0].id});
  const items=(await doc('board-two')).getArray('items').toArray(),[a,b]=view.cards.map(card=>items.find(i=>i.id===card.anchorId));
  assert.equal(b.y,a.y);assert.equal(b.x,a.x+a.width+48);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[1].id});
  const q=(await doc('board-two')).getArray('items').toArray().find(i=>i.id===view.cards[2].anchorId);
  assert.equal(q.x,a.x);assert.ok(q.y>Math.max(a.y+a.height,b.y+b.height));
});

test('new theory avoids existing writing beside the previous sheet and rejects an exhausted horizontal canvas',()=>{
  const anchor={id:'page',x:10,y:20,width:832,height:400};
  const ink={points:[{x:900,y:60},{x:1100,y:80}]},box={x:1180,y:20,width:500,height:100};
  assert.deepEqual(preparedTheoryPoint([anchor,ink,box],anchor,832,300),{x:1728,y:20});
  assert.throws(()=>preparedTheoryPoint([],{x:899900,y:0,width:832},832,300),/мало места/);
});

test('updating and extending step theory preserves card identity, placement, ink and question code',async t=>{
  const {store,auth,make,images,doc}=fixture(t),set=await make({theoryImages:images.slice(0,2)});
  let view=await store.start(auth,{room:'board-teacher-pupil',setId:set.id,x:0,y:0});
  const first=view.cards[0];view=await store.action(auth,view.id,{action:'choose',taskId:set.tasks[0].id});const question=view.cards[1];
  const items=(await doc('board-teacher-pupil')).getArray('items'),before=items.toArray();
  const updated=await store.saveSet(auth,{...set,theoryImages:[images[2],images[1],images[3]]},set.id);
  view=await store.action(auth,view.id,{action:'sync-set',setId:set.id,setVersion:updated.version});
  assert.equal(view.total,4);assert.equal(view.cards[0].id,first.id);assert.equal(view.cards[0].images[0].id,images[2]);assert.equal(view.cards[0].theoryStep.count,3);
  assert.equal(view.cards[1].taskId,question.taskId);assert.equal(view.cards[1].codeId,question.codeId);assert.equal(view.cards[1].index,3);assert.deepEqual(items.toArray(),before);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:first.id});assert.equal(view.cards.at(-1).theoryStep.index,1);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards.at(-1).id});assert.equal(view.cards.at(-1).theoryStep.index,2);
});

test('legacy stacked theory keeps its annotated single card; new openings use the chosen step mode and part filters remain intact',async t=>{
  const {store,auth,make,images}=fixture(t),set=await make({theoryMode:'together'});
  let view=await store.start(auth,{room:'board-legacy',setId:set.id,x:0,y:0});const old=view.cards[0];
  const updated=await store.saveSet(auth,{...set,theoryMode:'steps'},set.id);
  view=await store.action(auth,view.id,{action:'sync-set',setId:set.id,setVersion:updated.version});
  assert.equal(view.total,2);assert.equal(view.cards[0].id,old.id);assert.equal(view.cards[0].images.length,3);assert.equal(view.sources[0].theoryUpdateAvailable,false);
  const fresh=await store.start(auth,{room:'board-fresh',setId:set.id,x:0,y:0});assert.equal(fresh.total,4);assert.equal(fresh.cards[0].images.length,1);
  assert.equal(preparedSetSequence({...updated,tasks:[...updated.tasks,{id:'part2',startsPart:true,images:[images[0]],answers:['1']}]},2).some(t=>t.kind==='theory'),false);
  await assert.rejects(make({theoryMode:'invalid'}),/способ показа/);
});

test('queue sync connects every theory page added later, without changing existing question identities',async t=>{
  const {store,auth,make,images}=fixture(t),set=await make({theoryImages:[]});
  let view=await store.start(auth,{room:'board-later',setId:set.id,x:0,y:0});const first=view.cards[0];
  const updated=await store.saveSet(auth,{...set,theoryImages:images.slice(0,3)},set.id);
  view=await store.action(auth,view.id,{action:'sync-queue',setId:set.id,setVersion:updated.version});
  assert.equal(view.total,4);assert.equal(view.cards[0].id,first.id);assert.equal(view.cards[0].index,3);assert.equal(view.cards[0].codeId,first.codeId);
  assert.equal((await store.taskCatalog(auth,view.id)).tasks.filter(t=>t.kind==='theory').length,3);
  view=await store.action(auth,view.id,{action:'sync-queue',setId:set.id,setVersion:updated.version});assert.equal(view.total,4);
});
