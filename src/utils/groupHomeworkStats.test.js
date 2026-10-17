import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHomeworkStatistics} from './homeworkStats.js';

const stamp = day => `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`;
const goal = (task, ids) => ({type:'task',taskNumber:task,levelId:task>=100?'python':'basic',targetQuestions:ids.map((_,i)=>i+1),targetQuestionIds:ids});
const row = (id,day,goals,extra={}) => ({id,source:'learning-group',learningGroupId:'g',learningAssignmentId:id,issuedAt:stamp(day),dueAt:stamp(day+7),goals,...extra});
const testsDb = {7:{basic:[{id:'e1'},{id:'e2'}]},101:{python:[{id:'p1'},{id:'p2'}]},103:{python:[{id:'for1'}]},105:{python:[{id:'w1'}]}};
const attempt = (day,correct=true) => ({submittedAt:stamp(day),correct});

test('an EGE assignment and another Python topic do not zero completed older Python homework',()=>{
 const stats=buildHomeworkStatistics({testsDb,nowMs:Date.parse(stamp(22)),homeworks:[
  row('python',9,[goal(103,['for1'])]),row('ege',14,[goal(7,['e1','e2'])]),row('new-python',16,[goal(105,['w1'])]),
 ],studentData:{solvedByTask:{103:{python:{solved:['for1'],answerHistory:{for1:[attempt(15,false),attempt(17)]}}}}}});
 const old=stats.find(s=>s.id==='python');
 assert.equal(old.percent,100);assert.equal(old.withErrorsCount,1);
 assert.equal(old.lateCompletedCount,1);assert.equal(old.checkpointPercent,0);
 assert.equal(old.completedOnTime,false);
 assert.equal(stats.find(s=>s.id==='ege').percent,0);
 assert.equal(stats.find(s=>s.id==='new-python').percent,0);
});

test('previously solved group targets agree with homework cards without crediting unrelated ids',()=>{
 const stats=buildHomeworkStatistics({testsDb,nowMs:Date.parse(stamp(22)),homeworks:[
  row('old-python',8,[goal(101,['p1','p2'])]),row('new-ege',14,[goal(7,['e1'])]),
 ],studentData:{solvedByTask:{101:{python:{solved:['p1','unrelated'],answerHistory:{p1:[attempt(2)]}}}}}});
 assert.equal(stats[0].percent,50);assert.equal(stats[0].completedCount,1);
 assert.equal(stats[0].goals[0].items.find(i=>i.questionId==='p2').state,'untouched');
 assert.equal(stats[1].percent,0);
});

test('an explicit repeat preserves the solved target state, and bank reordering cannot substitute another task',()=>{
 const stats=buildHomeworkStatistics({testsDb:{101:{python:[{id:'p2'},{id:'p1'}]}},nowMs:Date.parse(stamp(22)),homeworks:[
  row('first',2,[goal(101,['p1'])]),row('repeat',9,[goal(101,['p1'])]),row('other',14,[goal(101,['p2'])]),
 ],studentData:{solvedByTask:{101:{python:{solved:['p1'],answerHistory:{p1:[attempt(10)]}}}}}});
 assert.deepEqual(stats.map(s=>s.percent),[100,100,0]);
 assert.equal(stats[0].lateCompletedCount,1);
 assert.equal(stats[1].completedOnTime,true);
});

test('checklist-only work can be completed after the next assignment and keeps its original deadline',()=>{
 const stats=buildHomeworkStatistics({testsDb,nowMs:Date.parse(stamp(22)),homeworks:[
  row('notes',2,[],{checklistItems:[{id:'note',text:'Повторить конспект',completedAt:stamp(12)}]}),
  row('ege',8,[goal(7,['e1'])]),
 ]});
 assert.equal(stats[0].percent,100);assert.equal(stats[0].lateCompletedCount,1);assert.equal(stats[0].checkpointPercent,0);
});

test('excluded Python stays out of statistics, while unattempted homework stays zero',()=>{
 const stats=buildHomeworkStatistics({testsDb,nowMs:Date.parse(stamp(22)),homeworks:[
  row('excluded',2,[goal(101,['p1'])],{learningHomeworkTrackExcluded:true}),row('ege',8,[goal(7,['e1'])]),
 ],studentData:{solvedByTask:{101:{python:{solved:['p1']}}}}});
 assert.deepEqual(stats.map(s=>s.id),['ege']);assert.equal(stats[0].percent,0);
});
