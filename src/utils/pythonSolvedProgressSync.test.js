import test from 'node:test';
import assert from 'node:assert/strict';
import {watchPythonSolvedProgress} from './pythonSolvedProgressSync.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('refreshes only persisted progress for the selected pupil and catches up on reconnect',async()=>{
  let listener,calls=0,closed=false;
  const received=[];
  const sync=watchPythonSolvedProgress({studentId:'p',load:async()=>({ids:[String(++calls)]}),
    subscribe:(fn,options)=>{listener=fn;assert.deepEqual(options.events,['schedule-sync','ready']);return()=>{closed=true;};},
    onSnapshot:value=>received.push(value)});
  await settle();
  for(const data of ['broken','null',JSON.stringify({scope:'homework-progress',studentId:'other'}),JSON.stringify({scope:'schedule',studentId:'p'})]) listener({type:'schedule-sync',data});
  await settle();assert.equal(calls,1);
  listener({type:'schedule-sync',data:JSON.stringify({scope:'homework-progress',studentId:'p'})});
  await settle();assert.deepEqual(received.at(-1).ids,['2']);
  listener({type:'ready'});await settle();assert.equal(calls,3);
  sync.stop();assert.equal(closed,true);
  await sync.refresh();assert.equal(calls,3);
});
test('a save arriving during an old request triggers a fresh read and cannot be overwritten',async()=>{
  const pending=[],received=[];let listener;
  const sync=watchPythonSolvedProgress({studentId:'p',load:()=>new Promise(resolve=>pending.push(resolve)),
    subscribe:fn=>{listener=fn;return()=>{};},onSnapshot:value=>received.push(value)});
  listener({type:'schedule-sync',data:JSON.stringify({scope:'homework-progress',studentId:'p'})});
  pending[0]({ids:[]});await settle();assert.deepEqual(received,[]);assert.equal(pending.length,2);
  pending[1]({ids:['solved']});await settle();assert.deepEqual(received,[{ids:['solved']}]);
  void sync.refresh();sync.stop();pending[2]({ids:['late-from-old-pupil']});await settle();assert.equal(received.length,1);
});
test('a temporary request failure leaves the displayed progress intact and the next event retries',async()=>{
  let listener,calls=0;const received=[];
  const sync=watchPythonSolvedProgress({studentId:'p',load:async()=>{if(++calls===1)throw Error('network');return {ids:['ok']};},
    subscribe:fn=>{listener=fn;return()=>{};},onSnapshot:value=>received.push(value)});
  await settle();assert.equal(received.length,0);listener({type:'ready'});await settle();assert.deepEqual(received,[{ids:['ok']}]);sync.stop();
});
