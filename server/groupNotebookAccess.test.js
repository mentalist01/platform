import test from 'node:test';import assert from 'node:assert/strict';
import {authorizeLearningCollabUpgrade} from './learningLessonAccess.js';
const group={id:'g',teacherId:'t',status:'active',members:[{studentId:'a',status:'active'},{studentId:'b',status:'active'}]};
const options={groups:[group],sessions:[{id:'ended',groupId:'g',teacherId:'t',participantIds:['a','b'],status:'completed'}],students:[{id:'a',teacherId:'t'},{id:'b',teacherId:'t'},{id:'c',teacherId:'t'}]};
const access=(room,auth,extra={})=>authorizeLearningCollabUpgrade({...options,...extra,auth,requestUrl:'/collab/'+room});
test('permanent notebook is independent of lesson status and retains group/private access boundaries',()=>{
 for(const room of ['board-group-g','board-group-g~pages','board-group-g~page~page-test-1','collab-group-g','collab-group-g~student~a']) {
   const result=access(room,{role:'teacher',id:'t'});assert.equal(result.allowed,true,room);assert.equal(result.readOnly,false,room);
   assert.equal(access(room,{role:'teacher',id:'other'}).allowed,false);
   assert.equal(access(room,{role:'student',id:'c',teacherId:'t'}).allowed,false);
 }
 assert.equal(access('collab-group-g~student~a',{role:'student',id:'a',teacherId:'t'}).readOnly,false);
 assert.equal(access('collab-group-g',{role:'student',id:'a',teacherId:'t'}).readOnly,true);
 assert.equal(access('board-group-g~pages',{role:'student',id:'a',teacherId:'t'}).readOnly,true);
 assert.equal(access('board-group-g~student~b',{role:'student',id:'a',teacherId:'t'}).allowed,false);
 assert.equal(access('collab-group-g~student~b',{role:'student',id:'a',teacherId:'t'}).allowed,false);
 assert.equal(access('board-group-missing',{role:'teacher',id:'t'}).allowed,false);
 assert.equal(access('board-group-g',{role:'teacher',id:'t'},{groups:[{...group,status:'completed'}]}).readOnly,true);
 assert.equal(access('board-group-g',{role:'student',id:'a',teacherId:'t'},{groups:[{...group,members:[{studentId:'a',status:'removed'}]}]}).allowed,false);
});
