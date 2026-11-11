import test from 'node:test';
import assert from 'node:assert/strict';
import {pythonPresenceLocation, normalizePythonLocation, pythonLocationLabel, selectPythonPeer, pythonSummonTarget, samePythonTask, PYTHON_PRESENCE} from './pythonLessonPresence.js';

const location={view:'python',taskNumber:101,questionIndex:2,questionId:'q3',questionNumber:1,questionTitle:'Сумма',topicTitle:'Ввод и вывод',subsectionTitle:'Числа'};
test('presence shows the topic, subsection and local task number without leaking answers or code',()=>{
  const entry={pythonSubsections:[{id:'strings',title:'Строки'},{id:'numbers',title:'Числа'}],python:[
    {id:'q1',subsectionId:'strings'},{id:'q2',subsectionId:'strings'},{id:'q3',title:'Сумма',subsectionId:'numbers',answer:'secret',starterCode:'private'}]};
  const value=pythonPresenceLocation({task:{number:101,title:'Ввод и вывод'},questionIndex:2,testsDb:{101:entry},levelId:'python'});
  assert.deepEqual(value,location);
  assert.equal(pythonLocationLabel(value),'Ввод и вывод → Числа → №1 · Сумма');
  assert.equal(pythonLocationLabel(normalizePythonLocation(value,'homework')),'Домашка');
  assert.equal(normalizePythonLocation({taskNumber:'invalid',questionIndex:-1}).taskNumber,undefined);
});
test('multiple windows select the focused pupil tab, never another pupil or the teacher',()=>{
  const peer=(id,role,focused,activityAt)=>({[PYTHON_PRESENCE]:{userId:id,role,focused,visible:true,activityAt,location}});
  const states=new Map([[1,peer('p','student',false,10)],[2,peer('p','student',true,2)],[3,peer('t','teacher',true,100)],[4,peer('other','student',true,200)]]);
  assert.equal(selectPythonPeer(states,{userId:'p',role:'student'}).clientId,2);
  assert.equal(selectPythonPeer(new Map(),{userId:'p',role:'student'}),null);
});
test('summon requires a live teacher, matching ownership and the selected browser tab',()=>{
  const command={id:'now',teacherId:'t',studentId:'p',clientId:7,location};
  const peers=new Map([[1,{[PYTHON_PRESENCE]:{userId:'t',role:'teacher',summonId:'now'}}]]);
  const scope={teacherId:'t',studentId:'p',clientId:7,peers};
  assert.deepEqual(pythonSummonTarget(command,scope),{...location,groupMode:false});
  for(const patch of [{clientId:8},{studentId:'another'},{teacherId:'another'},{peers:new Map()}]) assert.equal(pythonSummonTarget(command,{...scope,...patch}),null);
  assert.equal(pythonSummonTarget({...command,location:{...location,groupMode:true}},scope),null);
  assert.equal(samePythonTask({...location,view:'homework'},location),false);
  assert.equal(samePythonTask({...location,questionId:'different'},location),false);
  assert.equal(samePythonTask(location,location),true);
});
