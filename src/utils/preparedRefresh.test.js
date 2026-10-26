import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers';
import {createPreparedRefresh} from './preparedRefresh.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){let run,reads=0;const jobs=[],errors=[];const refresh=createPreparedRefresh({read:signal=>new Promise(resolve=>{reads++;jobs.push({signal,resolve});}),apply:value=>{run=value;},current:()=>run,onError:error=>errors.push(error),active:()=>true});return {refresh,jobs,errors,reads:()=>reads,run:()=>run};}
test('initial HTTP request and already-covered Yjs sync need one response',async()=>{
  const f=fixture();const first=f.refresh.refresh();await tick();f.refresh.refresh({runId:'run',version:2});
  f.jobs[0].resolve({id:'run',version:2});await first;await tick();assert.equal(f.reads(),1);
  await f.refresh.refresh({runId:'run',version:2});assert.equal(f.reads(),1);
});
test('newer run signals arriving during a request get one trailing response',async()=>{
  const f=fixture();const first=f.refresh.refresh();await tick();f.refresh.refresh({runId:'run',version:3});f.refresh.refresh({runId:'run',version:2});
  f.jobs[0].resolve({id:'run',version:2});await first;await tick();assert.equal(f.reads(),2);
  f.jobs[1].resolve({id:'run',version:3});await tick();assert.equal(f.run().version,3);
});
test('same-version replacement runs refresh and manual reloads coalesce without looping',async()=>{
  const f=fixture();const first=f.refresh.refresh();await tick();f.refresh.refresh();f.refresh.refresh();f.jobs[0].resolve({id:'old',version:20});await first;await tick();assert.equal(f.reads(),2);
  f.jobs[1].resolve({id:'old',version:20});await tick();const next=f.refresh.refresh({runId:'new',version:1});await tick();assert.equal(f.reads(),3);f.jobs[2].resolve({id:'new',version:1});await next;
});
test('leaving a room aborts the read and never publishes its late response',async()=>{
  const f=fixture();const first=f.refresh.refresh();await tick();f.refresh.dispose();assert.equal(f.jobs[0].signal.aborted,true);f.jobs[0].resolve({id:'closed',version:1});await first;assert.equal(f.run(),undefined);assert.deepEqual(f.errors,[]);
});
