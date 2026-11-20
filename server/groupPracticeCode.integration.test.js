import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as Y from 'yjs';
import WebSocket from 'ws';
import {WebsocketProvider} from 'y-websocket';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {groupNotebookCode} from '../src/utils/groupNotebook.js';
import {practiceWorkspaceRoom} from '../src/utils/groupPractice.js';
import {getCollabSolutionChannels} from '../src/utils/collabSolutions.js';

test('after gathering, saved code is readable only by its assigned pupil and stays outside the shared code', {timeout:45000},async()=>{
  const fixture=await createGroupHomeworkFixture(undefined,undefined,{persistCollab:true});
  const {base,groupId,tokens,request}=fixture;
  const documents=[];
  const connect=async(room,id)=>{
    const doc=new Y.Doc(),provider=new WebsocketProvider(base.replace('http','ws')+'/collab',room,doc,{
      WebSocketPolyfill:WebSocket,params:{_auth:tokens[id]},disableBc:true,
    });
    documents.push({doc,provider});
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Code room did not sync')),8000);
      provider.on('sync',synced=>{if(synced){clearTimeout(timeout);resolve();}});
    });
    return doc;
  };
  const text=doc=>getCollabSolutionChannels(doc).codeText;
  try{
    const root='/api/learning-groups/'+groupId,teacher=tokens['teacher-a'];
    const {lesson}=await request(root+'/lessons',teacher,{
      startAt:new Date(Date.now()-60000).toISOString(),durationMinutes:60,topic:'Самостоятельная работа',
    },'POST',201);
    const practice=root+'/lessons/'+lesson.id+'/practice';
    const connected=await connect(groupNotebookCode(groupId),'teacher-a');
    const legacy=await connect(groupNotebookCode(groupId,'student-a'),'student-a');
    text(legacy).insert(0,'# Earlier private code');
    const opened=await request(practice,teacher,{action:'start',pageId:'main',assignments:[['student-a'],['student-b']]});
    const [left,right]=opened.rounds.find(round=>round.id===opened.activeRoundId).rooms;
    const first=await connect(practiceWorkspaceRoom(lesson.id,left.id,'code'),'student-a');
    const second=await connect(practiceWorkspaceRoom(lesson.id,right.id,'code'),'student-b');
    const observerA=await connect(practiceWorkspaceRoom(lesson.id,left.id,'code'),'teacher-a');
    const observerB=await connect(practiceWorkspaceRoom(lesson.id,right.id,'code'),'teacher-a');
    const waitForText=(doc,expected)=>new Promise((resolve,reject)=>{
      const observed=text(doc);
      const timeout=setTimeout(()=>reject(Error('Practice edit was not synchronized')),8000);
      const read=()=>{if(observed.toString()===expected){clearTimeout(timeout);observed.unobserve(read);resolve();}};
      observed.observe(read);
      read();
    });
    const received=Promise.all([waitForText(observerA,'print(11)'),waitForText(observerB,'print(22)')]);
    text(first).insert(0,'print(11)');
    text(second).insert(0,'print(22)');
    await received;
    const history=root+'/code-work?pageId=main&solutionId=main';
    const visible=id=>request(history,tokens[id]);
    assert.deepEqual((await visible('student-a')).versions.map(version=>version.id),['legacy'],'Live private work is available only in the assigned editor');
    await request(practice,teacher,{action:'finish'});
    const leftVersions=(await visible('student-a')).versions;
    const rightVersions=(await visible('student-b')).versions;
    assert.deepEqual(leftVersions.map(version=>version.entries[0].text),['print(11)','# Earlier private code']);
    assert.deepEqual(rightVersions.map(version=>version.entries[0].text),['print(22)']);
    assert.equal(text(connected).toString(),'');
    await request(history,tokens['student-c'],undefined,'GET',403);
    await request(history,teacher,undefined,'GET',403);
  }finally{
    for(const {doc,provider} of documents){provider.destroy();doc.destroy();}
    await fixture.stop();
    await fs.rm(fixture.root,{recursive:true,force:true});
  }
});
