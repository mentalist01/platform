import test from 'node:test';
import assert from 'node:assert/strict';
import {splitPastedAnswerValues,getPreparedAnswerPasteOrder} from './answerPaste.js';

test('spaces, tabs and line breaks distribute arbitrary answer counts while preserving signs and leading zeroes',()=>{
  const values=splitPastedAnswerValues('  007 -12\r\n3\t4\n\n5  6 ');
  assert.deepEqual(values,['007','-12','3','4','5','6']);
  for(const count of [2,3,4,7,50])assert.deepEqual(getPreparedAnswerPasteOrder(count),Array.from({length:count},(_,i)=>i));
  assert.deepEqual(getPreparedAnswerPasteOrder(4,2),[2,3]);
});

test('task 25 fills the visible two-column table by rows; independent questions keep their own order',()=>{
  const order=getPreparedAnswerPasteOrder(20),answers=Array(20).fill('');
  splitPastedAnswerValues('101 201\n102 202\n103 203\n104 204\n105 205\n106 206\n107 207\n108 208\n109 209\n110 210').forEach((value,n)=>answers[order[n]]=value);
  assert.deepEqual(answers.slice(0,10),Array.from({length:10},(_,i)=>String(101+i)));
  assert.deepEqual(answers.slice(10),Array.from({length:10},(_,i)=>String(201+i)));
  assert.deepEqual(getPreparedAnswerPasteOrder(20,0,'independent'),Array.from({length:20},(_,i)=>i));
  assert.deepEqual(getPreparedAnswerPasteOrder(3,3),[]);
});
