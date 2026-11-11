import test from 'node:test';
import assert from 'node:assert/strict';
import {pythonPresenceLocation, normalizePythonLocation, pythonLocationLabel, selectPythonPeer, pythonSummonTarget, samePythonTask, PYTHON_PRESENCE, hasPythonEditorPeer, pythonPresenceDisplay, pythonPeerTaskPosition} from './pythonLessonPresence.js';

const location={view:'python',taskNumber:101,questionIndex:2,questionId:'q3',questionNumber:1,questionTitle:'Сумма',topicTitle:'Ввод и вывод',subsectionTitle:'Числа'};
test('navigation markers follow stable question IDs and never mark another topic or a missing task',()=>{
  const model={questions:[{id:'q3'},{id:'q1'}],subsections:[{id:'numbers',questionIndexes:[0]},{id:'exact',questionIndexes:[1]}]};
  const peer={location};
  assert.deepEqual(pythonPeerTaskPosition(peer,101,model),{questionIndex:0,subsectionId:'numbers'});
  assert.equal(pythonPeerTaskPosition(peer,102,model),null);
  assert.equal(pythonPeerTaskPosition({...peer,location:{...location,questionId:'deleted'}},101,model),null);
  assert.equal(pythonPeerTaskPosition({...peer,location:{...location,view:'homework'}},101,model),null);
  assert.equal(pythonPeerTaskPosition({...peer,location:{...location,groupMode:true}},101,model),null);
  assert.equal(pythonPeerTaskPosition(null,101,model),null);
});
test('legacy editor presence suggests refreshing without claiming the pupil is offline',()=>{
  const states=new Map([[1,{user:{role:'teacher'}}],[2,{user:{role:'teacher'}}]]);
  assert.equal(hasPythonEditorPeer(states,{role:'teacher',clientId:1}),false);
  states.set(3,{user:{role:'student'}});
  const editorPeerPresent=hasPythonEditorPeer(states,{role:'teacher',clientId:1});
  assert.equal(editorPeerPresent,true);
  assert.deepEqual(pythonPresenceDisplay({connected:true,peer:null,editorPeerPresent,teacher:true}),
    {online:true,refreshNeeded:true,label:'Попросите ученика обновить страницу'});
  assert.equal(pythonPresenceDisplay({connected:false,peer:null,editorPeerPresent,teacher:false}).label,'Попросите учителя обновить страницу');
  assert.deepEqual(pythonPresenceDisplay({connected:true,peer:null}),
    {online:false,refreshNeeded:false,label:'Местоположение пока недоступно'});
  assert.equal(pythonPresenceDisplay({connected:false,peer:null}).label,'Подключаемся…');
  const modern=pythonPresenceDisplay({connected:true,peer:{location,role:'student'},editorPeerPresent,teacher:true});
  assert.equal(modern.refreshNeeded,false);
  assert.equal(modern.label,pythonLocationLabel(location));
  states.delete(3);
  assert.equal(hasPythonEditorPeer(states,{role:'teacher',clientId:1}),false);
  assert.equal(hasPythonEditorPeer(new Map([[1,{user:{role:'student'}}]]),{role:'student',clientId:1}),false);
});
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
