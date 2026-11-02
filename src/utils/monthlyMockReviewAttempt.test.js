import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyMockReviewAttempt,mockReviewTaskStatus} from './monthlyMockReviewAttempt.js';
import {normalizeBoardTaskClipboardPayload,writeBoardTaskToClipboard,readBoardTaskFromPasteEvent} from './boardTaskClipboard.js';
test('monthly review selects the completed score attempt and its original questions rather than a current retry',()=>{
  const original={id:'exam',tasks:{1:{answer:'old'}}},changed={id:'exam',tasks:{1:{answer:'new'}}};
  const first={attemptId:'first',examId:'exam',finishedAt:'2026-10-31T12:00:00Z',examSnapshot:original,answers:{1:'wrong'},solved:{1:false}};
  const data={attemptId:'retry',answers:{1:'new'},attemptHistory:[first]};
  const {selected}=monthlyMockReviewAttempt([changed],data,{examId:'exam',attemptId:'first',finishedAt:first.finishedAt});
  assert.equal(selected.exam.tasks[1].answer,'old');assert.equal(selected.attempt.answers[1],'wrong');
  assert.throws(()=>monthlyMockReviewAttempt([changed],data,{examId:'exam',attemptId:'missing'}),/не найдена/);
  assert.equal(mockReviewTaskStatus(first,'1'),'incorrect');assert.equal(mockReviewTaskStatus({...first,solved:{1:true}},'1'),'correct');assert.equal(mockReviewTaskStatus(first,'2'),'unanswered');
});
test('mock clipboard survives cross-window packets and contains a source reference, never correct answers',async()=>{
  const source={examId:'exam',studentId:'student',attemptId:'first',finishedAt:'2026-10-31T12:00:00Z',taskKey:'17',secretAnswer:'42'};
  const payload={questionText:'Условие',answerCount:2,mockExamSource:source,expectedAnswers:['42','99']};let packet='';
  assert.ok(await writeBoardTaskToClipboard(payload,{storage:null,clipboard:{writeText:async value=>{packet=value;}},now:100}));
  const read=readBoardTaskFromPasteEvent({clipboardData:{getData:mime=>mime==='text/plain'?packet:''}},{storage:null,now:101});
  assert.equal(read.mockExamSource.taskKey,'17');assert.equal('secretAnswer' in read.mockExamSource,false);assert.equal('expectedAnswers' in normalizeBoardTaskClipboardPayload(payload),false);
});
