import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedAnswerSchema,createPreparedAnswerBuffer} from './preparedSharedAnswers.js';

const card=(answers=['',''],extra={})=>{const task={answerMode:'combined',format:'fields',answers,...extra};return {...task,answerRevision:0,sharedVersion:1,status:'active',answerSchema:preparedAnswerSchema(task),...extra};};

test('concurrent edits to separate cells merge into the local draft; a slow acknowledgement retains newer keystrokes',()=>{
  const original=card(),buffer=createPreparedAnswerBuffer(original);
  buffer.change([{index:0,value:'12'}]);const batch=buffer.batch();
  buffer.receive(card(['','34'],{answerRevision:1,sharedVersion:2}));assert.deepEqual(buffer.getSnapshot().answers,['12','34']);
  buffer.change([{index:0,value:'123'}]);buffer.acknowledge(card(['12','34'],{answerRevision:2,sharedVersion:3}),batch);
  assert.deepEqual(buffer.getSnapshot().answers,['123','34']);assert.deepEqual(buffer.batch().edits.map(({index,value})=>({index,value})),[{index:0,value:'123'}]);
});
test('a late same-cell receipt cannot roll back a newer shared value or a checked result',()=>{
  const buffer=createPreparedAnswerBuffer(card());buffer.change([{index:0,value:'12'}]);const batch=buffer.batch();
  buffer.receive(card(['99','34'],{answerRevision:3,sharedVersion:4,status:'solved'}));
  buffer.acknowledge(card(['12',''],{answerRevision:1,sharedVersion:2}),batch);
  assert.deepEqual(buffer.getSnapshot().answers,['99','34']);assert.equal(buffer.current().status,'solved');assert.equal(buffer.batch(),null);
});
test('offline recovery stores just edited cells and merges them with answers entered by classmates',()=>{
  const original=card(),buffer=createPreparedAnswerBuffer(original);buffer.change([{index:0,value:'mine'}]);const saved=buffer.backup();
  const recovered=createPreparedAnswerBuffer(card(['','theirs'],{answerRevision:3,sharedVersion:4}),saved);
  assert.equal(recovered.getSnapshot().conflict,false);assert.deepEqual(recovered.getSnapshot().answers,['mine','theirs']);
  assert.deepEqual(recovered.batch().edits.map(({index})=>index),[0]);
});
test('changed grids block stale patches, retain local recovery and protect accepted independent questions',()=>{
  const buffer=createPreparedAnswerBuffer(card());buffer.change([{index:1,value:'keep'}]);
  buffer.receive(card([''],{answerSchema:'different',answerRevision:1,sharedVersion:2}));
  assert.equal(buffer.getSnapshot().conflict,true);assert.throws(()=>buffer.batch(),/Структура/);assert.throws(()=>buffer.restore(),/больше/);
  assert.equal(buffer.backup().patches[0].value,'keep');buffer.discard();assert.deepEqual(buffer.getSnapshot().answers,['']);
  const independent=card(['',''],{answerMode:'independent',fieldResults:[]}),second=createPreparedAnswerBuffer(independent);
  second.change([{index:0,value:'wrong'}]);second.receive({...independent,answers:['right',''],answerRevision:1,sharedVersion:2,fieldResults:['correct',null]});
  assert.deepEqual(second.getSnapshot().answers,['right','']);assert.equal(second.batch(),null);
});
test('grid identifiers do not disclose correct answers and malformed local backups do not crash inputs',()=>{
  assert.equal(card(['secret','key']).answerSchema,card(['other','answers']).answerSchema);
  for(const draft of [true,{}, {answers:[],patches:[null,{index:-1,value:'bad'}]}])assert.doesNotThrow(()=>createPreparedAnswerBuffer(card(),draft));
});
