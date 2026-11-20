import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import test from 'node:test';
import WebSocket from 'ws';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('parallel calls require teacher opt-in and keep each individual room open', {timeout:30_000}, async () => {
  const {base,tokens,request,stop,root} = await createGroupHomeworkFixture();
  const clients = [];
  const endpoint = '/api/parallel-individual-lessons';
  const ids = ['student-a','student-b'];
  const teacher = tokens['teacher-a'];
  const connection = async (actor) => {
    const socket = new WebSocket(base.replace('http','ws') + '/rtc?_auth=' + tokens[actor]);
    const messages = [];
    socket.on('message',raw => messages.push(JSON.parse(raw)));
    clients.push(socket);
    await once(socket,'open',{signal:AbortSignal.timeout(5000)});
    const receive = async predicate => {
      for (let i = 0; i < 100; i += 1) {
        const message = messages.find(predicate);
        if (message) return message;
        await new Promise(resolve => setTimeout(resolve,20));
      }
      throw new Error('RTC response timed out');
    };
    return {
      messages, receive,
      join(studentId,parallelSessionId = '') {
        socket.send(JSON.stringify({type:'join',roomId:'rtc:teacher-a:' + studentId,parallelSessionId}));
      },
    };
  };
  try {
    await request(endpoint,teacher,{studentIds:['student-a','student-c'],requestId:randomUUID()},'POST',403);
    await request(endpoint,tokens['student-a'],{studentIds:ids,requestId:randomUUID()},'POST',403);
    const requestId = randomUUID();
    const first = await request(endpoint,teacher,{studentIds:ids,requestId});
    assert.equal((await request(endpoint,teacher,{studentIds:ids,requestId})).id,first.id);
    const a = await connection('teacher-a');
    const b = await connection('teacher-a');
    const studentA = await connection('student-a');
    const studentB = await connection('student-b');
    a.join(ids[0],first.id);
    await a.receive(message => message.type === 'joined');
    b.join(ids[1],first.id);
    await b.receive(message => message.type === 'joined');
    studentA.join(ids[0]);
    studentB.join(ids[1]);
    await a.receive(message => message.type === 'peer-joined' && message.peer?.userId === ids[0]);
    await b.receive(message => message.type === 'peer-joined' && message.peer?.userId === ids[1]);
    assert.equal(a.messages.some(message => message.type === 'session-ended'),false);
    assert.equal(a.messages.some(message => message.peer?.userId === ids[1]),false);
    assert.equal(b.messages.some(message => message.peer?.userId === ids[0]),false);
    await request(endpoint,teacher,{studentIds:ids,requestId:randomUUID()},'POST',409);
    const recorder = await request('/api/desktop-recording/start',teacher,{studentId:ids[0]},'POST',409);
    assert.match(recorder.error,/браузере/);
    const ordinary = await connection('teacher-a');
    ordinary.join(ids[0]);
    await ordinary.receive(message => message.type === 'error');
    await request(endpoint+'/'+first.id,tokens['teacher-b'],undefined,'DELETE');
    assert.equal(a.messages.some(message => message.type === 'session-ended'),false);
    await request(endpoint+'/'+first.id,teacher,undefined,'DELETE');
    await a.receive(message => message.type === 'session-ended');
    await b.receive(message => message.type === 'session-ended');
  } finally {
    for (const socket of clients) socket.terminate();
    await stop();
    await fs.rm(root,{recursive:true,force:true});
  }
});
