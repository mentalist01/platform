import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createWorkbookLiveEvents} from './workbookLiveEvents.js';
import {WorkbookLivePresence} from './workbookLivePresence.js';

test('authenticated push is isolated, reports revisions immediately, previews typing and clears on disconnect',{timeout:15000},async()=>{
  const identities={a:{id:'t',role:'teacher',name:'Teacher'},b:{id:'s',role:'student',name:'Pupil'},other:{id:'s2',role:'student',name:'Other'}};
  let ended=false,revision=0;
  const presence=new WorkbookLivePresence(),store={now:Date.now,liveWorkbooks:{read:()=>({state:{revision}})}};
  const session=async req=>{const token=req.headers.authorization?.replace('Workbook ','').replace(/_+$/,'');if(!identities[token]||ended)throw Error('No access');return{mode:{key:token==='other'?'other':'room'},entry:{auth:identities[token]}};};
  const events=createWorkbookLiveEvents({session,presence,store}),server=http.createServer();server.on('upgrade',(req,socket,head)=>void events.upgrade(req,socket,head));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`ws://127.0.0.1:${server.address().port}${events.path}`,sockets=[];
  const connect=async token=>{const ws=new WebSocket(url,{headers:{Authorization:'Workbook '+token.padEnd(40,'_')}}),messages=[];sockets.push(ws);ws.on('message',data=>messages.push(JSON.parse(data)));await once(ws,'open');
    return{ws,messages,wait:async predicate=>{const deadline=Date.now()+2000;while(Date.now()<deadline){const index=messages.findIndex(predicate);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Push notification timed out');}};};
  try{
    const a=await connect('a'),b=await connect('b'),other=await connect('other');await Promise.all([a,b,other].map(c=>c.wait(m=>m.type==='ready')));
    revision=1;events.changed('room');assert.equal((await b.wait(m=>m.type==='changed')).revision,1);
    await new Promise(r=>setTimeout(r,30));assert.equal(other.messages.some(m=>m.type==='changed'),false);
    const selection={sheetName:'Sheet1',activeCell:[2,6],ranges:[[2,6,2,6]],objects:[]},draft={sheetName:'Sheet1',cell:[2,6],text:'hello'};
    a.ws.send(JSON.stringify({type:'presence',selection,draft,name:'Spoofed'}));const preview=await b.wait(m=>m.type==='presence'&&m.peers[0]?.draft);
    assert.equal(preview.peers[0].name,'Teacher');assert.deepEqual(preview.peers[0].draft,draft);assert.equal(revision,1,'Draft never changes the document revision');
    a.ws.send(JSON.stringify({type:'presence',selection,draft:null}));await b.wait(m=>m.type==='presence'&&m.peers.length===1&&!m.peers[0].draft);
    a.ws.close();await b.wait(m=>m.type==='presence'&&m.peers.length===0);
    ended=true;b.ws.send(JSON.stringify({type:'presence',selection}));const [code]=await once(b.ws,'close');assert.equal(code,1008);
    const bad=new WebSocket(url,{headers:{Authorization:'Workbook invalid'}});sockets.push(bad);const [error]=await once(bad,'error');assert.match(error.message,/401/);
  }finally{for(const ws of sockets)ws.terminate();events.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
