import test from 'node:test';
import assert from 'node:assert/strict';
import {groupHomeworkTracks,isGroupHomeworkTrackAllowed,groupHomeworkRecipients} from './groupHomeworkTracks.js';
import {normalizeLearningGroupMember,createLearningAssignment} from '../../server/learningGroups.js';
import {groupHomeworkMembershipProjection,isGroupHomeworkRequired} from '../../server/groupHomeworkMembership.js';

test('direction is explicit enrollment, independent of weekday, price and missed attendance',()=>{
  const a={studentId:'a',status:'active',homeworkStudyTrack:'ege',participationPlans:[{from:'2026-10-01',mode:'selected',slots:['wednesday|20:00']}]};
  const b={studentId:'b',status:'active'},group={id:'g',teacherId:'t',name:'Группа',members:[a,b]};
  assert.equal(normalizeLearningGroupMember(a).homeworkStudyTrack,'ege');
  assert.equal(normalizeLearningGroupMember(b).homeworkStudyTrack,'all');
  assert.deepEqual(groupHomeworkRecipients(group,{homework:{studyTrack:'python'}},['a','b']),['b']);
  assert.deepEqual(groupHomeworkRecipients(group,{homework:{studyTrack:'ege'}},['a','b']),['a','b']);
  assert.deepEqual(createLearningAssignment(group,{title:'Python',homework:{studyTrack:'python'}},{id:'work'}).recipientIds,['b']);
  assert.equal(isGroupHomeworkTrackAllowed({studyTrack:'ege'}, {...a,homeworkStudyTrack:'python'}),false);
});

test('legacy goals identify Python and mocks without guessing from free-form notes',()=>{
  assert.deepEqual(groupHomeworkTracks({goals:[{taskNumber:105}]}),['python']);
  assert.deepEqual(groupHomeworkTracks({taskNumber:105,levelId:'python'}),['python']);
  for(const value of [null,{}, {goals:{}}, {goals:[null,undefined]}]) assert.deepEqual(groupHomeworkTracks(value),[]);
  assert.deepEqual(groupHomeworkTracks({goals:[{type:'mock',mockExamId:'m'}]}),['ege']);
  assert.equal(isGroupHomeworkTrackAllowed({homeWork:'Рассказ о Python'}, {homeworkStudyTrack:'ege'}),true);
  const entry={source:'learning-group',goals:[{taskNumber:105}],issuedAt:'2026-10-01T12:00Z'};
  const group={members:[{studentId:'a',status:'active',homeworkStudyTrack:'ege',homeworkStudyTrackUpdatedAt:'2026-10-16T12:00Z'}]};
  const projection=groupHomeworkMembershipProjection(entry,group,'a','assigned');
  assert.equal(projection.learningHomeworkTrackExcluded,true);
  assert.equal(projection.learningAssignmentStatus,'closed');
  assert.equal(isGroupHomeworkRequired(entry,group,'a'),false);
  assert.equal(isGroupHomeworkRequired({...entry,source:'individual'},group,'a'),true);
  group.members[0].homeworkStudyTrack='all';
  assert.equal(isGroupHomeworkRequired({...entry,...projection},group,'a'),false);
  assert.equal(isGroupHomeworkRequired({...entry,id:'new'},group,'a'),true);
});
