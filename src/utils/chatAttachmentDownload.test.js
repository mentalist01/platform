import test from 'node:test';
import assert from 'node:assert/strict';
import { startChatAttachmentDownload } from './chatAttachmentDownload.js';

const event = () => ({
  prevented:false, stopped:false,
  preventDefault() { this.prevented = true; },
  stopPropagation() { this.stopped = true; },
});

test('chat download prevents lesson navigation immediately and blocks duplicate clicks while bytes load',async()=>{
  const busyRef = {current:false}, busy = [], errors = [], first = event(), second = event();
  let finish, requests = 0;
  const pending = new Promise(resolve=>{finish=resolve;});
  const options = {busyRef,setBusy:v=>busy.push(v),setError:v=>errors.push(v),download:()=>{
    assert.equal(first.prevented,true); assert.equal(first.stopped,true); requests++; return pending;
  }};
  const work = startChatAttachmentDownload(first,options);
  await startChatAttachmentDownload(second,options);
  assert.equal(second.prevented,true); assert.equal(second.stopped,true);
  assert.equal(requests,1); assert.equal(busyRef.current,true);
  finish(); await work;
  assert.equal(busyRef.current,false); assert.deepEqual(busy,[true,false]); assert.deepEqual(errors,['']);
});

test('failed or unauthorized chat file remains a cancelled navigation and allows retry',async()=>{
  const click=event(), busyRef={current:false}, states=[];
  const options={busyRef,setBusy:v=>states.push(v),setError:()=>{},download:async()=>{throw Error('401');}};
  await assert.rejects(startChatAttachmentDownload(click,options),/401/);
  assert.equal(click.prevented,true); assert.equal(busyRef.current,false);
  assert.deepEqual(states,[true,false]);
  let retried=false;
  await startChatAttachmentDownload(event(),{...options,download:async()=>{retried=true;}});
  assert.equal(retried,true);
});
