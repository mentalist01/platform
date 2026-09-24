import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRescheduleStore, registerLessonReschedules, occurrenceKey, overlayReschedules, expandRescheduleOccurrences } from './lessonReschedule.js';

const now=()=>Date.parse('2026-09-24T10:00:00+03:00');
const source={id:'lesson',studentId:'a',studentName:'Аня',date:'2026-09-25',time:'16:00',durationMinutes:60};
async function fixture(t,options={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'reschedule-unit-'));
  const file=path.join(root,'requests.json');const store=createRescheduleStore(file);
  const state={entries:[source],writes:0,applied:0,notices:[],students:{a:{id:'a',name:'Аня',teacherId:'t'},b:{id:'b',name:'Боря',teacherId:'t'}}};
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const [role,id]=String(req.headers.authorization||'').split(':');req.auth={role,id};next();});
  registerLessonReschedules(app,{store,now,getStudent:id=>structuredClone(state.students[id]),getEntries:async()=>options.getEntries?options.getEntries(state):state.entries,
    googleMove:async(row,opt)=>{if(options.googleMove)return options.googleMove(row,opt,state);if(opt?.recoverOnly)return null;state.writes++;return {eventId:'event',iCalUID:'uid'};},
    applyLocal:async row=>{state.applied++;if(options.applyLocal)await options.applyLocal(row,state);else state.entries=[{...row.target,studentId:row.studentId,externalEventId:'uid'}];},
    notify:(row,action)=>state.notices.push(action)});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
  const req=async(url='',role='student:a',body,expected=200)=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/lesson-reschedules${url}`,{method:body===undefined?'GET':'POST',headers:{authorization:role,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.equal(r.status,expected,JSON.stringify(v));return v;
  };
  const create=()=>req('','student:a',{lessonKey:occurrenceKey(source),date:'2026-09-28',time:'18:00'});
  return {state,store,file,req,create};
}

test('dated availability starts next week, checks full duration, excludes group lessons and private names',async t=>{
  const {state,req}=await fixture(t);
  state.entries.push({id:'private',studentId:'b',date:'2026-09-28',time:'18:30',durationMinutes:60,subject:'SECRET'}, {...source,id:'group',date:'2026-09-26',groupId:'g'});
  const data=await req('/availability');assert.equal(data.week,'2026-09-28');assert.equal(data.lessons.length,1);
  assert.ok(data.days[0].slots.includes('17:30'));assert.ok(!data.days[0].slots.includes('18:00'));assert.ok(!data.days[0].slots.includes('19:00'));assert.ok(data.days[0].slots.includes('19:30'));
  assert.ok(!JSON.stringify(data).includes('SECRET'));assert.ok((await req('/availability?week=2026-10-05')).days[0].slots.includes('18:00'));
  await req('/availability?week=2026-09-01','student:a',undefined,400);
  await req('/availability?lessonKey=private','student:a',undefined,409);
});
test('only owner requests and assigned teacher approves; durable approval is idempotent',async t=>{
  const {req,create,state,file}=await fixture(t);const row=await create();
  await req('','student:b',{lessonKey:occurrenceKey(source),date:'2026-09-28',time:'18:00'},409);
  await req(`/${row.id}/approve`,'student:a',{},403);await req(`/${row.id}/preview`,'teacher:other',undefined,403);
  assert.equal((await req('','teacher:other')).requests.length,0);
  await req('','student:a',{lessonKey:occurrenceKey(source),date:'2026-09-29',time:'18:00'},409);
  assert.equal((await req(`/${row.id}/approve`,'teacher:t',{note:'Подходит'})).status,'approved');
  assert.equal((await req(`/${row.id}/approve`,'teacher:t',{})).status,'approved');
  assert.equal(state.writes,1);assert.equal(state.applied,1);assert.equal(createRescheduleStore(file).get(row.id).resolutionNote,'Подходит');
});
test('occupied target and changed source block approval; rejection keeps original schedule',async t=>{
  const {req,create,state}=await fixture(t);const row=await create();
  state.entries.push({id:'other',date:row.target.date,time:'18:30',durationMinutes:60});
  assert.ok((await req(`/${row.id}/preview`,'teacher:t')).conflict);
  await req(`/${row.id}/approve`,'teacher:t',{},409);assert.equal(state.writes,0);
  state.entries=[{...source,time:'17:00'}];await req(`/${row.id}/approve`,'teacher:t',{},409);
  const rejected=await req(`/${row.id}/reject`,'teacher:t',{note:'Другое время'});assert.equal(rejected.status,'rejected');assert.equal(state.applied,0);
});
test('two pupils competing for a slot cannot both receive approval',async t=>{
  const {req,create,state}=await fixture(t);const b={...source,id:'b',studentId:'b',time:'19:00'};state.entries.push(b);
  const a=await create();const rb=await req('','student:b',{lessonKey:occurrenceKey(b),date:a.target.date,time:a.target.time});
  const results=await Promise.allSettled([req(`/${a.id}/approve`,'teacher:t',{}),req(`/${rb.id}/approve`,'teacher:t',{},409)]);
  assert.ok(results.every(r=>r.status==='fulfilled'),JSON.stringify(results));assert.equal(state.writes,1);
});
test('lost Google response recovers committed write before stale feed conflict; local retry survives restart',async t=>{
  const {req,create,state,store}=await fixture(t,{googleMove:async(row,opt,s)=>{if(opt?.recoverOnly)return {eventId:'new',iCalUID:'new-uid'};s.writes++;s.entries.push({...row.target,studentId:'a',externalEventId:'new-uid'});throw Error('timeout');}});
  const row=await create();await req(`/${row.id}/approve`,'teacher:t',{},503);assert.equal(store.get(row.id).status,'applying');
  assert.equal((await req(`/${row.id}/preview`,'teacher:t')).conflict,'','Recovery must stay available when Google already contains the new event');
  await req(`/${row.id}/cancel`,'student:a',{},409);
  assert.equal((await req(`/${row.id}/approve`,'teacher:t',{})).status,'approved');assert.equal(state.writes,1);assert.equal(state.applied,1);
});
test('definite Google rejection never changes local schedule, allows cancel',async t=>{
  const {req,create,state,store}=await fixture(t,{googleMove:async()=>{throw Object.assign(Error('Connect Google'),{status:409,definite:true});}});
  const row=await create();await req(`/${row.id}/approve`,'teacher:t',{},409);assert.equal(store.get(row.id).status,'pending');assert.equal(state.applied,0);
  assert.equal((await req(`/${row.id}/cancel`,'student:a',{})).status,'cancelled');
});
test('reassignment revokes access to pending requests',async t=>{
  const {req,create,state}=await fixture(t);const row=await create();state.students.a.teacherId='other';
  await req(`/${row.id}/approve`,'teacher:t',{},403);await req(`/${row.id}/preview`,'teacher:other',undefined,403);
});
test('reassignment during calendar lookup prevents exposing the old teacher availability',async t=>{
  const {req}=await fixture(t,{getEntries:async state=>{state.students.a.teacherId='other';return state.entries;}});
  await req('/availability','student:a',undefined,409);
});
test('recurring exceptions and previous-day cross-midnight occupancy are preserved',()=>{
  const entries=[{id:'weekly',weekdayKey:'monday',time:'10:00',durationMinutes:60,excludedDates:['2026-09-28']},{id:'late',date:'2026-09-27',time:'23:30',durationMinutes:600}];
  assert.equal(expandRescheduleOccurrences(entries,'2026-09-28').length,1);
  assert.equal(expandRescheduleOccurrences(entries,'2026-10-05').length,1);
});
test('Google feed overlay hides old occurrence until observed, then allows future edits',async t=>{
  const {store}=await fixture(t);const row={id:'r',teacherId:'t',studentId:'a',studentName:'Аня',source:{...source,externalEventId:'uid'},target:{date:'2026-09-28',time:'18:00',durationMinutes:60},googleResult:{iCalUID:'uid'},status:'approved'};store.put(row);
  const moved=overlayReschedules([row.source],'t',store);assert.equal(moved.length,1);assert.equal(moved[0].time,'18:00');
  overlayReschedules(moved,'t',store);assert.equal(store.get('r').feedObserved,true);
  assert.deepEqual(overlayReschedules([],'t',store),[]);
});
