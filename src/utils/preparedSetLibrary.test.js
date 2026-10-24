import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPreparedSets,movePreparedSet,upsertPreparedSet,nextPreparedTaskTitle,preparedTaskIssues} from './preparedSetLibrary.js';

test('set search matches Russian names, exam numbers and parts without losing manual order',()=>{
  const sets=[{id:'a',name:'26_2 Эксель',taskNumber:26,partNumber:2},{id:'b',name:'Циклы',taskNumber:17,partNumber:1},{id:'c',name:'Ещё Excel',taskNumber:26,partNumber:1}];
  assert.deepEqual(filterPreparedSets(sets,'ЕГЭ №26').map(s=>s.id),['a','c']);
  assert.deepEqual(filterPreparedSets(sets,'26 часть 2').map(s=>s.id),['a']);
  assert.deepEqual(filterPreparedSets(sets,'ЭКСЕЛЬ').map(s=>s.id),['a']);
  assert.deepEqual(filterPreparedSets(sets,'еще').map(s=>s.id),['c']);
  assert.deepEqual(filterPreparedSets(sets,'несуществующий'),[]);
});

test('moving a filtered result preserves hidden sets and later autosaves never jump the set to the top',()=>{
  const sets=['a','hidden','b','c'].map(id=>({id,name:id}));
  const moved=movePreparedSet(sets,'c','a');
  assert.deepEqual(moved.map(s=>s.id),['c','a','hidden','b']);
  const saved=upsertPreparedSet(moved,{id:'hidden',name:'Изменено',version:3});
  assert.deepEqual(saved.map(s=>s.id),['c','a','hidden','b']);
  assert.equal(saved[2].name,'Изменено');
  assert.deepEqual(movePreparedSet(saved,'a','b',true).map(s=>s.id),['c','hidden','b','a']);
  assert.equal(movePreparedSet(sets,'missing','a'),sets);
  assert.deepEqual(upsertPreparedSet(saved,{id:'new'}).map(s=>s.id),['c','a','hidden','b','new']);
});

test('new task names continue explicit numbers, including zero, without renaming previous tasks',()=>{
  assert.equal(nextPreparedTaskTitle({title:'5'},3),'6');
  assert.equal(nextPreparedTaskTitle({title:'0'},1),'1');
  assert.equal(nextPreparedTaskTitle({title:'009'},2),'010');
  assert.equal(nextPreparedTaskTitle({title:'Разбор'},7),'8');
  assert.equal(nextPreparedTaskTitle(undefined,0),'1');
  assert.equal(nextPreparedTaskTitle({title:'9007199254740993'},2),'9007199254740994');
});

test('progression needs both a condition and every answer; zero is valid and manual marking needs no reference',()=>{
  const task={images:['condition'],answers:['0','  '],format:'fields'};
  assert.deepEqual(preparedTaskIssues(task).missing,[1]);assert.equal(preparedTaskIssues(task).valid,false);
  assert.equal(preparedTaskIssues({...task,answers:['0','12']}).valid,true);
  assert.equal(preparedTaskIssues({...task,answers:['0','12'],images:[]}).images,true);
  assert.equal(preparedTaskIssues({...task,format:'number',answers:['3,5','-2']}).valid,true);
  assert.equal(preparedTaskIssues({...task,format:'number',answers:['NaN']}).valid,false);
  assert.equal(preparedTaskIssues({...task,format:'manual',answers:['']}).valid,true);
});
