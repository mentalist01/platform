import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_SHARED_CODE_ID, groupCodeRoom, groupCodeTabs } from './groupCodeRooms.js';
import { authorizeLearningCollabUpgrade } from '../../server/learningLessonAccess.js';

test('group code opens shared room first and preserves existing student document IDs', () => {
  const roster = [{id:'a',name:'Аня'}, {id:'b',name:'Борис'}];
  assert.deepEqual(groupCodeTabs(roster,'teacher','t').map(p=>p.id), [GROUP_SHARED_CODE_ID,'a','b']);
  assert.deepEqual(groupCodeTabs(roster,'student','a').map(p=>p.id), [GROUP_SHARED_CODE_ID,'a']);
  assert.equal(groupCodeRoom('lesson-a','a'),'collab-lesson-lesson-a~student~a');
  assert.equal(groupCodeRoom('lesson-a',GROUP_SHARED_CODE_ID),'collab-lesson-lesson-a');
  const session={id:'lesson-a',groupId:'g',teacherId:'t',participantIds:['a','b'],status:'active',startAt:new Date().toISOString(),durationMinutes:60};
  const group={id:'g',teacherId:'t',status:'active',members:roster.map(p=>({studentId:p.id,status:'active'}))};
  const access=(role,id,target)=>authorizeLearningCollabUpgrade({auth:{role,id,teacherId:'t'},requestUrl:`/collab/${groupCodeRoom(session.id,target)}`,sessions:[session],groups:[group]});
  assert.equal(access('student','a',GROUP_SHARED_CODE_ID).allowed,true);
  assert.equal(access('student','a',GROUP_SHARED_CODE_ID).readOnly,true);
  assert.equal(access('teacher','t',GROUP_SHARED_CODE_ID).readOnly,false);
  assert.equal(access('student','a','a').readOnly,false);
  assert.equal(access('student','a','b').allowed,false);
  assert.equal(access('teacher','t','b').allowed,true);
});
