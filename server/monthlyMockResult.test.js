import test from 'node:test';
import assert from 'node:assert/strict';
import {getMonthlyMockCompletionScore as score} from './monthlyMockResult.js';
const finishedAt='2026-10-12T10:00:00.000Z';
const completion={examId:'monthly',attemptId:'first',finishedAt};
const attempt={attemptId:'first',finishedAt,status:'finished'};

test('monthly result uses the same EGE scale, including double-weight tasks and a genuine zero',()=>{
  assert.equal(score({mockAttempts:{monthly:{...attempt,solved:{1:true,26:true,27:true}}}},completion),34);
  assert.equal(score({mockAttempts:{monthly:{...attempt,solved:{1:false,26:false}}}},completion),0);
  assert.equal(score({mockAttempts:{monthly:{...attempt,solved:{}}}},completion),0);
});
test('unfinished retry and another variant never replace a frozen monthly score',()=>{
  const data={mockAttempts:{monthly:{attemptId:'second',status:'active',updatedAt:finishedAt,solved:{1:true}},other:{...attempt,solved:{1:true}}},mockAttemptResults:[{...attempt,examId:'monthly',secondaryScore:67}]};
  assert.equal(score(data,completion),67);
  assert.equal(score({...data,mockAttemptResults:[]},completion),null);
});
test('teacher corrections to the same finished attempt take precedence over its frozen snapshot',()=>{
  const data={mockAttempts:{monthly:{...attempt,solved:{1:true,2:true}}},mockAttemptResults:[{...attempt,examId:'monthly',secondaryScore:0}]};
  assert.equal(score(data,completion),14);
});
test('legacy primary scores and snapshots are supported without fabricating missing grades',()=>{
  assert.equal(score({mockAttemptResults:[{...attempt,examId:'monthly',primaryScore:6}]},completion),40);
  assert.equal(score({mockAttemptResults:[{...attempt,examId:'monthly',primaryScore:0}]},completion),0);
  assert.equal(score({mockAttemptResults:[{...attempt,examId:'monthly',secondaryScore:''}]},completion),null);
  assert.equal(score({mockAttemptResults:[{examId:'monthly',attemptSnapshot:{...attempt,solved:{1:true}}}]},completion),7);
  assert.equal(score({monthlyMockCompletions:[completion]},completion),null);
  assert.equal(score({},null),null);
});
test('a result from a different completion date is never substituted',()=>{
  assert.equal(score({mockAttempts:{monthly:{...attempt,finishedAt:'2026-10-13T10:00:00Z',solved:{1:true}}}},completion),null);
});
