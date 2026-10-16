import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import {createGroupHomeworkFixture} from '../../server/groupHomework.fixture.js';
import {finishGroupLesson} from './finishGroupLesson.js';

test('finish from lesson controls ends all group channels, blocks rejoin and retains pupil work', {timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture();const sockets=[];
  try {
    const teacher=f.tokens['teacher-a'],root=`/api/learning-groups/${f.groupId}`;
    const {lesson}=await f.request(root+'/lessons',teacher,{startAt:new Date(Date.now()-120000).toISOString(),durationMinutes:60,topic:'Завершение'},'POST',201);
    await f.request(`${root}/lessons/${lesson.id}`,teacher,{status:'active'},'PATCH');
    const {channels}=await f.request(`${root}/lessons/${lesson.id}/voice-channels`,teacher);
    const connect=async(token,channel)=>{
      const ws=new WebSocket(f.base.replace('http','ws')+'/rtc?_auth='+encodeURIComponent(token));sockets.push(ws);
      const messages=[];ws.on('message',raw=>messages.push(JSON.parse(String(raw))));
      await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
      const take=async type=>{const deadline=Date.now()+5000;while(Date.now()<deadline){const value=messages.find(m=>m.type===type);if(value)return value;await new Promise(r=>setTimeout(r,20));}throw Error('No '+type);};
      ws.send(JSON.stringify({type:'join',roomId:channel.roomId}));await take('joined');return{ws,take};
    };
    const t=await connect(teacher,channels[0]),a=await connect(f.tokens['student-a'],channels[0]),b=await connect(f.tokens['student-b'],channels[2]);
    const progressBefore=fs.readFileSync(path.join(f.data,'progress.json'),'utf8');
    await f.request(`${root}/lessons/${lesson.id}`,f.tokens['student-a'],{status:'completed'},'PATCH',403);
    const result=await finishGroupLesson({groupId:f.groupId,lessonId:lesson.id,transport:{
      updateLearningGroupLesson:(g,l,body)=>f.request(`/api/learning-groups/${g}/lessons/${l}`,teacher,body,'PATCH'),
      getLearningGroupLesson:(g,l)=>f.request(`/api/learning-groups/${g}/lessons/${l}`,teacher),
      desktopRecording:(action='settings',body)=>f.request('/api/desktop-recording/'+action,teacher,body),
    }});
    assert.equal(result.status,'completed');
    await Promise.all([t.take('session-ended'),a.take('session-ended'),b.take('session-ended')]);
    const closed=await f.request(`${root}/lessons/${lesson.id}/voice-channels`,teacher);
    assert.equal(closed.canJoin,false);assert.ok(closed.channels.every(c=>!c.participants.length));
    a.ws.send(JSON.stringify({type:'join',roomId:channels[0].roomId}));await a.take('error');
    assert.equal(fs.readFileSync(path.join(f.data,'progress.json'),'utf8'),progressBefore);
    const {group}=await f.request(root,teacher);assert.equal(group.status,'active');
  } finally {for(const ws of sockets)ws.close();await f.stop();}
});
