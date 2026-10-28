import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioReceiveWatchdog,createRemoteAudioPlayback,createAudioRecoveryBudget} from './callAudioHealth.js';

test('silence, disabled microphone, stale heartbeats and older clients do not trigger recovery',()=>{
  for(const mode of ['silence','disabled','stale','legacy']){
    const w=createAudioReceiveWatchdog();
    for(let i=1;i<=20;i++){
      const now=i*2500;
      if(mode!=='legacy'&&(mode!=='stale'||i<3))w.remote({epoch:'a',packets:mode==='silence'?10:i*30,enabled:mode!=='disabled'},now);
      assert.equal(w.sample({now,connected:true,packets:0}),null,mode);
    }
  }
});

test('only fresh sender packet progress with a stuck receiver detects one-way audio failure',()=>{
  const w=createAudioReceiveWatchdog();let issue;
  for(let i=1;i<=8;i++){
    const now=i*2500;w.remote({epoch:'a',packets:i*30,enabled:true},now);
    issue=w.sample({now,connected:true,packets:10,time:i});
    if(i<7)assert.equal(issue,null);
  }
  assert.equal(issue,'receive-stalled');
  assert.equal(w.sample({now:20500,connected:true,packets:100,time:9}),null);
});

test('receiver counter reset, reconnection and a changed sender epoch start a fresh grace period',()=>{
  const w=createAudioReceiveWatchdog();
  for(let i=1;i<=8;i++){const now=i*2500;w.remote({epoch:'a',packets:i*30,enabled:true},now);w.sample({now,connected:true,packets:i*20,time:i});}
  w.remote({epoch:'b',packets:1,enabled:true},21000);
  assert.equal(w.sample({now:21000,connected:true,packets:0,time:0}),null);
  assert.equal(w.sample({now:40000,connected:false,packets:0}),null);
  assert.equal(w.sample({now:40500,connected:true,packets:0}),null);
});

test('packets reaching an already running but frozen player detect playback failure; blocked or zero volume are respected',()=>{
  for(const options of [{blocked:false,volume:1},{blocked:true,volume:1},{blocked:false,volume:0}]){
    const w=createAudioReceiveWatchdog();let issue;
    for(let i=1;i<=9;i++)issue=w.sample({now:i*2500,connected:true,packets:i*20,time:Math.min(i,2),...options});
    assert.equal(issue,!options.blocked&&options.volume?'playback-stalled':null);
  }
});

test('automatic retries are limited separately for each participant and manual retry can restart them',()=>{
  const b=createAudioRecoveryBudget();
  assert.equal(b.take('a',1000),true);assert.equal(b.take('a',2000),false);
  assert.equal(b.take('b',2000),true);assert.equal(b.take('a',32000),true);
  assert.equal(b.take('a',65000),false);assert.equal(b.take('a',66000,true),true);
  assert.equal(b.take('a',67000,true),false);assert.equal(b.take('a',100000),true);
  b.clear();assert.equal(b.take('a',100001),true);
});

test('a first play() that never starts is detected only while audio packets keep arriving',()=>{
  const w=createAudioReceiveWatchdog();let issue;
  for(let i=1;i<=7;i++)issue=w.sample({now:i*2500,connected:true,packets:i*20,time:0});
  assert.equal(issue,'playback-stalled');
});

function playerFixture(){
  const node=new EventTarget(),track=new EventTarget(),stream=new EventTarget();
  Object.assign(track,{kind:'audio',readyState:'live'});stream.getAudioTracks=()=>[track];
  Object.assign(node,{paused:true,ended:false,srcObject:null,play:async()=>{node.paused=false;},pause:()=>{node.paused=true;}});
  return {node,stream,track};
}

test('autoplay blocked is visible, waits for a user retry and clears only after playback starts',async t=>{
  t.mock.timers.enable({apis:['setInterval']});const f=playerFixture(),states=[];let calls=0;
  f.node.play=async()=>{if(++calls===1)throw Object.assign(Error(),{name:'NotAllowedError'});f.node.paused=false;};
  const p=createRemoteAudioPlayback({...f,onState:value=>states.push(value.status)});await Promise.resolve();
  assert.deepEqual(states,['blocked']);t.mock.timers.tick(12000);await Promise.resolve();assert.equal(calls,1);
  assert.equal(await p.retry(),true);assert.deepEqual(states,['blocked','playing']);p.dispose();
});

test('paused audio restarts automatically and stream rebinding does not stop shared incoming tracks',async t=>{
  t.mock.timers.enable({apis:['setInterval']});const f=playerFixture();let calls=0;f.node.play=async()=>{calls++;f.node.paused=false;};
  const p=createRemoteAudioPlayback(f);await Promise.resolve();f.node.paused=true;
  t.mock.timers.tick(3000);await Promise.resolve();assert.equal(calls,2);
  await p.retry({rebind:true});assert.equal(f.node.srcObject,f.stream);assert.equal(f.track.readyState,'live');
  p.dispose();assert.equal(f.node.srcObject,null);t.mock.timers.tick(30000);assert.equal(calls,3);
});

test('late errors after leaving a channel are ignored; removing one player leaves other participants running',async()=>{
  const f=playerFixture(),other=playerFixture(),states=[];let reject;
  f.node.play=()=>new Promise((_resolve,r)=>{reject=r;});const p=createRemoteAudioPlayback({...f,onState:value=>states.push(value.status)});
  const q=createRemoteAudioPlayback(other);await Promise.resolve();p.dispose();reject(Object.assign(Error(),{name:'NotAllowedError'}));await Promise.resolve();
  assert.deepEqual(states,[]);assert.equal(other.node.srcObject,other.stream);assert.equal(other.node.paused,false);q.dispose();
});
