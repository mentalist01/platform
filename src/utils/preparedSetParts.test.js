import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedSetParts,preparedSetPartTasks,preparedTaskPartNumber} from './preparedSetParts.js';
import {preparedSetSequence,preparedTaskSource} from './preparedRunSources.js';

test('boundaries follow task positions while source IDs and numeric titles remain unchanged',()=>{
  const set={id:'set',taskNumber:9,partNumber:1,tasks:[{id:'a',title:'1'},{id:'b',title:'2'},{id:'c',title:'1',startsPart:true},{id:'d',title:'2'}]};
  assert.deepEqual(preparedSetParts(set).map(part=>part.taskIds),[['a','b'],['c','d']]);
  assert.deepEqual(preparedSetPartTasks(set,2).map(task=>task.title),['1','2']);assert.equal(preparedTaskPartNumber(set,3),2);
  assert.deepEqual(preparedSetSequence(set,2).map(task=>task.sourceIndex),[2,3]);assert.equal(set.tasks[2].sourceIndex,undefined);
});
test('legacy whole-set sequences retain their identity and introductory theory appears only before the first part',()=>{
  const set={id:'set',taskNumber:9,partNumber:1,tasks:[{id:'a'},{id:'b'}]};
  assert.equal(preparedSetSequence(set),set.tasks);
  set.tasks[1].startsPart=true;set.theoryImages=['image'];
  assert.equal(preparedSetSequence(set,1)[0].kind,'theory');assert.equal(preparedSetSequence(set,2).length,1);assert.equal(preparedSetSequence(set,2)[0].id,'b');
});
test('combined game tasks retain separate EGE topic numbers for parts 19, 20 and 21',()=>{
  const set={id:'set',taskNumber:19,partNumber:1,tasks:[{id:'a'},{id:'b',startsPart:true},{id:'c',startsPart:true}]};
  const tasks=preparedSetSequence(set);assert.deepEqual(tasks.map(task=>task.sourceTaskNumber),[19,20,21]);
  assert.equal(preparedTaskSource({setId:'set',taskNumber:19,partNumber:1,tasks},tasks[1]).taskNumber,20);
});
