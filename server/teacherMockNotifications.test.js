import test from 'node:test';
import assert from 'node:assert/strict';
import {mockCompletionNotifications,normalizeMockCompletionEvents} from './teacherMockNotifications.js';
const finishedAt='2026-10-01T10:00:00.000Z';
const completed={attemptId:'first',examId:'exam',finishedAt,secondaryScore:70};
test('partial answers produce no exam notification, completion sources collapse to one stable ID',()=>{
  const score=solved=>Object.values(solved||{}).filter(Boolean).length*10;
  const data={mockAttempts:{exam:{attemptId:'first',solved:{1:true}}},solvedEvents:[{source:'mock-exam',questionId:1}]};
  assert.deepEqual(mockCompletionNotifications(data,'student',[],score),[]);
  data.mockAttempts.exam.finishedAt=finishedAt;data.mockAttemptResults=[completed];data.mockCompletionEvents=[completed,completed];
  const events=mockCompletionNotifications(data,'student',[{id:'exam',title:'Пробник №1'}],score);
  assert.equal(events.length,1);assert.equal(events[0].id,'mock-completed:student:first');
  assert.equal(events[0].secondaryScore,70);assert.equal(events[0].mockExamTitle,'Пробник №1');
});
test('zero score is still completion; another attempt produces its own single notification',()=>{
  const events=mockCompletionNotifications({mockCompletionEvents:[{...completed,secondaryScore:0},{...completed,attemptId:'second',secondaryScore:50}]},'student',[],()=>99);
  assert.deepEqual(events.map(event=>event.secondaryScore),[0,50]);assert.equal(new Set(events.map(event=>event.id)).size,2);
  assert.equal(normalizeMockCompletionEvents([{...completed,finishedAt:'invalid'},completed,completed]).length,1);
});
