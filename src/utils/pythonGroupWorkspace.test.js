import test from 'node:test';import assert from 'node:assert/strict';
import {pythonGroupBoardRoom,pythonGroupCodeBase,livePythonGroupTask,livePythonLessonTask,pythonLessonTeacherPresent,pythonLessonTaskControl} from './pythonGroupWorkspace.js';
import {livePythonExplanation} from './pythonExplanationBoard.js';
import {authorizeLearningCollabUpgrade} from '../../server/learningLessonAccess.js';
const teacher={id:'teacher-a',role:'teacher'},pupil={id:'student-a',role:'student',teacherId:'teacher-a'},other={id:'student-b',role:'student',teacherId:'teacher-a'};
const students=[{id:'student-a',teacherId:'teacher-a'},{id:'student-b',teacherId:'teacher-a'}],groups=[{id:'group-a',teacherId:'teacher-a',status:'active',members:[{studentId:'student-a',status:'active'}]}];
const code=`py-collab:${pythonGroupCodeBase('group-a')}:205:python:question-one`,board=pythonGroupBoardRoom('group-a');
const access=(auth,room=code,overrides={})=>authorizeLearningCollabUpgrade({auth,requestUrl:'/collab/'+encodeURIComponent(room),students,groups,...overrides});
test('only current members and the group teacher access shared Python code and board',()=>{
  for(const room of[code,board,board+'~pages']){assert.equal(access(teacher,room).allowed,true);assert.equal(access(pupil,room).allowed,true);for(const auth of[null,other,{id:'teacher-b',role:'teacher'}])assert.equal(access(auth,room).allowed,false);}
  assert.equal(access(pupil,board+'~pages').readOnly,true);assert.equal(access(pupil,code).readOnly,false);
  assert.equal(access(pupil,code,{groups:[{...groups[0],members:[{studentId:pupil.id,status:'left'}]}]}).allowed,false);
  assert.equal(access(pupil,code,{students:[{...students[0],deletedAt:'2026-10-13'}]}).allowed,false);
  assert.equal(access(pupil,code,{groups:[{...groups[0],status:'completed'}]}).readOnly,true);
});
test('group namespaces reject malformed IDs and keep individual code independent',()=>{
  for(const id of['','../other','a:b','a~pages','a'.repeat(161)])assert.equal(pythonGroupBoardRoom(id),'');
  assert.notEqual(pythonGroupCodeBase('group-a'),pythonGroupCodeBase('group-b'));
  for(const room of[code+'/other',code.replace(':205:',':invalid:'),code.replace('group-a','group-b'),board+'~student~student-b'])assert.equal(access(pupil,room).allowed,false);
  assert.equal(access(pupil,'py-collab:py-sync:student-a:205:python:question-one').allowed,true);
});
test('students follow only a current teacher task and the matching group explanation',()=>{
  const command={id:'live',teacherId:teacher.id,groupId:'group-a',open:true,taskNumber:205,questionIndex:1},peers=[{pythonGroupTask:{id:'live',userId:teacher.id}}];
  assert.equal(livePythonGroupTask(command,peers,teacher.id,'group-a'),command);
  assert.equal(livePythonGroupTask(command,[],teacher.id,'group-a'),null);
  assert.equal(livePythonGroupTask(command,peers,teacher.id,'group-b'),null);
  assert.equal(livePythonGroupTask({...command,questionIndex:-1},peers,teacher.id,'group-a'),null);
  const boardPeers=[{pythonExplanation:{id:'live',open:true,userId:teacher.id}}];
  assert.equal(livePythonExplanation(command,boardPeers,teacher.id,pupil.id,'group-a'),command);
  assert.equal(livePythonExplanation(command,boardPeers,teacher.id,pupil.id,'group-b'),null);
});

test('individual lessons follow a live teacher without adopting another student or group task',()=>{
  const command={id:'individual-live',teacherId:teacher.id,studentId:pupil.id,active:true,open:true,taskNumber:105,questionIndex:2};
  const peers=[{pythonIndividualTask:{id:command.id,userId:teacher.id}}];
  const context={teacherId:teacher.id,studentId:pupil.id};
  assert.equal(livePythonLessonTask(command,peers,context),command);
  assert.equal(livePythonLessonTask(command,[],context),null,'Old saved tasks do not open after the teacher leaves');
  assert.equal(livePythonLessonTask(command,[{pythonIndividualTask:{id:command.id,userId:other.id}}],context),null);
  assert.equal(livePythonLessonTask(command,peers,{...context,studentId:other.id}),null);
  assert.equal(livePythonLessonTask({...command,groupId:'group-a'},peers,context),null);
  assert.equal(livePythonLessonTask({...command,questionIndex:-1},peers,context),null);
  assert.equal(livePythonLessonTask({...command,questionIndex:1.5},peers,context),null);
  assert.equal(livePythonLessonTask({...command,taskNumber:'invalid'},peers,context),null);
  assert.equal(pythonLessonTeacherPresent(command,peers,teacher.id),true);
  assert.equal(pythonLessonTeacherPresent({...command,active:false},peers,teacher.id),false);
  const close={...command,id:'closed',active:false,open:false};
  assert.equal(livePythonLessonTask(close,[],context),close,'A current lesson can close on teacher exit');
});

test('group discovery and individual navigation use separate live control channels',()=>{
  const command={id:'group-live',teacherId:teacher.id,groupId:'group-a',open:true,active:true,taskNumber:105,questionIndex:0};
  const peers=[{pythonGroupTask:{id:command.id,userId:teacher.id}}];
  assert.notEqual(pythonLessonTaskControl('group-a'),pythonLessonTaskControl(''));
  assert.equal(livePythonLessonTask(command,peers,{teacherId:teacher.id,studentId:pupil.id,groupId:'group-a'}),command);
  assert.equal(pythonLessonTeacherPresent(command,peers,teacher.id,'group-a'),true);
  assert.equal(pythonLessonTeacherPresent(command,[],teacher.id,'group-a'),false);
  assert.equal(pythonLessonTeacherPresent(command,peers,teacher.id),false);
});
