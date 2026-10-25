import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedTaskIssues} from './preparedSetLibrary.js';
import {getPreparedAnswerPasteOrder,splitPastedAnswerValues} from './answerPaste.js';
import {preparedAnswerMatches} from '../../server/preparedLessonTasks.js';

const table=rows=>Array.from({length:20},(_,i)=>String((i<10?rows[i]?.[0]:rows[i-10]?.[1])??''));
test('№25 allows excess blank rows but still requires a complete used row and an image',()=>{
  const task={format:'fields',images:['condition'],answers:table([[101,1],[201,2],[301,3],[401,4],[501,5],[601,6]])};
  assert.equal(preparedTaskIssues(task,25).valid,true);
  assert.deepEqual(preparedTaskIssues(task,25).missing,[]);
  assert.equal(preparedTaskIssues({...task,images:[]},25).valid,false);
  const half=table([[101,1],[201]]);assert.deepEqual(preparedTaskIssues({...task,answers:half},25).missing,[11]);
  assert.deepEqual(preparedTaskIssues({...task,answers:Array(20).fill('')},25).missing,[0,10]);
  assert.equal(preparedTaskIssues(task,17).valid,false,'Other task numbers still require all reference fields');
  assert.equal(preparedTaskIssues({...task,answerMode:'independent'},25).valid,false,'Independent questions remain required');
});
test('paste distributes fewer than ten rows into columns while keeping excess fields empty; exact checks reject extra values',()=>{
  const values=splitPastedAnswerValues('123 3\n456 6\n789 9'),answers=Array(20).fill('');
  getPreparedAnswerPasteOrder(20).forEach((index,n)=>{if(n<values.length)answers[index]=values[n];});
  assert.deepEqual(answers,table([[123,3],[456,6],[789,9]]));
  assert.equal(preparedTaskIssues({images:['condition'],format:'fields',answers},25).valid,true);
  assert.equal(preparedAnswerMatches(answers,[...answers],'fields'),true);
  const extra=[...answers];extra[3]='900';extra[13]='10';assert.equal(preparedAnswerMatches(answers,extra,'fields'),false);
  const missing=[...answers];missing[11]='';assert.equal(preparedAnswerMatches(answers,missing,'fields'),false);
});
test('custom №25 field counts accept empty padding, numeric references validate only filled cells',()=>{
  const task={images:['c'],answers:['1','','2',''],format:'number',answerCountOverride:4};
  assert.equal(preparedTaskIssues(task,25).valid,true);
  assert.equal(preparedAnswerMatches(task.answers,['1.0','','2,0',''],'number'),true);
  assert.equal(preparedAnswerMatches(task.answers,['1','0','2',''],'number'),false);
  assert.equal(preparedTaskIssues({...task,answers:['bad','','2','']},25).valid,false);
  assert.equal(preparedTaskIssues(task,26).valid,false);
});
