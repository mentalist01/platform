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
import {placePreparedCard} from '../src/utils/preparedSetLayout.js';

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

test('mixed layout places tasks and theory at configured anchors; unopened theory preview is private',async t=>{
  const {store,auth,pupil,doc,images,make}=fixture(t);
  const theoryKey='theory:'+images[0];
  const set=await make({
    theoryImages:[images[0]],theoryPlacements:{[images[0]]:B},
    boardLayout:{
      [theoryKey]:{relativeTo:'task:'+A,placement:'right',focus:'pair',scalePercent:50},
      ['task:'+B]:{relativeTo:'task:'+A,placement:'below',scalePercent:100},
    },
  });
  let view=await store.start(auth,{room:'board-mixed',setId:set.id,x:42,y:60});
  const first=view.cards[0],items=(await doc('board-mixed')).getArray('items'),anchor=items.get(0);
  items.push([{id:'note',type:'text',x:anchor.x+anchor.width-20,y:anchor.y+40,width:240,height:65}]);
  const upcoming=view.nextTheoryPreview,{width,height,scale}=upcoming.geometry;
  const predicted=placePreparedCard(items.toArray(),upcoming.recipe,{width:width*scale,height:height*scale});
  assert.equal(upcoming.fromCardId,first.id);
  assert.equal(upcoming.images[0].id,images[0]);
  assert.equal(store.publicRun(store.data.runs[view.id],{auth:pupil}).nextTheoryPreview,undefined);
  assert.equal(store.publicRun(store.data.runs[view.id],{auth,readOnly:true}).nextTheoryPreview,undefined);
  assert.equal(items.length,2);
  view=await store.action(auth,view.id,{action:'skip',fromCardId:first.id,expectedCount:1});
  const theory=view.cards[1],theoryAnchor=items.get(2);
  assert.deepEqual({x:theoryAnchor.x,y:theoryAnchor.y},predicted);
  assert.ok(theoryAnchor.x>anchor.x+anchor.width+200);
  assert.equal(theoryAnchor.width,416);
  assert.equal(theory.focusAnchorId,anchor.id);
  assert.equal(view.nextTheoryPreview,undefined);
  const updated=await make({id:set.id,version:set.version,theoryImages:[images[0]],theoryPlacements:{[images[0]]:B},
    boardLayout:{...set.boardLayout,['task:'+B]:{relativeTo:'task:'+A,placement:'below',scalePercent:125}}});
  const before=items.toArray();
  view=await store.action(auth,view.id,{action:'sync-set',setId:set.id,setVersion:updated.version});
  assert.deepEqual(items.toArray(),before);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:theory.id});
  assert.equal(view.cards[2].taskId,B);
  assert.equal(items.get(3).x,anchor.x);
  assert.ok(items.get(3).y>anchor.y+anchor.height);
  assert.equal(items.get(3).width,1040);
});

test('a shared theory frame holds through the selected steps without publishing unrevealed cards',async t=>{
  const {store,auth,pupil,doc,images,make}=fixture(t);
  const set=await make({theoryImages:images,boardLayout:{
    ['theory:'+images[0]]:{focus:'range',nextCards:2},
    ['theory:'+images[1]]:{placement:'right',scalePercent:60},
    ['theory:'+images[2]]:{placement:'below',relativeTo:'theory:'+images[0]},
  }});
  const room='board-camera';
  let view=await store.start(auth,{room,setId:set.id,x:100,y:120});
  const items=(await doc(room)).getArray('items');
  const frame=view.cards[0].theoryCameraFrame;
  assert.ok(frame.width>items.get(0).width&&frame.height>items.get(0).height);
  for(let step=0;step<3;step++){
    const pupilView=store.publicRun(store.data.runs[view.id],{auth:pupil});
    assert.equal(items.length,step+1);
    assert.equal(pupilView.cards.length,step+1);
    assert.equal(pupilView.theoryFocus.cardId,view.cards[step].id);
    assert.deepEqual(pupilView.cards[step].theoryCameraFrame,frame);
    assert.deepEqual(pupilView.cards.flatMap(card=>card.images.map(image=>image.id)),images.slice(0,step+1));
    const anchor=items.get(step);
    assert.ok(anchor.x+anchor.width<=frame.x+frame.width&&anchor.y+anchor.height<=frame.y+frame.height);
    view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[step].id});
  }
  assert.equal(view.cards[3].theoryCameraFrame,undefined);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[3].id});
  assert.equal(view.cards[4].taskId,A);
  assert.equal(view.cards[4].theoryCameraFrame,undefined);
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

test('large explanation, small right table, then pages below selected sheets share one layout with pupils',async t=>{
  const {store,auth,pupil,doc,images,make}=fixture(t);
  store.data.assets[images[1]].height=1800;
  const set=await make({theoryImages:images,theoryDisplay:{
    [images[0]]:{scalePercent:150},
    [images[1]]:{scalePercent:50,relativeTo:images[0],placement:'right',focus:'pair'},
    [images[2]]:{scalePercent:150,relativeTo:images[0],placement:'below'},
    [images[3]]:{scalePercent:150,relativeTo:images[2],placement:'below'},
  }});
  let view=await store.start(auth,{room:'board-columns',setId:set.id,x:20,y:100});
  const items=(await doc('board-columns')).getArray('items'),anchors=()=>view.cards.map(card=>items.toArray().find(item=>item.id===card.anchorId));
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[0].id});
  const [first,second]=anchors();
  assert.ok(Math.abs(first.width/second.width-3)<.001);assert.equal(second.x,first.x+first.width+48);assert.equal(second.y,first.y);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[1].id});
  const third=anchors()[2];assert.equal(third.x,first.x);assert.ok(third.y>first.y+first.height);
  assert.ok(third.y<second.y+second.height,'the neighbouring tall table must not push the left column down');
  assert.equal(view.cards[2].previousTheoryCardId,view.cards[0].id);
  const ink={id:'notes',type:'pen',points:[{x:third.x+20,y:third.y+third.height+40},{x:third.x+150,y:third.y+third.height+190}]};
  items.push([ink]);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[2].id});
  const fourth=anchors()[3];assert.equal(fourth.x,third.x);assert.ok(fourth.y>ink.points[1].y);
  const publicView=store.publicRun(store.data.runs[view.id],{auth:pupil});
  assert.deepEqual(publicView.cards.map(c=>[c.width,c.height,c.theoryDisplay,c.previousTheoryCardId]),view.cards.map(c=>[c.width,c.height,c.theoryDisplay,c.previousTheoryCardId]));
  assert.deepEqual(items.toArray().find(item=>item.id==='notes'),ink);
});

test('size changes affect new sheets; live update, restart and private copy preserve existing geometry and reference identity',async t=>{
  const {store,auth,doc,images,make}=fixture(t),set=await make({theoryDisplay:{[images[0]]:{scalePercent:150}}});
  let view=await store.start(auth,{room:'board-new-sizes',setId:set.id,x:0,y:0});
  const items=(await doc('board-new-sizes')).getArray('items'),before=items.toArray();
  const updated=await store.saveSet(auth,{...set,theoryDisplay:{[images[0]]:{scalePercent:50},[images[1]]:{relativeTo:images[0],scalePercent:50,placement:'right'}}},set.id);
  view=await store.action(auth,view.id,{action:'sync-set',setId:set.id,setVersion:updated.version});
  assert.deepEqual(items.toArray(),before);
  view=await store.action(auth,view.id,{action:'theory-next',cardId:view.cards[0].id});
  assert.equal(items.toArray()[0].width,1248);assert.equal(items.toArray()[1].width,416);
  await store.recover(store.data.runs[view.id]);assert.equal(items.toArray()[0].width,1248);
  const other={id:'copy-teacher',role:'teacher'},exchange=new PreparedSetExchange(store,()=>[{id:auth.id},other]);
  exchange.publish(auth,set.id,{version:0,recipientIds:[other.id]});const {set:copy}=exchange.copy(other,set.id,{version:1});
  assert.equal(copy.theoryDisplay[copy.theoryImages[1]].relativeTo,copy.theoryImages[0]);
  assert.equal(copy.theoryDisplay[copy.theoryImages[1]].scalePercent,50);
  assert.equal(copy.theoryDisplay[copy.theoryImages[1]].relativeTo===images[0],false);
});
