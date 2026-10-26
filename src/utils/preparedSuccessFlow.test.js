import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparedSuccessFlow,PREPARED_SUCCESS_DELAY_MS} from './preparedSuccessFlow.js';

function fixture(){
  let state={run:{id:'run',auto:true,teacherCardId:'one',cards:[{id:'one',status:'active'}]},selectedId:'one'};
  const events=[],timers=[];
  const flow=createPreparedSuccessFlow({current:()=>state,onStart:id=>events.push('start:'+id),onStop:()=>events.push('stop'),onAdvance:id=>events.push('advance:'+id),
    setTimer:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},clearTimer:timer=>{timer.cancelled=true;}});
  const update=run=>{const before=state.run;state={...state,run};flow.update(before,run,state.selectedId);};
  const solved=()=>({...state.run,teacherCardId:'two',cards:[{id:'one',status:'solved'},{id:'two',status:'active'}]});
  return {flow,update,solved,events,timers,set:patch=>{state={...state,...patch};},state:()=>state};
}
test('celebrates first and advances once after the delay despite repeated refreshes',()=>{
  const f=fixture();f.update(f.solved());assert.deepEqual(f.events,['start:one']);assert.equal(f.timers[0].ms,PREPARED_SUCCESS_DELAY_MS);
  f.update({...f.state().run,version:2});assert.equal(f.timers.length,1);f.timers[0].fn();assert.deepEqual(f.events,['start:one','stop','advance:two']);
});
test('manual mode and the last task congratulate without changing tasks; old solved cards do not replay',()=>{
  for(const patch of [{auto:false},{teacherCardId:'one'}]){
    const f=fixture();f.update({...f.solved(),...patch});f.timers[0].fn();assert.deepEqual(f.events,['start:one','stop']);
    f.update({...f.state().run,version:2});assert.equal(f.timers.length,1);
  }
  const f=fixture();f.flow.update(null,f.solved(),'one');assert.equal(f.events.length,0);
});
test('manual navigation, a replaced run and unmount cancel a pending flight; editing code prevents a delayed forced switch',()=>{
  for(const reason of ['navigate','replace','unmount','busy']){
    const f=fixture();f.update(f.solved());
    if(reason==='navigate'){f.set({selectedId:'two'});f.update(f.state().run);}
    if(reason==='replace')f.update({...f.state().run,id:'new-run'});
    if(reason==='unmount')f.flow.cancel();
    if(reason==='busy')f.set({busyCardId:'one'});
    f.timers[0].fn();assert.equal(f.events.includes('advance:two'),false,reason);
  }
});
