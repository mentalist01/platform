import test from 'node:test';import assert from 'node:assert/strict';
import {pythonGroupBoardRoom,pythonGroupCodeBase,livePythonGroupTask} from './pythonGroupWorkspace.js';
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
