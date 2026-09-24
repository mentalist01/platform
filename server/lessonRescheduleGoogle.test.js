import test from 'node:test';
import assert from 'node:assert/strict';
import { moveGoogleCalendarLesson } from './googleCalendarWriteback.js';
const params={accessToken:'test-only',calendarId:'calendar',requestId:'r1',iCalUid:'uid',expectedStartAt:'2026-09-25T13:00:00Z',targetStartAt:'2026-09-28T15:00:00Z',durationMinutes:60,summary:'Student'};
const source={id:'series_20260925T130000Z',recurringEventId:'series',iCalUID:'uid',etag:'"v1"',start:{dateTime:params.expectedStartAt},end:{dateTime:'2026-09-25T14:00:00Z'},extendedProperties:{private:{keep:'yes'}}};
function mock({prior=[],occupied=[],event=source,writeError=false}={}){
  const calls=[];return {calls,fetchImpl:async(raw,opts)=>{const u=new URL(raw);calls.push({u,...opts});if(opts.method==='PATCH'||opts.method==='POST'){if(writeError)throw Error('lost response');return new Response(JSON.stringify({id:source.id,iCalUID:'uid'}));}return new Response(JSON.stringify({items:u.searchParams.has('privateExtendedProperty')?prior:u.searchParams.has('iCalUID')?[event].filter(Boolean):occupied}));}};
}
test('moves recurring instance only, retains unrelated fields and uses If-Match',async()=>{
  const m=mock();await moveGoogleCalendarLesson({...params,...m});const write=m.calls.find(c=>c.method==='PATCH');
  assert.ok(write.u.pathname.endsWith('/'+source.id));assert.equal(write.headers['If-Match'],'"v1"');
  const body=JSON.parse(write.body);assert.equal(Date.parse(body.start.dateTime),Date.parse(params.targetStartAt));assert.equal(body.end.dateTime,'2026-09-28T16:00:00.000Z');assert.equal(body.extendedProperties.private.keep,'yes');
  assert.ok(!('recurrence' in body));assert.ok(!('summary'in body));assert.ok(m.calls.filter(c=>c.method==='GET').every(c=>c.u.searchParams.get('singleEvents')==='true'));
});
test('full-day or timed Google conflicts prevent a write',async()=>{
  for(const conflict of [{id:'all-day',start:{date:'2026-09-28'},end:{date:'2026-09-29'}},{id:'busy'}]){
    const m=mock({occupied:[conflict]});await assert.rejects(moveGoogleCalendarLesson({...params,...m}),e=>e.status===409&&e.definite);assert.equal(m.calls.filter(c=>c.method==='PATCH').length,0);
  }
});
test('changed source blocks write; uncertain write is retained for recovery',async()=>{
  await assert.rejects(moveGoogleCalendarLesson({...params,...mock({event:{...source,start:{dateTime:'2026-09-25T14:00:00Z'}}})}),e=>e.status===409&&e.definite);
  await assert.rejects(moveGoogleCalendarLesson({...params,...mock({writeError:true})}),e=>!e.definite);
});
test('recovery finds marked occurrence without any further writes',async()=>{
  const m=mock({prior:[{...source,start:{dateTime:params.targetStartAt},end:{dateTime:'2026-09-28T16:00:00Z'}}]});
  assert.equal((await moveGoogleCalendarLesson({...params,...m,recoverOnly:true})).iCalUID,'uid');assert.equal(m.calls.length,1);
  assert.equal(await moveGoogleCalendarLesson({...params,...mock(),recoverOnly:true}),null);
});
test('manual dated lesson creates one deterministic Google event',async()=>{
  const m=mock();await moveGoogleCalendarLesson({...params,...m,iCalUid:''});const write=m.calls.find(c=>c.method==='POST');const body=JSON.parse(write.body);
  assert.match(body.id,/^[0-9a-f]{64}$/);assert.equal(body.summary,'Student');assert.equal(body.extendedProperties.private.ivan100Reschedule,'r1');
});
