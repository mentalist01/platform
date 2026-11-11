import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import WebSocket from 'ws';
import {WebsocketProvider} from 'y-websocket';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {pythonExplanationBoardRoom} from '../src/utils/pythonExplanationBoard.js';
import {PYTHON_PRESENCE, PYTHON_SUMMON, pythonSummonTarget} from '../src/utils/pythonLessonPresence.js';

test('individual Python presence works outside Python and only the owner can summon',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(),clients=[];
  const room=pythonExplanationBoardRoom('teacher-a','student-a')+'~pages';
  const wait=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error('Presence timeout');};
  const connect=async id=>{
    const doc=new Y.Doc(),provider=new WebsocketProvider(f.base.replace('http','ws')+'/collab',room,doc,
      {WebSocketPolyfill:WebSocket,params:{_auth:f.tokens[id]},disableBc:true});
    clients.push({doc,provider});await wait(()=>provider.synced);return {doc,provider};
  };
  try{
    const t=await connect('teacher-a'),s=await connect('student-a');
    s.provider.awareness.setLocalStateField(PYTHON_PRESENCE,{userId:'student-a',role:'student',location:{view:'homework'}});
    await wait(()=>Array.from(t.provider.awareness.getStates().values()).some(v=>v[PYTHON_PRESENCE]?.location.view==='homework'));
    const command={id:'call-1',teacherId:'teacher-a',studentId:'student-a',clientId:s.doc.clientID,
      location:{view:'python',taskNumber:101,questionIndex:0,questionId:'python-question'}};
    t.provider.awareness.setLocalStateField(PYTHON_PRESENCE,{userId:'teacher-a',role:'teacher',summonId:command.id});
    t.doc.getMap('pageControl').set(PYTHON_SUMMON,command);
    await wait(()=>pythonSummonTarget(s.doc.getMap('pageControl').get(PYTHON_SUMMON),{
      teacherId:'teacher-a',studentId:'student-a',clientId:s.doc.clientID,peers:s.provider.awareness.getStates()}));
    s.doc.getMap('pageControl').set(PYTHON_SUMMON,{...command,id:'forged'});
    await new Promise(r=>setTimeout(r,250));
    assert.equal(t.doc.getMap('pageControl').get(PYTHON_SUMMON).id,'call-1','student cannot write the summon channel');
    s.provider.awareness.setLocalStateField(PYTHON_PRESENCE,{userId:'student-a',role:'student',appliedId:'call-1',location:command.location});
    await wait(()=>Array.from(t.provider.awareness.getStates().values()).some(v=>v[PYTHON_PRESENCE]?.appliedId==='call-1'));
    for(const id of ['student-b','student-c','teacher-b']){
      await assert.rejects(new Promise((resolve,reject)=>{
        const ws=new WebSocket(f.base.replace('http','ws')+'/collab/'+encodeURIComponent(room)+'?_auth='+f.tokens[id]);
        ws.once('error',reject);ws.once('open',()=>{ws.close();resolve();});
      }),/403/);
    }
  }finally{for(const {doc,provider}of clients){provider.destroy();doc.destroy();}await f.stop();}
});
