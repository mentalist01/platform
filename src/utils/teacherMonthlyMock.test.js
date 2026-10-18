import test from 'node:test';
import assert from 'node:assert/strict';
import {getTeacherMonthlyMockView as view} from './teacherMonthlyMock.js';
const data=(row={},assignment={examId:'monthly'})=>({assignment,generatedAt:'2026-10-18T10:00:00Z',rows:[{studentId:'a',status:'completed',score:0,...row}]});
test('finished zero, unfinished and missing grades have different displays',()=>{
  assert.equal(view(data(),'a').score,0);
  assert.equal(view(data({score:null}),'a').score,null);
  assert.equal(view(data({status:'in_progress',score:67}),'a').score,null);
  assert.equal(view(data({status:'pending',score:67}),'a').status,'pending');
});
test('switching pupils cannot display a previous pupil result; unassigned means no monthly grade',()=>{
  assert.equal(view(data(),'b').status,'unavailable');
  assert.equal(view(data(),'b').assignment,null);
  assert.equal(view(data({},null),'a').status,'unassigned');
  assert.equal(view(data({},null),'a').score,null);
  assert.equal(view(null,'a').status,'loading');
});
test('teacher sees publication pending separately from a pupil who has not started',()=>{
  assert.equal(view(data({status:'pending'},{examId:'monthly',publishesAt:'2026-10-20T21:00:00Z'}),'a').status,'scheduled');
  assert.equal(view(data({},{examId:'monthly',publishesAt:'2026-10-20T21:00:00Z'}),'a').status,'completed');
});
