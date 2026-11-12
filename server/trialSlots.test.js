import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {createTrialSlotStore,registerTrialSlots} from './trialSlots.js';
import {ensureGoogleCalendarTrialBooking} from './googleCalendarWriteback.js';

const now=()=>Date.parse('2026-11-09T09:00:00+03:00'),date='2026-11-10';
function storeFor(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-trial-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return createTrialSlotStore(path.join(root,'slots.json'),now);}

test('trial schedules read the current dated link without leaking another pupil or teacher booking',t=>{
  const store=storeFor(t),pupil={id:'a',teacherId:'t',name:'Анна'},regular={id:'regular',time:'10:00'};
  const row={id:'booked',teacherId:'t',slotId:'slot',date,time:'14:00',durationMinutes:60,studentIds:['a','b'],studentNames:['Анна','Борис'],revision:1,meetingUrl:'https://telemost.yandex.ru/j/first'};
  store.putBooking(row);store.putBooking({...row,id:'foreign',teacherId:'other',slotId:'other'});
  const old=[regular,{trialBookingId:'booked',meetingUrl:'https://telemost.yandex.ru/j/stale'}];
  assert.equal(store.entries('t')[0].meetingUrl,row.meetingUrl);
  assert.deepEqual(store.entries('t')[0].participants,[{id:'a',name:'Анна'},{id:'b',name:'Борис'}]);
  assert.deepEqual(store.studentSchedule(pupil,old).map(e=>e.id),['regular','trial-booking-booked']);
  store.putBooking({...row,meetingUrl:'https://telemost.yandex.ru/j/changed'});
  assert.equal(store.studentSchedule(pupil,old)[1].meetingUrl,'https://telemost.yandex.ru/j/changed');
  assert.equal(store.studentSchedule(pupil,old)[1].studentId,'a');
  assert.deepEqual(store.studentSchedule({...pupil,id:'not-enrolled'},old),[regular]);
  store.putBooking({...row,studentIds:[],studentNames:[]});
  assert.deepEqual(store.entries('t'),[]);assert.deepEqual(store.studentSchedule(pupil,old),[regular]);
});
test('weekly reserves persist, exclude empty lessons and reject partial overlaps but allow touching boundaries',t=>{
  const store=storeFor(t),plan=store.setSlots('t',[{day:1,time:'14:00',durationMinutes:60},{day:3,time:'10:30',durationMinutes:40}],0);
  assert.equal(store.entries('t').length,0);assert.equal(store.reservations('t').length,2);
  for(const entry of [{date,time:'14:30',durationMinutes:30},{weekdayKey:'tuesday',time:'13:30',durationMinutes:45},{date:'2027-05-11',time:'14:00',durationMinutes:60}])assert.throws(()=>store.assertFree('t',entry),/закреплено/);
  for(const entry of [{date,time:'13:00',durationMinutes:60},{date,time:'15:00',durationMinutes:30},{date:'2026-11-03',time:'14:00',durationMinutes:60}])store.assertFree('t',entry);
  store.assertFree('other',{date,time:'14:00',durationMinutes:60});
  assert.throws(()=>store.setSlots('t',plan.slots,0),/другом окне/);
  assert.throws(()=>store.setSlots('t',[{day:0,time:'12:00',durationMinutes:30},{day:0,time:'14:00',durationMinutes:40}],1),/разные дни/);
  assert.throws(()=>store.setSlots('t',Array.from({length:5},(_,day)=>({day,time:'12:00',durationMinutes:60})),1),/четырёх/);
});

test('dated meeting links and teacher-wide invitation templates persist without creating empty lessons or overwriting participants',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-trial-invitation-')),file=path.join(root,'slots.json');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const store=createTrialSlotStore(file,now),slot=store.setSlots('t',[{day:1,time:'14:00',durationMinutes:60}],0).slots[0];
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.auth={role:req.headers['x-role'] || 'teacher',id:req.headers['x-id'] || 't'};next();});
  let syncCalls=0;
  registerTrialSlots(app,{store,getTeacher:id=>['t','other'].includes(id),getStudent:id=>({id,teacherId:'t',name:'Аня'}),getEntries:async()=>[],applyStudents:async()=>{},syncGoogle:async()=>{syncCalls++;return{};},now});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api/trial-slots`;
  const request=async(method,url,body,status=200,headers={})=>{
    const response=await fetch(base+url,{method,headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
  };
  const endpoint=`/${slot.id}/${date}/meeting`,url='https://telemost.yandex.ru/j/first';
  await request('PATCH',endpoint,{meetingUrl:url,revision:0},403,{'x-role':'student'});
  await request('PATCH',endpoint,{meetingUrl:url,revision:0},404,{'x-id':'other'});
  await request('PATCH',`/${slot.id}/2026-11-11/meeting`,{meetingUrl:url,revision:0},404);
  await request('PATCH',endpoint,{meetingUrl:'javascript:alert(1)',revision:0},400);
  let result=await request('PATCH',endpoint,{meetingUrl:url,revision:0});
  assert.equal(result.bookings[0].meetingUrl,url);assert.deepEqual(result.bookings[0].studentIds,[]);
  assert.equal(syncCalls,0);assert.deepEqual(store.entries('t'),[],'a link in an empty reserve must not start a lesson or trigger Google');
  await request('PATCH',endpoint,{meetingUrl:'https://example.com/other',revision:0},409);
  const template='Привет!\nЧерез час начинаем: {ссылка}';
  await request('PUT','/invitation-template',{template:'без ссылки',revision:1},400);
  result=await request('PUT','/invitation-template',{template,revision:1});
  assert.equal(result.invitationTemplate,template);assert.equal(result.revision,2);
  await request('PUT','/invitation-template',{template,revision:1},409);
  assert.notEqual((await request('GET','',undefined,200,{'x-id':'other'})).invitationTemplate,template);
  // Slot edits retain the global template, and participant changes retain the dated link.
  result=await request('PUT','',{slots:[slot],revision:2});assert.equal(result.invitationTemplate,template);
  result=await request('POST',`/${slot.id}/${date}/participants`,{studentId:'a',revision:1});
  assert.equal(result.bookings[0].meetingUrl,url);assert.deepEqual(result.bookings[0].studentIds,['a']);
  const restored=createTrialSlotStore(file,now);
  assert.equal(restored.configuration('t').invitationTemplate,template);assert.equal(restored.getBooking('t',slot.id,date).meetingUrl,url);
  const nextDate='2026-11-17';
  result=await request('PATCH',`/${slot.id}/${nextDate}/meeting`,{meetingUrl:'https://telemost.yandex.ru/j/second',revision:0});
  assert.equal(result.bookings.find(row=>row.date===date).meetingUrl,url,'the following week does not replace this meeting link');
  const booked=store.getBooking('t',slot.id,date);
  result=await request('PATCH',endpoint,{meetingUrl:'',revision:booked.revision});
  assert.deepEqual(result.bookings.find(row=>row.date===date).studentIds,['a']);assert.equal(store.getBooking('t',slot.id,date).meetingUrl,'');
});
test('moving a reserve keeps past lessons and shifts all future bookings atomically with stable Google identities',t=>{
  const store=storeFor(t),slot=store.setSlots('t',[{day:1,time:'14:00',durationMinutes:60}],0).slots[0];
  const row={teacherId:'t',slotId:slot.id,id:'booked',date,time:'14:00',durationMinutes:60,studentIds:['a'],studentNames:['Аня'],revision:1,google:{eventId:'stable'},syncStatus:'synced'};
  store.putBooking(row);store.putBooking({...row,id:'past',date:'2026-11-03'});
  assert.throws(()=>store.setSlots('t',[{...slot,day:0,time:'08:00'}],1,{moveBookings:true}),/прошло/);
  assert.equal(store.configuration('t').revision,1);assert.equal(store.getBooking('t',slot.id,date).date,date);
  store.setSlots('t',[{...slot,day:2,time:'15:00',durationMinutes:40}],1,{moveBookings:true});
  assert.equal(store.getBooking('t',slot.id,date),null);
  const moved=store.getBooking('t',slot.id,'2026-11-11');
  assert.equal(moved.id,'booked');assert.equal(moved.revision,2);assert.equal(moved.time,'15:00');assert.equal(moved.durationMinutes,40);assert.equal(moved.syncStatus,'pending');
  assert.equal(moved.google.eventId,'stable');assert.equal(store.getBooking('t',slot.id,'2026-11-03').date,'2026-11-03');
});
test('participants belong to one dated occurrence; multiple pupils, cancellation and unavailable Google recover durably',async t=>{
  const store=storeFor(t),slot=store.setSlots('t',[{day:1,time:'14:00',durationMinutes:60}],0).slots[0];
  const pupils={a:{id:'a',teacherId:'t',name:'Аня'},b:{id:'b',teacherId:'t',name:'Борис'},foreign:{id:'foreign',teacherId:'other',name:'Чужой'}};
  let remoteAvailable=false,extra=[],applied=[],calls=0;
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.auth={role:req.headers['x-role'] || 'teacher',id:req.headers['x-id'] || 't'};next();});
  const runner=registerTrialSlots(app,{store,getTeacher:id=>['t','other'].includes(id),getStudent:id=>pupils[id],
    getEntries:async()=>[...extra,...store.reservations('t'),...store.entries('t')],
    applyStudents:row=>applied.push(structuredClone(row)),syncGoogle:async row=>{calls++;if(!remoteAvailable)throw Error('Google offline');return {iCalUID:`${row.id}@test`};},now});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api/trial-slots`;
  const request=async(method,url,body={},status=200,headers={})=>{const response=await fetch(base+url,{method,headers:{'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
  await request('GET','',{},403,{'x-role':'student','x-id':'a'});
  await request('POST',`/${slot.id}/${date}/participants`,{studentId:'foreign',revision:0},403);
  extra=[{id:'other-lesson',date,time:'14:45',durationMinutes:30}];
  await request('POST',`/${slot.id}/${date}/participants`,{studentId:'a',revision:0},409);assert.equal(calls,0);
  extra=[];
  let result=await request('POST',`/${slot.id}/${date}/participants`,{studentId:'a',revision:0});
  assert.equal(result.bookings[0].syncStatus,'pending');assert.equal(applied.length,1);assert.equal(store.entries('t').length,1);assert.equal(store.entries('t')[0].isTrial,true);
  const retry=await request('POST',`/${slot.id}/${date}/participants`,{studentId:'a',revision:0});assert.equal(retry.bookings[0].studentIds.length,1);
  await request('POST',`/${slot.id}/${date}/participants`,{studentId:'b',revision:0},409);
  remoteAvailable=true;await runner.retryPending();
  result=await request('POST',`/${slot.id}/${date}/participants`,{studentId:'b',revision:1});
  assert.deepEqual(result.bookings[0].participants.map(p=>p.name),['Аня','Борис']);assert.equal(store.entries('t').length,1);
  assert.equal(store.entries('t').filter(entry=>entry.date==='2026-11-17').length,0);
  await request('PUT','',{slots:[],revision:1},409);
  result=await request('PUT','',{slots:[slot],revision:1});assert.equal(result.revision,2);
  result=await request('DELETE',`/${slot.id}/${date}/participants/a`,{revision:2});
  assert.deepEqual(applied.at(-1).previousStudentIds,['a','b']);assert.equal(result.bookings[0].studentIds.length,1);
  await request('DELETE',`/${slot.id}/${date}/participants/b`,{revision:3});
  assert.equal(store.entries('t').length,0);assert.equal(store.reservations('t').length,1);
  assert.deepEqual(applied.at(-1).studentIds,[]);
  // A dated lesson in the past must not prevent a new weekly reservation.
  extra=[{date:'2026-11-08',time:'12:00',durationMinutes:60}];
  result=await request('PUT','',{slots:[{day:6,time:'12:00',durationMinutes:40}],revision:2});
  assert.equal(result.slots[0].durationMinutes,40);
  extra=[{weekdayKey:'sunday',time:'12:15',durationMinutes:60,excludedDates:['2026-11-15']}];
  await request('PUT','',{slots:result.slots,revision:3},409);
});
test('Google receives one event only when booked, updates the roster and cancels after the last participant',async()=>{
  let event=null,creates=0,patches=0;
  const fetchImpl=async(url,options={})=>{
    const method=options.method || 'GET';
    if(method==='GET')return new Response(JSON.stringify(event||{error:{message:'not found'}}),{status:event?200:404});
    const body=JSON.parse(options.body);
    if(method==='POST'){creates++;event={...body,iCalUID:'trial@google',etag:'1'};}
    if(method==='PATCH'){patches++;event={...event,...body};}
    return new Response(JSON.stringify(event),{status:200});
  };
  const booking={teacherId:'t',id:'one',date,time:'14:00',durationMinutes:40,studentIds:[],studentNames:[]};
  await ensureGoogleCalendarTrialBooking({accessToken:'test',calendarId:'cal',booking,fetchImpl});assert.equal(creates,0);
  booking.studentIds=['a'];booking.studentNames=['Аня'];
  await ensureGoogleCalendarTrialBooking({accessToken:'test',calendarId:'cal',booking,fetchImpl});
  assert.equal(creates,1);assert.deepEqual(event.reminders,{useDefault:true});assert.equal(event.end.dateTime,'2026-11-10T11:40:00.000Z');
  booking.studentIds.push('b');booking.studentNames.push('Борис');
  await ensureGoogleCalendarTrialBooking({accessToken:'test',calendarId:'cal',booking,fetchImpl});assert.equal(creates,1);assert.match(event.summary,/Аня, Борис/);
  booking.studentIds=[];booking.studentNames=[];
  await ensureGoogleCalendarTrialBooking({accessToken:'test',calendarId:'cal',booking,fetchImpl});assert.equal(event.status,'cancelled');assert.equal(patches,2);
  event.extendedProperties.private.ivan100TrialTeacher='foreign';
  await assert.rejects(ensureGoogleCalendarTrialBooking({accessToken:'test',calendarId:'cal',booking,fetchImpl}),/не принадлежит/);
});
test('a persistent Google creation conflict is bounded and remains retryable',async()=>{
  let creates=0;
  const fetchImpl=async(url,options={})=>{
    if(options.method==='POST')creates++;
    return new Response(JSON.stringify({error:{message:'Conflict'}}),{status:options.method==='POST'?409:404});
  };
  await assert.rejects(ensureGoogleCalendarTrialBooking({accessToken:'test',calendarId:'cal',fetchImpl,
    booking:{teacherId:'t',id:'conflict',date,time:'14:00',durationMinutes:60,studentIds:['a'],studentNames:['Аня']}}));
  assert.equal(creates,3);
});
