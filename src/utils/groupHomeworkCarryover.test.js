import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGroupHomeworkCarryover } from './groupHomeworkCarryover.js';
import { partitionConcurrentHomeworks } from './concurrentHomework.js';

const goal=(numbers,patch={})=>({type:'task',taskNumber:7,levelId:'basic',targetQuestions:numbers,targetQuestionIds:numbers.map(n=>`q${n}`),...patch});
const parent={id:'new',source:'learning-group',learningGroupId:'g',learningAssignmentId:'a',studyTrack:'ege',learningAssignmentTitle:'Домашняя работа · ЕГЭ',goals:[goal([4,7])],dueAt:'2026-10-30T20:00Z'};
const child=(id,goals,patch={})=>({...parent,id,learningEgeCarryover:true,goals,...patch});

test('old and new numbers of the same task form one sorted list and one ordinary card',()=>{
  const input=[parent,child('old1',[goal([2,5,7])]),child('old2',[goal([1,5])])],before=structuredClone(input);
  const result=partitionConcurrentHomeworks(input,Date.parse('2026-10-15')).active;
  assert.equal(result.length,1);assert.equal(result[0].learningAssignmentTitle,parent.learningAssignmentTitle);
  assert.equal(result[0].goals.length,1);
  assert.deepEqual(result[0].goals[0].targetQuestions,[1,2,4,5,7]);
  assert.deepEqual(result[0].goals[0].targetQuestionIds,['q1','q2','q4','q5','q7']);
  assert.deepEqual(input,before);
  assert.deepEqual(mergeGroupHomeworkCarryover(mergeGroupHomeworkCarryover(input)),mergeGroupHomeworkCarryover(input));
});

test('different tasks, levels, optional goals and new materials keep their own identity',()=>{
  const material={id:'v',title:'Видео'};
  const result=mergeGroupHomeworkCarryover([{...parent,learningMaterials:[material],goals:[goal([4]),goal([1],{assignmentTier:'optional'})]},
    child('old',[goal([2]),goal([3],{levelId:'advanced'}),goal([1],{taskNumber:4})])])[0];
  assert.equal(result.goals.length,4);
  assert.deepEqual(result.goals[0].targetQuestions,[2,4]);
  assert.deepEqual(result.goals[1].targetQuestions,[1]);
  assert.equal(result.goals[2].levelId,'advanced');assert.equal(result.goals[3].taskNumber,4);
  assert.deepEqual(result.learningMaterials,[material]);
});

test('withdrawals and Python cannot receive old EGE targets; children never create extra history cards',()=>{
  for(const patch of [{learningHomeworkCancelledAt:'2026-10-14'},{learningMembershipEndedAt:'2026-10-14'},{studyTrack:'python'}]){
    const result=mergeGroupHomeworkCarryover([{...parent,...patch},child('old',[goal([1])])]);
    assert.deepEqual(result[0].goals,parent.goals);assert.equal(result.length,1);
  }
  const history=partitionConcurrentHomeworks([{...parent,learningAssignmentStatus:'closed'},child('old',[goal([1])])]);
  assert.equal(history.active.length,0);assert.equal(history.history.length,1);
  assert.deepEqual(history.history[0].goals[0].targetQuestions,[1,4,7]);
});

test('group identity and question IDs prevent folding another group or substituting a reordered question',()=>{
  const other=child('other',[goal([1])],{learningGroupId:'other'});
  const values=mergeGroupHomeworkCarryover([parent,other,child('old',[goal([9],{targetQuestionIds:['q4']})])]);
  assert.deepEqual(values[0].goals[0].targetQuestionIds,['q4','q7']);
  assert.deepEqual(partitionConcurrentHomeworks(values,Date.parse('2026-10-15')).active.map(x=>x.id),['new']);
});
