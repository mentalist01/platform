import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRescheduleStore } from './lessonReschedule.js';
import { registerTeacherCalendarEdits, overlayCalendarEdits, calendarEditTargetEntry } from './teacherCalendarEdits.js';
const original={id:'local-a',studentId:'a',studentName:'Анна',date:'2026-10-20',time:'12:05',durationMinutes:60,subject:'Занятие'};
async function fixture(t, options={}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-edits-')),file=path.join(directory,'edits.json'),store=createRescheduleStore(file);
  const state={entries:[original],writes:0,applies:0,notices:0};
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const[role,id]=String(req.headers.authorization||'').split(':');req.auth={role,id};next();});
  registerTeacherCalendarEdits(app,{store,getTeacher:id=>['t','other'].includes(id),getStudent:id=>id==='a'?{id,teacherId:'t',name:'Анна'}:null,getGroup:id=>id==='g'?{id,teacherId:'t',name:'Группа 2'}:null,
    getEntries:async()=>state.entries,googleChange:async(row,opts)=>{if(options.change)return options.change(row,opts,state);if(opts?.recoverOnly)return null;state.writes++;return{iCalUID:'uid-'+row.id,eventId:'google-id'};},
    applyLocal:async row=>{state.applies++;if(options.apply)await options.apply(row,state);else state.entries=[calendarEditTargetEntry(row)];},notify:()=>state.notices++});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});});
  const request=async(url='',body,expected=200,auth='teacher:t')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/teacher-calendar/edits${url}`,{method:body===undefined?'GET':'POST',headers:{authorization:auth,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));return value;};
  return{state,store,file,request};
}
const move=(id='request-move-0001')=>({id,operation:'move',source:original,target:{date:'2026-10-20',time:'12:15',durationMinutes:60}});
test('owned event moves once, repeated requests are idempotent and stale/foreign writes are rejected',async t=>{
  const{request,state}=await fixture(t);
  await request('',move(),403,'student:a');await request('',move(),403,'teacher:other');
  await request('',{...move(),target:{...move().target,durationMinutes:90}},400);
  const moved=await request('',move());assert.equal(moved.status,'done');assert.equal(state.writes,1);assert.equal(state.entries[0].time,'12:15');
  await request('',move());assert.equal(state.writes,1);assert.equal(state.applies,1);
  await request('',move('request-stale-001'),409);assert.deepEqual((await request()).edits,[]);
});
test('creating personal, student and group events retains their ownership and repeat mode',async t=>{
  const{request,store,state}=await fixture(t);
  for(const[id,extra]of[['request-personal-01',{}],['request-student-001',{studentId:'a'}],['request-group-00001',{groupId:'g',repeatMode:'weekly'}]]){
    const body={id,operation:'create',target:{date:'2026-10-20',time:'15:00',durationMinutes:60,title:'Свое название',...extra}};
    await request('',body);assert.equal(store.get(id).target.title,'Свое название');assert.equal(store.get(id).target.groupId,extra.groupId||'');
  }
  assert.equal(state.writes,3);assert.equal(store.get('request-group-00001').target.repeatMode,'weekly');
  await request('',{id:'request-foreign-001',operation:'create',target:{date:'2026-10-20',time:'15:00',durationMinutes:60,studentId:'missing'}},403);
});
test('lost Google response recovers without a second write and local failures retry only the local stage',async t=>{
  let acknowledged=false,localAttempts=0;
  const{request,state,store}=await fixture(t,{change:async(_row,opts,state)=>{if(opts?.recoverOnly)return acknowledged?{iCalUID:'uid',eventId:'event'}:null;state.writes++;acknowledged=true;throw Error('network lost');},apply:async()=>{if(++localAttempts===1)throw Error('disk failed');}});
  await request('',move(),503);assert.equal(store.get(move().id).status,'applying');
  await request('/'+move().id+'/cancel',{},409);
  await request('/'+move().id+'/retry',{},503);assert.ok(store.get(move().id).googleResult);
  await request('/'+move().id+'/retry',{});assert.equal(state.writes,1);assert.equal(localAttempts,2);
});
test('a definite rejection can be cancelled and does not block a fresh move',async t=>{
  let reject=true;
  const{request,store,state}=await fixture(t,{change:async()=>{if(reject)throw Object.assign(Error('No scope'),{status:409,definite:true});state.writes++;return{iCalUID:'uid'};}});
  await request('',move(),409);assert.equal((await request()).edits[0].status,'pending');
  await request('/'+move().id+'/cancel',{});reject=false;
  await request('',move('request-retry-0002'));assert.equal(state.writes,1);assert.equal(store.get(move().id).status,'cancelled');
});
test('a lagging feed projects repeated moves to the latest occurrence without duplicates, then follows external changes',async t=>{
  const{store}=await fixture(t);
  const a={...move(),teacherId:'t',status:'done',googleResult:{iCalUID:'uid'},target:{...move().target,title:'Урок',studentId:'a'}};
  store.put(a);
  const first=calendarEditTargetEntry(a);
  const b={...a,id:'request-second-001',source:first,target:{...a.target,time:'13:15'}};store.put(b);
  const projected=overlayCalendarEdits([{...original,externalEventId:'uid'}],'t',store);
  assert.equal(projected.length,1);assert.equal(projected[0].time,'13:15');assert.equal(projected[0].calendarPlatformOwner.studentId,'a');
  overlayCalendarEdits([{...calendarEditTargetEntry(b),calendarEditProjected:false}],'t',store);
  assert.equal(store.get(b.id).feedObserved,true);
  const external=overlayCalendarEdits([{...calendarEditTargetEntry(b),time:'14:15',calendarEditProjected:false}],'t',store);
  assert.equal(external.length,1);assert.equal(external[0].time,'14:15');
});
