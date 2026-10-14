import test from 'node:test';
import assert from 'node:assert/strict';
import { projectGroupEgeCarryover } from './groupEgeCarryover.js';
import { partitionConcurrentHomeworks } from '../src/utils/concurrentHomework.js';
import { buildHomeworkStatistics } from '../src/utils/homeworkStats.js';
const testsDb = { 7: { basic: [1,2,3,4].map(n => ({ id: `q${n}` })) } };
const goal = (numbers, patch = {}) => ({ type: 'task', taskNumber: 7, levelId: 'basic', assignmentTier: 'required',
  targetQuestions: numbers, targetQuestionIds: numbers.map(n => `q${n}`), ...patch });
const entry = (id, day, goals, patch = {}) => ({ id, source: 'learning-group', learningGroupId: 'g2', teacherId: 't',
  studyTrack: 'ege', learningAssignmentId: id, learningAssignmentStatus: 'assigned', learningAssignmentTitle: id,
  issuedAt: `2026-10-${day}T12:00:00Z`, dueAt: '2026-10-30T12:00:00Z', goals, ...patch });
const old = entry('old', '01', [goal([1,2,3])]);
const next = entry('new', '14', [goal([4])], {carryoverEge:true});
const data = numbers => ({ solvedByTask:{7:{basic:{solved:numbers.map(n=>`q${n}`),answerHistory:Object.fromEntries(numbers.map(n=>[`q${n}`,[{correct:true,submittedAt:'2026-10-10T12:00:00Z'}]]))}}} });
const carried = values => values.filter(x=>x.learningEgeCarryover);

test('each pupil receives only their own unfinished EGE targets; old deadline and goals stay intact',()=>{
  const a=projectGroupEgeCarryover([old,next],data([1,2]),testsDb), b=projectGroupEgeCarryover([old,next],data([1]),testsDb);
  assert.deepEqual(carried(a)[0].goals[0].targetQuestionIds,['q3']);
  assert.deepEqual(carried(b)[0].goals[0].targetQuestionIds,['q2','q3']);
  assert.equal(carried(projectGroupEgeCarryover([old,next],data([1,2,3]),testsDb)).length,0);
  assert.deepEqual(a.find(x=>x.id==='old').goals,old.goals);
  assert.equal(a.find(x=>x.id==='old').dueAt,old.dueAt);
  assert.deepEqual(partitionConcurrentHomeworks(a,Date.parse('2026-10-15')).active.map(x=>x.id),['new','new--ege-old']);
});
test('only EGE required work from the same group is carried; cancelled work and Python never revive',()=>{
  const input=[{...old,learningGroupId:'g3'}, {...old,id:'withdrawn',learningHomeworkCancelledAt:'2026-10-10'},
    {...old,id:'python',studyTrack:'python'}, entry('optional','02',[goal([2],{assignmentTier:'optional'})]),next];
  assert.equal(carried(projectGroupEgeCarryover(input,{},testsDb)).length,0);
  assert.equal(carried(projectGroupEgeCarryover([old,{...next,carryoverEge:false}],{},testsDb)).length,0);
});
test('snapshots are stable after solving and polls; a next assignment carries the remainder only once',()=>{
  const first=projectGroupEgeCarryover([old,next],data([1]),testsDb);
  assert.deepEqual(projectGroupEgeCarryover(first,data([1,2]),testsDb),first);
  const second=projectGroupEgeCarryover([...first,entry('newer','21',[goal([4])],{carryoverEge:true})],data([1,2]),testsDb);
  const active=partitionConcurrentHomeworks(second,Date.parse('2026-10-22')).active;
  assert.deepEqual(active.filter(x=>x.learningEgeCarryover).flatMap(x=>x.goals.flatMap(g=>g.targetQuestionIds)),['q3']);
  assert.equal(active.some(x=>x.id==='new--ege-old'),false);
});
test('explicit repeats, removed IDs and a reordered question bank do not duplicate or substitute targets',()=>{
  const db={7:{basic:[{id:'q3'},{id:'q1'},{id:'q4'}]}};
  const result=projectGroupEgeCarryover([old,{...next,goals:[goal([1],{targetQuestionIds:['q1']})]}],{},db);
  assert.deepEqual(carried(result)[0].goals[0].targetQuestionIds,['q3']);
  assert.deepEqual(carried(result)[0].goals[0].targetQuestions,[1]);
});
test('original issue window allows late completion and disabling transfer restores earlier active work',()=>{
  const values=projectGroupEgeCarryover([old,next],data([1,2]),testsDb), supplement=carried(values)[0];
  const done={solvedByTask:{7:{basic:{solved:['q3'],answerHistory:{q3:[{correct:true,submittedAt:'2026-10-15T12:00:00Z'}]}}}}};
  const stats=buildHomeworkStatistics({homeworks:values,studentData:done,testsDb,nowMs:Date.parse('2026-10-16')});
  assert.equal(stats.find(x=>x.id===supplement.id).completedCount,1);
  const disabled=projectGroupEgeCarryover(values.map(x=>x.id==='new'?{...x,carryoverEge:false}:x),done,testsDb);
  assert.equal(carried(disabled).length,0);
  assert.equal(disabled.find(x=>x.id==='old').learningCarryoverSupersededBy,undefined);
});
