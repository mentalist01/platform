import test from 'node:test';
import assert from 'node:assert/strict';
import {isGroupLessonAssigned, participationOccurrence, requiredGroupLessonParticipants} from './groupParticipation.js';
import {normalizeLearningGroup,normalizeLearningLessonSession,updateLearningLessonSession} from '../../server/learningGroups.js';
test('dated participation history applies in Moscow without changing previous lessons or other members',()=>{
  const group=normalizeLearningGroup({id:'g',teacherId:'t',name:'Group',members:[{studentId:'a',participationPlans:[{from:'2026-10-01',mode:'selected',slots:['wednesday|20:00']},{from:'2026-11-01',mode:'all',slots:[]}]},{studentId:'b'}]});
  const friday={id:'l',groupId:'g',teacherId:'t',participantIds:['a','b'],startAt:'2026-10-02T17:00:00Z',status:'completed',durationMinutes:60};
  assert.equal(isGroupLessonAssigned(group,'a',friday),false);
  assert.equal(isGroupLessonAssigned(group,'b',friday),true);
  assert.equal(isGroupLessonAssigned(group,'a',{...friday,startAt:'2026-09-25T17:00:00Z'}),true);
  assert.equal(isGroupLessonAssigned(group,'a',{...friday,startAt:'2026-11-06T17:00:00Z'}),true);
  assert.deepEqual(requiredGroupLessonParticipants(group,friday),['b']);
  assert.equal(isGroupLessonAssigned(group,'a',{...friday,participationOverrides:{a:true}}),true);
  assert.deepEqual(participationOccurrence({startAt:'2026-10-01T22:30:00Z'}),{day:'2026-10-02',time:'01:30',slot:'friday|01:30'});
});
test('rescheduling an assigned lesson preserves its participation slot and normalization preserves exceptions',()=>{
  const group={members:[{studentId:'a',participationPlans:[{from:'2026-10-01',mode:'selected',slots:['wednesday|20:00']}]}]};
  const lesson=normalizeLearningLessonSession({id:'l',groupId:'g',teacherId:'t',participantIds:['a'],startAt:'2026-10-07T17:00:00Z',participationOverrides:{a:true,outsider:false}});
  const moved=updateLearningLessonSession(lesson,{startAt:'2026-10-09T18:00:00Z'});
  assert.equal(moved.participationSlot,'wednesday|20:00');
  assert.equal(isGroupLessonAssigned(group,'a',{...moved,participationOverrides:{}}),true);
  assert.deepEqual(moved.participationOverrides,{a:true});
});
test('saving or editing a plan today preserves lessons that already started today',()=>{
  const group={members:[{studentId:'a',participationPlans:[
    {from:'2026-10-01',effectiveAt:'2026-10-01T09:00:00+03:00',mode:'selected',slots:['thursday|12:00']},
    {from:'2026-10-01',effectiveAt:'2026-10-01T15:00:00+03:00',mode:'selected',slots:['friday|20:00']},
  ]}]};
  const lesson=time=>({startAt:`2026-10-01T${time}:00+03:00`});
  assert.equal(isGroupLessonAssigned(group,'a',lesson('08:00')),true);
  assert.equal(isGroupLessonAssigned(group,'a',lesson('12:00')),true);
  assert.equal(isGroupLessonAssigned(group,'a',lesson('14:00')),false);
  assert.equal(isGroupLessonAssigned(group,'a',lesson('20:00')),false);
});
