import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {PreparedSetExchange} from './preparedSetExchange.js';
import {preparedSetSequence,preparedSourceLatest} from '../src/utils/preparedRunSources.js';
import {COLLAB_SOLUTIONS_MAP_KEY} from '../src/utils/collabSolutions.js';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'theory-placement-')),documents=new Map(),auth={id:'teacher',role:'teacher'},pupil={id:'pupil',role:'student'};
  const doc=async room=>{if(!documents.has(room))documents.set(room,new Y.Doc());return documents.get(room);};
  const store=new PreparedLessonTasks({directory,board:doc,code:doc,sourceFiles:async()=>[],authorize:async who=>({allowed:true,auth:who,studentId:pupil.id,participantIds:[]})});
  const images=[0,1,2,3].map(i=>store.putAsset(auth,Buffer.from(`page-${i}`),`page-${i}.png`,'image/png',{width:600,height:180}).id);
  const make=(patch={})=>store.saveSet(auth,{name:'Кодирование',taskNumber:4,theoryMode:'steps',theoryImages:images.slice(0,3),tasks:[{id:A,title:'1',images:[images[3]],answers:['01']},{id:B,title:'2',images:[images[3]],answers:['10']}],...patch});
  t.after(()=>{for(const d of documents.values())d.destroy();fs.rmSync(directory,{recursive:true,force:true});});return {store,auth,pupil,doc,images,make};
}

test('real tasks and theory interleave in one queue; only tasks require answers and create Python documents',async t=>{
  const {store,auth,pupil,doc,images,make}=fixture(t),set=await make({theoryPlacements:{[images[0]]:B,[images[1]]:B,[images[2]]:'end'}});
  const sequence=preparedSetSequence(set);assert.deepEqual(sequence.map(row=>row.kind||'task'),['task','theory','theory','task','theory']);
  let view=await store.start(auth,{room:'board-teacher-pupil',setId:set.id,x:0,y:0});assert.equal(view.cards[0].taskId,A);assert.equal(view.taskTotal,2);
  let a=view.cards[0];view=await store.action(pupil,view.id,{action:'answer',cardId:a.id,answerSchema:a.answerSchema,patches:[{index:0,value:'01'}]});a=view.cards[0];
  view=await store.action(pupil,view.id,{action:'check',cardId:a.id,answerSchema:a.answerSchema});assert.equal(view.cards[0].status,'solved');
  view=await store.action(auth,view.id,{action:'next',expectedCount:1,fromCardId:a.id});assert.equal(view.cards[1].kind,'theory');assert.equal(view.theoryFocus.cardId,view.cards[1].id);assert.equal(view.cards[1].nextKind,'theory');
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[1].id});assert.equal(view.cards[2].nextKind,'task');
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[2].id});assert.equal(view.cards[3].taskId,B);assert.equal(view.cards[3].answerCount,1);assert.equal(view.cards[3].sourceIndex,1);
  view=await store.action(auth,view.id,{action:'skip',expectedCount:4,fromCardId:view.cards[3].id});assert.equal(view.cards[4].kind,'theory');assert.equal(view.cards[4].hasNext,false);
  assert.equal((await doc('collab-teacher-pupil')).getMap(COLLAB_SOLUTIONS_MAP_KEY).size,2);
});

test('new theory is inserted before its selected existing task by both live update actions, preserving cards, code and ink',async t=>{
  for(const action of ['sync-set','sync-queue']){
    const {store,auth,doc,images,make}=fixture(t),set=await make({theoryImages:[]});
    let view=await store.start(auth,{room:'board-live',setId:set.id,x:0,y:0});view=await store.action(auth,view.id,{action:'choose',taskId:B});const b=view.cards[1];
    const items=(await doc('board-live')).getArray('items'),before=items.toArray();
    const updated=await store.saveSet(auth,{...set,theoryImages:[images[0]],theoryPlacements:{[images[0]]:B}},set.id);
    view=await store.action(auth,view.id,{action,setId:set.id,setVersion:updated.version});
    assert.deepEqual(store.data.runs[view.id].tasks.map(row=>row.kind||'task'),['task','theory','task']);assert.equal(view.cards[1].id,b.id);assert.equal(view.cards[1].index,2);assert.equal(view.cards[1].codeId,b.codeId);assert.deepEqual(items.toArray(),before);
  }
});

test('part filters include theory only at matching boundaries; together mode groups only pages with the same placement',async t=>{
  const {images,make}=fixture(t),set=await make({theoryPlacements:{[images[1]]:B,[images[2]]:'end'},tasks:[{id:A,title:'1',images:[images[3]],answers:['01']},{id:B,title:'2',startsPart:true,images:[images[3]],answers:['10']}]});
  assert.deepEqual(preparedSetSequence(set,1).map(row=>row.kind||'task'),['theory','task']);assert.deepEqual(preparedSetSequence(set,2).map(row=>row.kind||'task'),['theory','task','theory']);
  const together=preparedSetSequence({...set,theoryMode:'together'});assert.equal(together.filter(row=>row.kind==='theory').length,3);assert.deepEqual(together.filter(row=>row.kind==='theory').map(row=>row.images),images.slice(0,3).map(id=>[id]));
  const raw={setId:set.id,tasks:together};assert.deepEqual(preparedSourceLatest(raw,set).filter(row=>row.kind==='theory').map(row=>row.images),images.slice(0,3).map(id=>[id]));
});

test('changing placement moves only unopened steps in the queue; annotated sheets never move',async t=>{
  const {store,auth,doc,images,make}=fixture(t),set=await make();let view=await store.start(auth,{room:'board-edit-placement',setId:set.id,x:0,y:0});const first=view.cards[0];
  const items=(await doc('board-edit-placement')).getArray('items'),before=items.toArray();
  const updated=await store.saveSet(auth,{...set,theoryPlacements:{[images[0]]:'end',[images[1]]:B,[images[2]]:'end'}},set.id);
  assert.equal(store.publicRun(store.data.runs[view.id],{auth}).sources[0].contentUpdateAvailable,true);
  view=await store.action(auth,view.id,{action:'sync-set',setId:set.id,setVersion:updated.version});
  const tasks=store.data.runs[view.id].tasks;assert.deepEqual(tasks.map(task=>task.title),['Теория · 1','1','Теория · 2','2','Теория · 3']);assert.equal(view.cards[0].id,first.id);assert.deepEqual(items.toArray(),before);assert.equal(tasks[0].theoryBefore||'','');
});

test('private sharing remaps placement to the copied task and image identities; deleting a target keeps theory at the end',async t=>{
  const {store,auth,images,make}=fixture(t),set=await make({theoryPlacements:{[images[0]]:B}}),other={id:'other',role:'teacher'};
  const exchange=new PreparedSetExchange(store,()=>[{id:auth.id},{id:other.id}]);exchange.publish(auth,set.id,{version:0,recipientIds:[other.id]});
  const {set:copy}=exchange.copy(other,set.id,{version:1});assert.notEqual(copy.tasks[1].id,B);assert.equal(copy.theoryPlacements[copy.theoryImages[0]],copy.tasks[1].id);assert.notEqual(copy.theoryImages[0],images[0]);
  const updated=await store.saveSet(auth,{...set,tasks:[set.tasks[0]]},set.id);assert.equal(updated.theoryPlacements[images[0]],'end');assert.equal(preparedSetSequence(updated).at(-1).images[0],images[0]);
});

test('each incoming sheet controls its layout and public camera hint; settings updates preserve existing ink coordinates',async t=>{
  const {store,auth,pupil,doc,images,make}=fixture(t);
  const set=await make({theoryDisplay:{[images[1]]:{placement:'right',focus:'pair'},[images[2]]:{placement:'below',focus:'next'}}});
  let view=await store.start(auth,{room:'board-display',setId:set.id,x:50,y:100});
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[0].id});
  const items=(await doc('board-display')).getArray('items'),anchors=()=>view.cards.map(c=>items.toArray().find(i=>i.id===c.anchorId));
  const [first,second]=anchors();assert.equal(second.y,first.y);assert.ok(second.x>first.x+first.width);
  let publicView=store.publicRun(store.data.runs[view.id],{auth:pupil});
  assert.deepEqual(publicView.cards[1].theoryDisplay,{placement:'right',focus:'pair'});assert.equal(publicView.cards[1].previousTheoryCardId,view.cards[0].id);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[1].id});
  const third=anchors()[2];assert.equal(third.x,second.x);assert.ok(third.y>second.y+second.height);
  const before=items.toArray(),updated=await store.saveSet(auth,{...set,theoryDisplay:{[images[1]]:{placement:'below',focus:'next'}}},set.id);
  assert.equal(store.publicRun(store.data.runs[view.id],{auth}).sources[0].contentUpdateAvailable,true);
  view=await store.action(auth,view.id,{action:'sync-set',setId:set.id,setVersion:updated.version});
  assert.deepEqual(items.toArray(),before);assert.deepEqual(view.cards[1].theoryDisplay,{placement:'below',focus:'next'});assert.equal(view.cards[2].theoryDisplay,null);
  const exchange=new PreparedSetExchange(store,()=>[{id:auth.id},{id:'copy-teacher'}]),other={id:'copy-teacher',role:'teacher'};
  exchange.publish(auth,set.id,{version:0,recipientIds:[other.id]});const {set:copy}=exchange.copy(other,set.id,{version:1});
  assert.deepEqual(copy.theoryDisplay[copy.theoryImages[1]],{placement:'below',focus:'next'});assert.equal(copy.theoryDisplay[images[1]],undefined);
  await assert.rejects(()=>store.saveSet(auth,{...updated,theoryDisplay:{[images[0]]:{placement:'left'}}},set.id),/расположение/);
});

test('explicit below overrides the two-page automatic side-by-side default',async t=>{
  const {store,auth,doc,images,make}=fixture(t),set=await make({theoryImages:images.slice(0,2),theoryDisplay:{[images[1]]:{placement:'below',focus:'pair'}}});
  let view=await store.start(auth,{room:'board-display-two',setId:set.id,x:0,y:0});view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[0].id});
  const items=(await doc('board-display-two')).getArray('items').toArray(),[a,b]=view.cards.map(c=>items.find(i=>i.id===c.anchorId));
  assert.equal(a.x,b.x);assert.ok(b.y>a.y+a.height);
});
