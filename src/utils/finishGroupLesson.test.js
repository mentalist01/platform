import test from 'node:test';
import assert from 'node:assert/strict';
import {canFinishGroupLesson,finishGroupLesson} from './finishGroupLesson.js';

test('only a started editable group lesson exposes finish, including a stale scheduled client after channel exit',()=>{
  const lesson={groupId:'g',lessonId:'l',startsAt:new Date(Date.now()-60000).toISOString(),status:'scheduled'};
  assert.equal(canFinishGroupLesson(lesson),true);
  for(const patch of [{groupId:''},{lessonId:''},{readOnly:true},{notStarted:true},{status:'completed'},{status:'cancelled'},{startsAt:new Date(Date.now()+60000).toISOString()}])assert.equal(canFinishGroupLesson({...lesson,...patch}),false);
  assert.equal(canFinishGroupLesson({...lesson,status:'active',startsAt:''}),true);
});

test('finishing closes the server lesson before stopping only its recording, retaining unrelated jobs',async()=>{
  const calls=[];
  const transport={
    updateLearningGroupLesson:async(g,l,p)=>{calls.push(['finish',g,l,p]);return{lesson:{id:l,status:'completed'}};},
    desktopRecording:async(action,payload)=>{calls.push([action||'settings',payload]);return{jobs:[
      {id:'own',desired:'record',occurrence:{lessonId:'l'}},
      {id:'next',desired:'record',occurrence:{lessonId:'next'}},
      {id:'individual',desired:'record',occurrence:{studentId:'a'}},
      {id:'saved',desired:'stop',occurrence:{lessonId:'l'}},
    ]};},
  };
  const result=await finishGroupLesson({transport,groupId:'g',lessonId:'l',beforeFinish:async()=>{calls.push(['flush']);}});
  assert.equal(result.status,'completed');
  assert.deepEqual(calls,[['flush'],['finish','g','l',{status:'completed'}],['settings',undefined],['stop',{id:'own',endRecording:true}]]);
});

test('a recorder stop failure remains retryable even when the server already completed the lesson',async()=>{
  let stops=0;
  const transport={
    updateLearningGroupLesson:async()=>{throw Error('Already finished');},
    getLearningGroupLesson:async()=>({lesson:{id:'l',status:'completed'}}),
    desktopRecording:async(action)=>{if(!action)return{jobs:[{id:'own',desired:'record',occurrence:{lessonId:'l'}}]};if(++stops===1)throw Error('Recording connection interrupted');},
  };
  const args={transport,groupId:'g',lessonId:'l'};
  await assert.rejects(finishGroupLesson(args),/Recording connection/);
  assert.equal((await finishGroupLesson(args)).status,'completed');
  assert.equal(stops,2);
});

test('network/authorization errors do not claim success or stop another recording',async()=>{
  let queried=false;
  const transport={updateLearningGroupLesson:async()=>{throw Error('Forbidden');},getLearningGroupLesson:async()=>{throw Error('Forbidden');},desktopRecording:async()=>{queried=true;}};
  await assert.rejects(finishGroupLesson({transport,groupId:'g',lessonId:'l'}),/Forbidden/);
  assert.equal(queried,false);
});
