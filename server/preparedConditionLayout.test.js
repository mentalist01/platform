import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';

test('teacher pins condition position once; answer feedback and reconnect preserve image and ink coordinates',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-condition-layout-')),doc=new Y.Doc();
  const teacher={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const deps={directory,authorize:async auth=>({allowed:true,auth}),board:async()=>doc,sourceFiles:async()=>[]};
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  let store=new PreparedLessonTasks(deps);
  const image=store.putAsset(teacher,Buffer.from('image'),'condition.png','image/png',{width:600,height:260});
  const set=await store.saveSet(teacher,{name:'18',taskNumber:18,tasks:[{images:[image.id],answers:['478','754']}]});
  let run=await store.start(teacher,{room:'board-t-s',setId:set.id,x:10,y:20}),card=run.cards[0];
  const stroke={id:'underline',type:'stroke',points:[{x:50,y:410},{x:220,y:410}],color:'#7d37d7',strokeWidth:3};
  doc.getArray('items').push([stroke]);
  await assert.rejects(store.action(pupil,run.id,{action:'layout',cards:[{id:card.id,height:620,conditionTop:240}]}),{status:403});
  for(const conditionTop of [-1,NaN,700])await assert.rejects(store.action(teacher,run.id,{action:'layout',cards:[{id:card.id,height:620,conditionTop}]}),{status:400});
  run=await store.action(teacher,run.id,{action:'layout',cards:[{id:card.id,height:620,conditionTop:240}]});
  assert.equal(run.cards[0].conditionTop,240);assert.equal(run.cards[0].height,620);
  const anchor=structuredClone(doc.getArray('items').toArray().find(item=>item.id===card.anchorId));
  const student=store.publicRun(store.data.runs[run.id],{auth:pupil});
  assert.equal(student.cards[0].conditionTop,240);assert.equal('referenceAnswers' in student.cards[0],false);
  await store.action(pupil,run.id,{action:'claim',cardId:card.id,leaseKey:'student'});
  run=await store.action(pupil,run.id,{action:'answer',cardId:card.id,leaseKey:'student',revision:0,answers:['754','478']});
  run=await store.action(pupil,run.id,{action:'check',cardId:card.id,leaseKey:'student',revision:run.cards[0].answerRevision});
  assert.equal(run.cards[0].lastResult,'wrong');assert.equal(run.cards[0].conditionTop,240);
  run=await store.action(teacher,run.id,{action:'layout',cards:[{id:card.id,height:620,conditionTop:290}]});
  assert.equal(run.cards[0].conditionTop,240,'Later feedback must not move the shared condition');
  assert.deepEqual(doc.getArray('items').toArray().find(item=>item.id==='underline'),stroke);
  assert.deepEqual(doc.getArray('items').toArray().find(item=>item.id===card.anchorId),anchor);
  store=new PreparedLessonTasks(deps);
  assert.equal(store.publicRun(store.data.runs[run.id],{auth:pupil}).cards[0].conditionTop,240);
  assert.equal(store.data.runs[run.id].cards[0].codeId,card.codeId);
});

test('controls expand and shrink without internal scrolling or moving the condition and existing ink',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-controls-reflow-')),doc=new Y.Doc();
  const teacher={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const deps={directory,authorize:async auth=>({allowed:true,auth}),board:async()=>doc,sourceFiles:async()=>[]};
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  let store=new PreparedLessonTasks(deps);
  const image=store.putAsset(teacher,Buffer.from('image'),'condition.png','image/png',{width:600,height:260});
  const set=await store.saveSet(teacher,{name:'3',taskNumber:3,tasks:[{images:[image.id],answers:['3900']}]});
  let run=await store.start(teacher,{room:'board-t-s',setId:set.id,x:10,y:20}),card=run.cards[0];
  run=await store.action(teacher,run.id,{action:'layout',cards:[{id:card.id,height:620,conditionTop:240}]});
  const items=doc.getArray('items'),index=items.toArray().findIndex(item=>item.id===card.anchorId),scale=1.25;
  const original={...items.get(index),y:300,width:card.width*scale,height:620*scale};
  items.delete(index,1);items.insert(index,[original]);
  const stroke={id:'existing-ink',type:'stroke',points:[{x:40,y:640},{x:240,y:640}],color:'#7d37d7',strokeWidth:3};items.push([stroke]);
  const conditionY=original.y+240*scale,bottom=original.y+original.height;
  for(const top of [380,180,380]){
    const height=620+top-240;
    run=await store.action(teacher,run.id,{action:'layout',cards:[{id:card.id,height,conditionTop:top,reflowControls:true}]});
    const anchor=items.toArray().find(item=>item.id===card.anchorId);
    assert.equal(anchor.y+top*scale,conditionY,'Changing controls must preserve the exact world position of the condition');
    assert.equal(anchor.y+anchor.height,bottom,'The condition and space below it stay in place');
    assert.deepEqual(items.toArray().find(item=>item.id==='existing-ink'),stroke);
    assert.equal(store.publicRun(store.data.runs[run.id],{auth:pupil}).cards[0].conditionTop,top);
  }
  store=new PreparedLessonTasks(deps);assert.equal(store.data.runs[run.id].cards[0].conditionTop,380);
});
