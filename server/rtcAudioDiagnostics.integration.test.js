import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {WebSocket} from 'ws';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('audio diagnostics are scoped to the authenticated room; repairing one pair leaves the third participant joined',{timeout:30000},async t=>{
  const f=await createGroupHomeworkFixture();t.after(()=>f.stop());
  const {lesson}=await f.request(`/api/learning-groups/${f.groupId}/lessons`,f.tokens['teacher-a'],{startAt:new Date(Date.now()-60000).toISOString(),durationMinutes:60,topic:'Проверка звука'},'POST',201);
  const {channels}=await f.request(`/api/learning-groups/${f.groupId}/lessons/${lesson.id}/voice-channels`,f.tokens['teacher-a']);
  const room=channels[0].roomId,otherRoom='rtc:teacher-b:student-c';
  const connect=async(who,target=room)=>{
    const ws=new WebSocket(f.base.replace('http','ws')+'/rtc?_auth='+f.tokens[who]),inbox=[];
    ws.on('message',b=>inbox.push(JSON.parse(b.toString())));t.after(()=>ws.close());
    const take=async(type)=>{for(let i=0;i<200;i++){const n=inbox.findIndex(x=>x.type===type);if(n>=0)return inbox.splice(n,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing '+type);};
    const ready=await take('ready');ws.send(JSON.stringify({type:'join',roomId:target}));await take('joined');return {ws,inbox,id:ready.clientId,take,send:x=>ws.send(JSON.stringify(x))};
  };
  const teacher=await connect('teacher-a'),first=await connect('student-a'),second=await connect('student-b'),outsider=await connect('teacher-b',otherRoom);
  teacher.send({type:'signal',targetId:first.id,signal:{control:{restartConnection:true,preferredIceTransportPolicy:'relay'}}});
  const control=await first.take('signal');assert.equal(control.signal.control.restartConnection,true);assert.equal(control.fromId,teacher.id);
  assert.equal(second.inbox.some(x=>x.type==='signal'||x.type==='peer-left'),false);
  teacher.send({type:'audio-diagnostic',peerId:first.id,event:'blocked',code:'NotAllowedError',observerId:'forged',sdp:'secret',token:'secret'});
  teacher.send({type:'audio-diagnostic',peerId:outsider.id,event:'recovering'});
  teacher.send({type:'signal',targetId:first.id,signal:{audioProgress:{epoch:'test',packets:20,enabled:true}}});
  assert.equal((await first.take('signal')).signal.audioProgress.packets,20);
  const file=path.join(f.data,'rtc-audio-diagnostics.json');
  for(let i=0;i<150&&!fs.existsSync(file);i++)await new Promise(r=>setTimeout(r,10));
  const rows=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(rows.length,1);
  assert.equal(rows[0].observerId,'teacher-a');assert.equal(rows[0].peerId,'student-a');assert.equal(rows[0].roomId,room);
  assert.ok(!JSON.stringify(rows).includes('secret'));assert.ok(!JSON.stringify(rows).includes('forged'));
  for(const socket of [teacher,first,second]){socket.send({type:'ping'});assert.equal((await socket.take('pong')).type,'pong');}
});
