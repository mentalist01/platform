import test from 'node:test';
import assert from 'node:assert/strict';
import {configurePreparedGameAnswers,enablePreparedGameAnswers,normalizePreparedAnswerGroups,preparedAnswerGroups,preparedGroupResultsAfterEdit,remapPreparedGroupAnswers,splitPreparedGamePaste} from './preparedAnswerGroups.js';
import {preparedAnswerTask} from './egeAnswerFields.js';
import {preparedAnswerSchema} from './preparedSharedAnswers.js';
import {preparedExpectedAnswerIssues} from './preparedAnswerValidation.js';

const config=(a,b,c)=>[a,b,c].map((counts,index)=>({number:19+index,counts}));
test('all supplied game examples retain their own number of parts and answer cells',()=>{
  for(const [layout,answers] of [
    [config([1,2],[2],[1]),['27','12','13','4','11','7']],
    [config([1],[2],[1]),['33','34','101','35']],
    [config([1],[1],[2]),['14','23','21','24']],
    [config([1],[2],[1]),['80','42','81','44']],
    [config([1],[2],[1]),['10','9','25','8']],
  ]){
    const task=configurePreparedGameAnswers({answers:[]},layout);task.answers=answers;
    assert.deepEqual(preparedAnswerTask(task,19),task);
    assert.deepEqual(preparedAnswerGroups(task).flatMap(group=>group.indices),answers.map((_,index)=>index));
    assert.deepEqual(preparedExpectedAnswerIssues(task,19).missing,[]);
  }
});
test('resizing a part preserves later questions, rejects lost data and supports disabled questions',()=>{
  const task={...configurePreparedGameAnswers({answers:[]},config([1],[2],[1])),answers:['27','4','11','7']};
  const next=configurePreparedGameAnswers(task,config([1,2],[2],[1]));
  assert.deepEqual(next.answers,['27','','','4','11','7']);
  assert.deepEqual(preparedAnswerGroups(next).map(group=>group.label),['№19 · а','№19 · б','№20','№21']);
  assert.throws(()=>configurePreparedGameAnswers(task,config([1],[1],[1])),/Сначала очистите/);
  assert.deepEqual(configurePreparedGameAnswers({...task,answers:['27','','','7']},config([1],[],[1])).answers,['27','7']);
  assert.deepEqual(remapPreparedGroupAnswers(task,next,['x','y','z','w']),['x','','','y','z','w']);
});
test('invalid layouts and oversized blocks are rejected; a fresh block uses 1/2/1',()=>{
  for(const value of [[],config([0],[2],[1]),config([1.2],[2],[1]),config([11],[2],[1]),config(Array(7).fill(1),[1],[1]),config([],[],[]),config([10,10,10],[10,10],[1]),config([1],[2],[1]).reverse()])assert.equal(normalizePreparedAnswerGroups(value),null);
  assert.deepEqual(enablePreparedGameAnswers({answers:[''],format:'fields'}).answers,['','','','']);
  assert.equal(enablePreparedGameAnswers({answers:Array(50).fill('')}).answers.length,50);
});
test('schema tracks structure without leaking answers and editing clears the whole failed part only',()=>{
  const task=configurePreparedGameAnswers({answers:[]},config([1,2],[2],[1]));
  assert.equal(preparedAnswerSchema(task),preparedAnswerSchema({...task,answers:task.answers.map(()=> 'secret')}));
  assert.notEqual(preparedAnswerSchema(task),preparedAnswerSchema(configurePreparedGameAnswers(task,config([2,1],[2],[1]))));
  assert.deepEqual(preparedGroupResultsAfterEdit(task,['27','12','99','4','11','7'],['27','12','13','4','11','7'],['correct','wrong','wrong',null,null,null]),['correct',null,null,null,null,null]);
  assert.deepEqual(splitPreparedGamePaste('27\n12, 13\t4; 11\r\n7'),['27','12','13','4','11','7']);
});
