import test from 'node:test';
import assert from 'node:assert/strict';
import {getMockAttemptViews,mockAttemptLabel} from './mockExamAttemptView.js';
import {buildMockExamAnalysis} from './mockExamAnalysis.js';
import {getMockPrimaryScoreFromSolved,getMockSecondaryScoreFromPrimary} from './mockExamProgress.js';

test('analysis opens the displayed repeat, with the first attempt available separately',()=>{
  const tasks=Object.fromEntries(['1','4','7','10','11'].map(key=>[key,{answer:key}]));
  const exam={id:'exam',tasks},answers={1:'1',4:'4',10:'10',11:'wrong'};
  const first={examId:'exam',attemptId:'first',attemptNumber:1,isFirstAttempt:true,mode:'timer',finishedAt:'2026-10-16T14:35:00Z',timerFinishedAt:'2026-10-16T14:35:00Z',tasks,answers,solved:{1:true,4:true,10:true,11:false}};
  const current={...first,attemptId:'second',attemptNumber:2,isFirstAttempt:false,answers:{...answers,7:'wrong',11:'11'},solved:{...first.solved,11:true},attemptHistory:[first]};
  const views=getMockAttemptViews(exam,current);
  assert.deepEqual(views.map(view=>view.key),['second','first']);
  const analyze=view=>buildMockExamAnalysis({exam:view.exam,attempt:view.attempt,getPrimaryScoreFromSolved:getMockPrimaryScoreFromSolved,getSecondaryScoreFromPrimary:getMockSecondaryScoreFromPrimary});
  assert.equal(analyze(views[0]).secondaryScore,27);
  assert.equal(analyze(views[1]).secondaryScore,20);
  assert.equal(analyze(views[0]).tasks.find(t=>t.taskKey==='11').status,'correct');
  assert.equal(analyze(views[1]).tasks.find(t=>t.taskKey==='11').status,'incorrect');
  assert.equal(analyze(views[1]).tasks.find(t=>t.taskKey==='7').status,'unanswered');
});

test('current corrections win for the same attempt, historical exam versions stay pinned',()=>{
  const old={id:'exam',tasks:{1:{question:'old'}}},exam={...old,tasks:{1:{question:'new'}}};
  const result={examId:'exam',attemptId:'first',attemptNumber:1,examSnapshot:old,solved:{1:false}};
  const [view]=getMockAttemptViews(exam,{attemptId:'first',attemptNumber:1,solved:{1:true},attemptHistory:[result]});
  assert.equal(view.attempt.solved[1],true);assert.equal(view.exam.tasks[1].question,'old');
  assert.equal(getMockAttemptViews(exam,{},[result]).length,1);
  assert.equal(getMockAttemptViews(exam,{},[{...result,examId:'other'}])[0].key,'current');
  assert.equal(mockAttemptLabel({attemptNumber:2}),'Повторная попытка №2');
});
