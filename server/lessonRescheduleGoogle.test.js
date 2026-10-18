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
test('editing a Google occurrence uses its old duration and patches details without touching guests, reminders or the series', async () => {
  const event={...source,summary:'Student',description:'Before',attendees:[{email:'private@example.test'}],reminders:{useDefault:true}};
  const m=mock({event});
  await moveGoogleCalendarLesson({...params,...m,durationMinutes:90,expectedDurationMinutes:60,updateDetails:true,
    expectedSummary:'Student',expectedDescription:'Before',summary:'New title',description:''});
  const write=m.calls.find(call=>call.method==='PATCH'),body=JSON.parse(write.body);
  assert.equal(write.headers['If-Match'],'"v1"');assert.equal(body.summary,'New title');assert.equal(body.description,'');
  assert.equal(body.end.dateTime,'2026-09-28T16:30:00.000Z');
  for(const field of ['recurrence','attendees','reminders','conferenceData','location'])assert.equal(field in body,false);
  const stale=mock({event:{...event,description:'Changed in Google'}});
  await assert.rejects(moveGoogleCalendarLesson({...params,...stale,updateDetails:true,expectedSummary:'Student',expectedDescription:'Before'}),e=>e.status===409&&e.definite);
  assert.equal(stale.calls.some(call=>call.method==='PATCH'),false);
});
test('uncertain metadata edits recover only when both times and edited details match', async () => {
  const prior={...source,summary:'New',description:'Notes',start:{dateTime:params.targetStartAt},end:{dateTime:'2026-09-28T16:00:00Z'}};
  const m=mock({prior:[prior]});
  await moveGoogleCalendarLesson({...params,...m,updateDetails:true,summary:'New',description:'Notes',recoverOnly:true});
  assert.equal(m.calls.length,1);
  await assert.rejects(moveGoogleCalendarLesson({...params,...mock({prior:[prior]}),updateDetails:true,summary:'Newer',description:'Notes',recoverOnly:true}),e=>e.status===409);
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

test('a journal-proven fresh move avoids a recovery round trip but keeps source and etag checks', async () => {
  const m = mock();
  await moveGoogleCalendarLesson({ ...params, ...m, allowConflicts: true, skipRecoveryLookup: true });
  assert.equal(m.calls.length, 2);
  assert.ok(m.calls[0].u.searchParams.has('iCalUID'));
  assert.equal(m.calls[1].method, 'PATCH');
  assert.equal(m.calls[1].headers['If-Match'], '"v1"');
  const recovery = mock();
  await moveGoogleCalendarLesson({ ...params, ...recovery, skipRecoveryLookup: true, recoverOnly: true });
  assert.ok(recovery.calls[0].u.searchParams.has('privateExtendedProperty'));
});
test('manual dated lesson creates one deterministic Google event',async()=>{
  const m=mock();await moveGoogleCalendarLesson({...params,...m,iCalUid:''});const write=m.calls.find(c=>c.method==='POST');const body=JSON.parse(write.body);
  assert.match(body.id,/^[0-9a-f]{64}$/);assert.equal(body.summary,'Student');assert.equal(body.extendedProperties.private.ivan100Reschedule,'r1');
});
test('weekly creation retains recurrence and recovers a lost POST through its deterministic master id',async()=>{
  let created=null,writes=0;
  const fetchImpl=async(raw,options)=>{
    const url=new URL(raw);
    if(options.method==='POST'){
      writes++;created={...JSON.parse(options.body),iCalUID:'weekly-uid'};
      throw Error('Response lost after Google committed');
    }
    if(url.searchParams.has('privateExtendedProperty'))return Response.json({items:[]});
    return created ? Response.json(created) : Response.json({error:{message:'not found'}},{status:404});
  };
  const input={...params,iCalUid:'',allowConflicts:true,deterministicRecovery:true,recurrence:['RRULE:FREQ=WEEKLY'],description:'Подготовка',fetchImpl};
  await assert.rejects(moveGoogleCalendarLesson(input),error=>!error.definite);
  assert.deepEqual(created.recurrence,['RRULE:FREQ=WEEKLY']);assert.equal(created.description,'Подготовка');
  assert.equal((await moveGoogleCalendarLesson({...input,recoverOnly:true})).iCalUID,'weekly-uid');assert.equal(writes,1);
});
