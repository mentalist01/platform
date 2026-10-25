import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreparedAnswerTable, preparedAnswerLayout, reshapePreparedAnswers} from './preparedAnswerTable.js';
import {getPreparedAnswerPasteOrder, splitPastedAnswerValues} from './answerPaste.js';
import {preparedAnswerTask} from './egeAnswerFields.js';
import {preparedExpectedAnswerIssues} from './preparedAnswerValidation.js';

test('custom answer tables preserve row order for 4×4 and for 20-cell shapes', () => {
  const values=splitPastedAnswerValues('3 9 34471 103413\n2 4 77563 155126\n2 4 77569 155138\n2 4 77573 155146');
  const task=preparedAnswerTask({answers:values,answerTable:{rows:4,columns:4}},25);
  assert.equal(task.answers.length,16);
  assert.deepEqual(task.answers,values);
  assert.deepEqual(getPreparedAnswerPasteOrder(16,0,'combined',task.answerTable),values.map((_,i)=>i));
  assert.deepEqual(getPreparedAnswerPasteOrder(20,0,'combined',{rows:20,columns:1}),Array.from({length:20},(_,i)=>i));
  assert.deepEqual(getPreparedAnswerPasteOrder(20,7,'combined',{rows:5,columns:4}),Array.from({length:13},(_,i)=>i+7));
  assert.deepEqual(preparedAnswerLayout(task),{rows:4,columns:4,explicit:true});
});

test('legacy column storage reshapes in visible order and never discards a filled cell', () => {
  const legacy={answers:Array(20).fill(''),format:'fields'};
  ['30165057','35161857','341840457','371196657','381814857'].forEach((value,i)=>{
    legacy.answers[getPreparedAnswerPasteOrder(20)[i]]=value;
  });
  const reshaped=reshapePreparedAnswers(legacy,5,1);
  assert.deepEqual(reshaped.answers,['30165057','35161857','341840457','371196657','381814857']);
  assert.deepEqual(legacy.answers.slice(0,3),['30165057','341840457','381814857']);
  assert.throws(()=>reshapePreparedAnswers(legacy,4,1),/не вмещает/);
  assert.deepEqual(reshapePreparedAnswers(reshaped,1,5).answers,reshaped.answers);
});

test('№25 permits blank rows for any table shape, requires every column in used rows', () => {
  const task={answers:['3','9','34471','103413',...Array(12).fill('')],answerTable:{rows:4,columns:4},format:'fields'};
  assert.deepEqual(preparedExpectedAnswerIssues(task,25).missing,[]);
  task.answers[6]='77563';
  assert.deepEqual(preparedExpectedAnswerIssues(task,25).missing,[4,5,7]);
  assert.deepEqual(preparedExpectedAnswerIssues({answers:['1','','2','','3'],answerTable:{rows:5,columns:1},format:'fields'},25).missing,[]);
  assert.equal(preparedExpectedAnswerIssues({...task,answerMode:'independent'},25).missing.length,11);
  assert.equal(preparedExpectedAnswerIssues(task,17).missing.length,11);
});

test('table dimensions reject fractions, zero, oversized products and excessive columns', () => {
  for(const value of [null,{}, {rows:0,columns:1},{rows:1.5,columns:2},{rows:5,columns:11},{rows:26,columns:2},{rows:'4',columns:4}]) {
    assert.equal(normalizePreparedAnswerTable(value),null);
  }
  assert.deepEqual(normalizePreparedAnswerTable({rows:50,columns:1}),{rows:50,columns:1});
});
