import test from 'node:test';
import assert from 'node:assert/strict';
import {getMonthlyMockCompletionScore as score,getMonthlyMockCompletionDetails} from './monthlyMockResult.js';
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

test('repeat metadata separates the displayed 27 from the first 20 used by reports',()=>{
  const first={...attempt,examId:'monthly',attemptNumber:1,isFirstAttempt:true,solved:{1:true,4:true,10:true}};
  const retry={...attempt,attemptId:'retry',attemptNumber:2,isFirstAttempt:false,finishedAt:'2026-10-12T10:08:00.000Z',solved:{1:true,4:true,10:true,11:true}};
  const details=getMonthlyMockCompletionDetails({mockAttempts:{monthly:retry},mockAttemptResults:[first]}, {...completion,attemptId:'retry',finishedAt:retry.finishedAt});
  assert.deepEqual(details,{score:27,attemptNumber:2,isFirstAttempt:false,firstAttempt:{score:20,finishedAt}});
  assert.equal(JSON.stringify(details).includes('solved'),false);
});
