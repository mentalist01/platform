import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudyPlan} from './egeStudyPlan.js';
import {splitStudyStage,withStudyStages,studyPlanStages} from './studyPlanStages.js';
import {studyPlanSubjects,groupStudySubject} from './studySubjects.js';
import {studyMatchProfiles,matchStudyStudents} from './studyMatching.js';
import {searchStudyStudents} from './studyStudentSearch.js';

const pupil=id=>({id,name:`Ученик ${id}`,grade:'11'});
const record=(blockId='17',partNumber=1)=>({current:{blockId,partNumber,updatedAt:'2026-10-26T00:00:00Z'},completed:{},links:{}});
test('active groups replace only their current members in the plan and pupil matching pool',()=>{
  const students=['a','b','c','d'].map(pupil);students.push({...pupil('former'),studyStatus:'inactive'});
  const groups=[{id:'g',name:'Группа 2',status:'active',members:[{studentId:'a',status:'active'},{studentId:'b',status:'removed'}]},{id:'draft',name:'Группа 3',status:'ready',participantIds:['c']}];
  const result=studyPlanSubjects(students,groups);assert.deepEqual(result.individuals.map(s=>s.id),['b','c','d']);assert.equal(result.subjects[0].id,groupStudySubject('g'));
  assert.equal(searchStudyStudents(result.subjects,'группа 2')[0].groupId,'g');assert.equal(searchStudyStudents(result.subjects,'ученик a')[0].groupId,'g');
  assert.equal(studyMatchProfiles(createStudyPlan(),{},students,groups).some(p=>p.student.id==='a'),false);
});
test('only known plan stages are compared; unknown and completed routes never count as beginners',()=>{
  const plan=createStudyPlan(),records={a:record(),b:record(),c:record('99'),d:{...record('26',8),current:{...record('26',8).current,completed:true}}};
  const profiles=studyMatchProfiles(plan,records,['a','b','c','d','e'].map(pupil));
  const result=matchStudyStudents(profiles);assert.equal(result.groups.length,1);assert.deepEqual(result.groups[0].members.map(p=>p.student.id),['a','b']);assert.equal(result.unknown.length,3);
  assert.match(profiles.find(p=>p.student.id==='d').reason,/завершён/);
});
test('matching can make two pairs or groups of three and two without dropping a pupil needlessly',()=>{
  const plan=createStudyPlan(),students=['a','b','c','d','e'].map(pupil),profiles=studyMatchProfiles(plan,Object.fromEntries(students.map(s=>[s.id,record()])),students);
  const pairs=matchStudyStudents(profiles);assert.equal(pairs.covered,4);assert.equal(pairs.groups.length,2);assert.equal(pairs.unmatched.length,1);
  const groups=matchStudyStudents(profiles,{maxSize:3});assert.equal(groups.covered,5);assert.deepEqual(groups.groups.map(g=>g.members.length).sort(),[2,3]);
  const chosen=matchStudyStudents(profiles,{selectedIds:['a','e']});assert.deepEqual(chosen.groups[0].members.map(p=>p.student.id),['a','e']);
  assert.equal(matchStudyStudents(profiles,{selectedIds:[]}).groups.length,0);
});
test('adjacent mode obeys the teacher route and never joins a chain spanning several stages',()=>{
  const plan=createStudyPlan(),profiles=studyMatchProfiles(plan,{a:record('7',1),b:record('7',2),c:record('7',3),d:record('26',8)},['a','b','c','d'].map(pupil));
  assert.equal(matchStudyStudents(profiles).covered,0);
  const nearby=matchStudyStudents(profiles,{maxSize:4,tolerance:1});assert.equal(nearby.covered,2);assert.ok(nearby.groups.every(g=>g.spread<=1));assert.ok(nearby.unmatched.some(p=>p.student.id==='d'));
});
test('split topics are compared at their actual route positions, and completed parts advance to the next topic',()=>{
  const source=splitStudyStage(createStudyPlan(),'26',2),stages=studyPlanStages(source),early=stages.pop();assert.equal(early.id,'26~3');
  const first=stages.pop();stages.splice(stages.findIndex(s=>s.id==='22')+1,0,first);stages.push(early);const plan=withStudyStages(source,stages);
  const a=record('26',2);a.current.completed=true;a.completed['26:2']='yes';
  const profiles=studyMatchProfiles(plan,{a,b:record('5'),c:record('26',3)},['a','b','c'].map(pupil)),result=matchStudyStudents(profiles);
  assert.deepEqual(result.groups[0].members.map(p=>p.student.id),['a','b']);assert.equal(profiles[0].position.blockId,'5');assert.ok(profiles[2].at>profiles[1].at+2);
});
