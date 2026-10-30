import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPythonGroupProgress, pythonGroupQuestionStatus } from './pythonGroupProgress.js';

const students=[{id:'a',teacherId:'t',name:'Андрей'},{id:'b',teacherId:'t',name:'Алексей'},{id:'left',teacherId:'t',name:'Бывший участник'},{id:'foreign',teacherId:'other',name:'Посторонний'}];
const group={id:'g',teacherId:'t',members:[{studentId:'a',status:'active'},{studentId:'b',status:'active'},{studentId:'left',status:'left'},{studentId:'foreign',status:'active'}]};
const testsDb={101:{python:['first','second','both','none'].map(id=>({id}))}};
const solved=ids=>({solvedByTask:{101:{python:{solved:ids,codeById:{secret:'not returned'}}}}});

test('group topic counts the union while each task counts individual solvers',()=>{
  const progress=buildPythonGroupProgress({group,students,testsDb,progressDb:{a:solved(['first','both']),b:solved(['second','both'])}});
  assert.equal(progress.memberCount,2);
  assert.deepEqual([progress.topics[101].coveredCount,progress.topics[101].completedCount,progress.topics[101].percent],[3,1,75]);
  assert.deepEqual(pythonGroupQuestionStatus(progress,101,'first'),{solvedCount:1,totalCount:2,solvedStudentIds:['a'],state:'partial',unsolvedNames:['Алексей'],label:'1 из 2',detail:'Ещё не решили: Алексей'});
  assert.equal(pythonGroupQuestionStatus(progress,101,'both').state,'complete');
  assert.equal(pythonGroupQuestionStatus(progress,101,'none').state,'new');
  assert.equal(JSON.stringify(progress).includes('secret'),false);
});

test('removed tasks, duplicates, former members and foreign teachers never inflate progress',()=>{
  const progress=buildPythonGroupProgress({group:{...group,members:[...group.members,group.members[0]]},students,
    testsDb:{101:{python:[{id:'first'},{id:'first'},{id:'both'}]}},progressDb:{a:solved(['first','first','removed']),left:solved(['both']),foreign:solved(['both'])}});
  assert.equal(progress.memberCount,2);assert.equal(progress.topics[101].totalQuestions,2);
  assert.equal(progress.topics[101].coveredCount,1);assert.equal(progress.topics[101].completedCount,0);
});

test('empty membership has no vacuously completed questions and a newly enrolled pupil starts unsolved',()=>{
  const empty=buildPythonGroupProgress({group:{...group,members:[]},students,testsDb});
  assert.equal(empty.topics[101].completedCount,0);assert.equal(empty.topics[101].percent,0);
  assert.equal(pythonGroupQuestionStatus(empty,101,'first').state,'new');
  const newMember=buildPythonGroupProgress({group,students,testsDb,progressDb:{a:solved(['both'])}});
  assert.equal(pythonGroupQuestionStatus(newMember,101,'both').label,'1 из 2');
  assert.equal(pythonGroupQuestionStatus(null,101,'both'),null);
});
