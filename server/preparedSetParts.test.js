import test from 'node:test';
import assert from 'node:assert/strict';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {preparedSetParts} from '../src/utils/preparedSetParts.js';
import {partFixture} from './preparedSetParts.fixture.js';

test('one set splits into independent page queues with files, code and source indices preserved',async t=>{
  const f=await partFixture(t),parts=preparedSetParts(f.set);assert.deepEqual(parts.map(part=>part.taskIds.length),[2,2]);
  const one=await f.prepared.start(f.auth,{room:'board-t-p~page~part-one',setId:f.set.id,partNumber:1,setVersion:1,x:100,y:100});
  const two=await f.prepared.start(f.auth,{room:'board-t-p~page~part-two',setId:f.set.id,partNumber:2,setVersion:1,x:100,y:100});
  assert.equal(one.total,2);assert.equal(two.total,2);assert.equal(one.cards[0].sourceIndex,0);assert.equal(two.cards[0].sourceIndex,2);assert.equal(two.cards[0].partNumber,2);
  assert.notEqual(one.cards[0].codeId,two.cards[0].codeId);assert.equal(two.cards[0].attachments[0].runtimeName,'9_3.txt');
  const raw=f.prepared.data.runs[two.id];assert.deepEqual(raw.tasks.map(task=>task.id),f.set.tasks.slice(2).map(task=>task.id));
  assert.equal((await f.prepared.start(f.auth,{room:two.room,setId:f.set.id,partNumber:2,x:100,y:100})).id,two.id);
  await assert.rejects(f.prepared.start(f.auth,{room:two.room,setId:f.set.id,partNumber:1,x:100,y:100}),/другая часть/);
  await assert.rejects(f.prepared.start(f.auth,{room:'new-room',setId:f.set.id,partNumber:3,x:100,y:100}),/нет выбранной части/);
  const pupil=f.prepared.publicRun(raw,{auth:{role:'student',id:'p'}});assert.equal(pupil.cards[0].referenceAnswers,undefined);
  const restored=new PreparedLessonTasks(f.deps);assert.equal(restored.data.runs[two.id].partFilters[f.set.id],2);
});
test('queue sync adds only tasks of the selected part and never rewrites an older whole-set lesson',async t=>{
  const f=await partFixture(t),whole=await f.prepared.start(f.auth,{room:'board-t-p',setId:f.set.id,x:0,y:0}),old=JSON.stringify(f.prepared.data.runs[whole.id].tasks);
  const one=await f.prepared.start(f.auth,{room:'board-t-p~page~part-one',setId:f.set.id,partNumber:1,x:0,y:0}),two=await f.prepared.start(f.auth,{room:'board-t-p~page~part-two',setId:f.set.id,partNumber:2,x:0,y:0});
  const saved=await f.prepared.saveSet(f.auth,{...f.set,tasks:[...f.set.tasks.slice(0,2),{title:'3',images:[f.image.id],answers:['5']},...f.set.tasks.slice(2),{title:'3',images:[f.image.id],answers:['6']}]},f.set.id);
  assert.equal(f.prepared.publicRun(f.prepared.data.runs[one.id],{auth:f.auth}).newTasksAvailable,1);
  assert.equal(f.prepared.publicRun(f.prepared.data.runs[two.id],{auth:f.auth}).newTasksAvailable,1);
  const synced=await f.prepared.action(f.auth,two.id,{action:'sync-queue',setId:saved.id,setVersion:saved.version});assert.equal(synced.total,3);
  assert.deepEqual(f.prepared.data.runs[two.id].tasks.map(task=>task.answers[0]),['12','13','6']);
  assert.equal(JSON.stringify(f.prepared.data.runs[whole.id].tasks),old);
});
