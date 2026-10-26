import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as Y from 'yjs';
import {WebsocketProvider} from 'y-websocket';
import {WebSocket} from 'ws';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('live set correction broadcasts to connected group pupils, preserves their answer and accepts it against the new private key',{timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(),{request,tokens,base}=f,a=tokens['teacher-a'],s=tokens['student-a'];
  let doc,provider;
  try{
    const image=async(name,color)=>{
      const form=new FormData();form.append('file',new Blob([await sharp({create:{width:600,height:140,channels:4,background:color}}).png().toBuffer()]),name);
      const response=await fetch(base+'/api/lesson-task-images',{method:'POST',headers:{Authorization:`Bearer ${a}`},body:form});assert.equal(response.status,201);return response.json();
    };
    const old=await image('old.png','white'),replacement=await image('fixed.png','#eee0ff');
    let set=await request('/api/lesson-task-sets',a,{name:'Исправление на уроке',taskNumber:5,tasks:[{title:'9',format:'exact',answers:['73'],images:[old.id]}]},'POST',201);
    const room=`board-group-${f.groupId}`;let {run}=await request('/api/lesson-task-runs',a,{room,setId:set.id,x:0,y:0},'POST',201);const card=run.cards[0];
    doc=new Y.Doc();provider=new WebsocketProvider(base.replace('http:','ws:')+'/collab',room+'~pages',doc,{WebSocketPolyfill:WebSocket,params:{_auth:s},disableBc:true});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Collab sync timeout')),5000);provider.on('sync',synced=>{if(synced){clearTimeout(timer);resolve();}});});
    const action=(token,input,status=200)=>request(`/api/lesson-task-runs/${run.id}/action`,token,input,'POST',status);
    const input={cardId:card.id,leaseKey:'student-input'};
    await action(s,{action:'claim',...input});await action(s,{action:'answer',...input,revision:0,answers:['9']});
    ({run}=await action(s,{action:'check',...input,revision:1}));assert.equal(run.cards[0].lastResult,'wrong');
    set=await request(`/api/lesson-task-sets/${set.id}`,a,{...set,tasks:set.tasks.map(task=>({...task,answers:['9'],images:[replacement.id]}))},'PUT');
    const version=run.version;
    await action(s,{action:'sync-set',setId:set.id,setVersion:set.version},403);
    await action(tokens['teacher-b'],{action:'sync-set',setId:set.id,setVersion:set.version},403);
    const signal=new Promise((resolve,reject)=>{const signals=doc.getMap('preparedTaskSignals'),check=()=>{const change=signals.get(room);if(change?.version>version){clearTimeout(timer);signals.unobserve(check);resolve(change);}};const timer=setTimeout(()=>{signals.unobserve(check);reject(Error('Missing update signal'));},5000);signals.observe(check);});
    ({run}=await action(a,{action:'sync-set',setId:set.id,setVersion:set.version}));
    assert.equal((await signal).version,run.version);assert.equal(run.version,version+1);assert.equal(run.cards[0].id,card.id);
    const pupil=(await request('/api/lesson-task-run?room='+encodeURIComponent(room),s)).run;
    assert.equal(pupil.cards[0].images[0].id,replacement.id);assert.deepEqual(pupil.cards[0].answers,['9']);assert.equal(pupil.cards[0].lastResult,null);
    assert.equal('referenceAnswers' in pupil.cards[0],false);
    const read=await fetch(base+pupil.cards[0].images[0].url,{headers:{Authorization:`Bearer ${s}`}});assert.equal(read.status,200);
    await action(s,{action:'claim',...input});({run}=await action(s,{action:'check',...input,revision:1}));assert.equal(run.cards[0].status,'solved');
  }finally{provider?.destroy();doc?.destroy();await f.stop();}
});
