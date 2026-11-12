import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import * as Y from 'yjs';
import {WebsocketProvider} from 'y-websocket';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('a dated trial shares persistent board/code and one private recording with every enrolled pupil only', {timeout:60000}, async()=>{
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    .formatToParts(new Date(Date.now()-120000)).reduce((out,part)=>({...out,[part.type]:part.value}),{});
  const date=`${parts.year}-${parts.month}-${parts.day}`, time=`${parts.hour}:${parts.minute}`;
  const booking={id:'test-trial',teacherId:'teacher-a',slotId:'slot',date,time,durationMinutes:60,
    studentIds:['student-a','student-b'],studentNames:['Анна','Дарья'],meetingUrl:'https://telemost.yandex.ru/j/test-trial',revision:1};
  const secret='fixture-recorder',deviceId='fixture-device';
  const f=await createGroupHomeworkFixture(undefined,(write)=>{
    write('trial-slots',{teachers:{'teacher-a':{revision:0,slots:[]}},bookings:{[`teacher-a:slot:${date}`]:booking}});
    write('desktop-recordings',{teachers:{'teacher-a':{enabled:true}},jobs:{},devices:{[deviceId]:{id:deviceId,teacherId:'teacher-a',hash:crypto.createHash('sha256').update(secret).digest('hex'),name:'Fixture',ready:true,lastSeenAt:Date.now()}}});
  },{persistCollab:true});
  const clients=[];
  const connect=async(room,token)=>{
    const doc=new Y.Doc(),provider=new WebsocketProvider(f.base.replace('http','ws')+'/collab',room,doc,{WebSocketPolyfill:WebSocket,params:{_auth:token},disableBc:true});
    clients.push({doc,provider});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Sync timeout: ${room}`)),6000);provider.on('sync',synced=>{if(synced){clearTimeout(timer);resolve();}});});
    return doc;
  };
  const wait=async condition=>{for(let n=0;n<150;n++){if(condition())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Shared changes did not arrive');};
  try{
    const teacher=f.tokens['teacher-a'],open='/api/trial-lessons/test-trial/open';
    await f.request(open,f.tokens['teacher-b'],{},'POST',403);
    await f.request(open,f.tokens['student-c'],{},'POST',403);
    const result=await f.request(open,teacher,{recording:true});
    const lesson=result.lesson;
    assert.equal(lesson.trialBookingId,booking.id);
    assert.equal(result.recording.audioMode,'telemost');
    assert.equal(result.recording.occurrence.lessonId,lesson.id);
    assert.deepEqual(result.recording.occurrence.participantIds,booking.studentIds);
    const again=await f.request(open,teacher,{recording:true});
    assert.equal(again.recording.id,result.recording.id,'opening twice must not create two recordings');
    for(const pupil of booking.studentIds){
      assert.equal((await f.request(open,f.tokens[pupil],{recording:true})).recording,null,'pupils cannot start the recorder');
      assert.equal((await f.request('/api/trial-lessons/current',f.tokens[pupil])).lesson.id,lesson.id);
    }
    assert.equal((await f.request('/api/trial-lessons/current',f.tokens['student-c'])).lesson,null);
    assert.equal((await f.request('/api/learning-groups',teacher)).groups.length,1,'trial room must not create a paid group');
    const pages=await f.request(`/api/lesson-pages?room=${encodeURIComponent(lesson.boardDocName+'~pages')}`,teacher);
    assert.ok(pages.pages.length);
    const boardRoom=lesson.boardDocName, codeRoom=lesson.collabDocName;
    const board=await connect(boardRoom,teacher), code=await connect(codeRoom,teacher);
    board.getArray('items').push([{id:'trial-drawing',type:'path',points:[[1,2],[3,4]]}]);
    code.getText('trial-example').insert(0,'print("shared trial")');
    for(const pupil of booking.studentIds){
      const pupilBoard=await connect(boardRoom,f.tokens[pupil]),pupilCode=await connect(codeRoom,f.tokens[pupil]);
      await wait(()=>pupilBoard.getArray('items').length===1&&pupilCode.getText('trial-example').toString().includes('shared trial'));
    }
    await f.request(`/api/learning-groups/${lesson.groupId}/lessons/${lesson.id}`,f.tokens['student-c'],undefined,'GET',403);
    await f.request(`/api/learning-groups/${lesson.groupId}/lessons/${lesson.id}`,teacher,{status:'completed'},'PATCH');
    await f.request('/api/desktop-recorder/poll',secret,{ready:true});
    const video='https://rutube.ru/video/private/0123456789abcdef0123456789abcdef/?p=fixture';
    await f.request(`/api/desktop-recorder/jobs/${result.recording.id}`,secret,{status:'ready',url:video,durationMs:120000});
    // History uses the scheduled end; move the fixture session into the past,
    // preserving the same documents, roster and recording occurrence key.
    await f.request(`/api/learning-groups/${lesson.groupId}/lessons/${lesson.id}`,teacher,{startAt:new Date(Date.now()-7200000).toISOString()},'PATCH');
    for(const pupil of booking.studentIds){
      const catalog=await f.request(`/api/lesson-recordings?studentId=${pupil}`,f.tokens[pupil]);
      const tile=catalog.items.find(row=>row.trialBookingId===booking.id);
      assert.ok(tile,`${pupil} has a trial archive tile`);assert.equal(tile.recording.available,true);
      const detail=await f.request(`/api/lesson-history/detail?studentId=${pupil}&occurrenceKey=${encodeURIComponent(tile.key)}`,f.tokens[pupil]);
      assert.equal(detail.replay.video.url,video);
      assert.equal((await f.request(open,f.tokens[pupil],{recording:false})).lesson.readOnly,true);
      const archivedBoard=await connect(boardRoom,f.tokens[pupil]);
      assert.equal(archivedBoard.getArray('items').get(0).id,'trial-drawing');
    }
    assert.equal((await f.request('/api/lesson-recordings?studentId=student-c',f.tokens['student-c'])).items.some(row=>row.trialBookingId),false);
  }finally{for(const {doc,provider} of clients){provider.destroy();doc.destroy();}await f.stop();}
});
