import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRescheduleStore, expandRescheduleOccurrences } from './lessonReschedule.js';
import { registerWeeklySchedules, applyWeeklySchedule, weeklyReservations, weeklyScheduleSignature } from './weeklySchedule.js';
import { resolveNextLessonStart } from '../src/utils/homeworkDueAt.js';
import { expandLessonScheduleOccurrences } from './lessonTopics.js';

const now = () => Date.parse('2026-09-28T09:00:00+03:00');
async function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-'));
  const file = path.join(dir, 'requests.json'), store = createRescheduleStore(file);
  const state = { groupStudents: new Set(), students: { a:{id:'a',name:'Аня',teacherId:'t'}, b:{id:'b',name:'Боря',teacherId:'t'} }, schedules:{a:[],b:[]}, extra:[], writes:0, notices:[] };
  const app = express(); app.use(express.json()); app.use((req,_res,next) => { const [role,id] = String(req.headers.authorization || '').split(':'); req.auth={role,id}; next(); });
  registerWeeklySchedules(app, { store, now, getStudent:id=>state.students[id], getSchedule:id=>state.schedules[id],
    canRequestIndividualSchedule: id => !state.groupStudents.has(id),
    getEntries: async teacherId => { if (options.load) await options.load(state); return [...state.extra,...Object.entries(state.schedules).flatMap(([studentId, entries])=>entries.map(e=>({...e,studentId}))),...weeklyReservations(store,teacherId)]; },
    applyLocal: row => { state.schedules[row.studentId]=applyWeeklySchedule(state.schedules[row.studentId],row,now()); state.writes++; if(options.apply)options.apply(state); },
    notify:(r,a)=>state.notices.push(a),
  });
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
  const req=async(url='',who='student:a',body,status=200)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/weekly-schedules${url}`,{method:body===undefined?'GET':'POST',headers:{authorization:who,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;};
  const create=(who='student:a',extra={})=>req('',who,{startDate:'2026-10-05',durationMinutes:60,slots:['0-600','2-600'],baseSignature:weeklyScheduleSignature(state.schedules[who.split(':')[1]]),...extra});
  return {req,create,state,store,file};
}

test('new student can pick a recurring week; full-duration future conflicts and private titles excluded',async t=>{
  const {req,state}=await fixture(t);state.extra.push({date:'2026-10-12',time:'10:30',durationMinutes:60,subject:'SECRET'}, {weekdayKey:'friday',time:'23:30',durationMinutes:90});
  const v=await req('/availability?startDate=2026-10-05');assert.equal(v.config.weeks,8);assert.ok(v.blocked['0-600']);assert.ok(v.blocked['0-660']);assert.ok(!v.blocked['0-690']);assert.ok(!JSON.stringify(v).includes('SECRET'));
  await req('/availability','teacher:t',undefined,403);
});
test('only assigned teacher approves; recurring schedule survives restart without duplicates and starts on chosen date',async t=>{
  const {req,create,state,file}=await fixture(t);const row=await create();assert.equal(state.schedules.a.length,0);
  assert.equal((await req('','teacher:t')).requests[0].id,row.id);await req(`/${row.id}/approve`,'teacher:other',{},403);await req(`/${row.id}/approve`,'student:a',{},403);
  await req(`/${row.id}/approve`,'teacher:t',{});await req(`/${row.id}/approve`,'teacher:t',{});assert.equal(state.writes,1);assert.equal(state.schedules.a.length,2);assert.equal(createRescheduleStore(file).get(row.id).status,'approved');
  assert.equal(expandRescheduleOccurrences(state.schedules.a,'2026-09-28').length,0);
  assert.equal(expandRescheduleOccurrences(state.schedules.a,'2027-10-04').length,2);
  assert.equal(resolveNextLessonStart(state.schedules.a,{now:new Date(now()),calendarOffsetMinutes:180}).toISOString(),'2026-10-05T07:00:00.000Z');
});
test('replacement keeps old history, single dated exceptions and unrelated manual lessons',async t=>{
  const {req,create,state}=await fixture(t);const first=await create();await req(`/${first.id}/approve`,'teacher:t',{});
  state.schedules.a.push({id:'manual',date:'2026-10-11',time:'17:00',durationMinutes:60});
  const second=await create('student:a',{startDate:'2026-10-19',slots:['1-600','3-600']});await req(`/${second.id}/approve`,'teacher:t',{});
  assert.equal(expandRescheduleOccurrences(state.schedules.a,'2026-10-05').length,3);
  assert.deepEqual(expandRescheduleOccurrences(state.schedules.a,'2026-10-19').map(e=>e.weekdayKey),['tuesday','thursday']);
  assert.equal(state.schedules.a.find(e=>e.id==='manual').date,'2026-10-11');
  assert.equal(state.schedules.a.find(e=>e.weeklyRequestId===first.id).repeatUntil,'2026-10-18');
});
test('two students requesting same weekly hours cannot both get approved; rejection and cancellation do not change schedule',async t=>{
  const {req,create,state}=await fixture(t);const a=await create(),b=await create('student:b');
  await req(`/${a.id}/approve`,'teacher:t',{});await req(`/${b.id}/approve`,'teacher:t',{},409);
  assert.ok((await req(`/${b.id}/preview`,'teacher:t')).conflict);await req(`/${b.id}/reject`,'teacher:t',{note:'Другое время'});assert.equal(state.schedules.b.length,0);
  const c=await create('student:b',{slots:['1-600','3-600']});await req(`/${c.id}/cancel`,'student:b',{});assert.equal(state.schedules.b.length,0);
});
test('lost local response retries safely without duplicating weekly entries',async t=>{
  const {req,create,state,store}=await fixture(t,{apply:s=>{if(s.writes===1)throw Error('write response lost');}});const row=await create();
  await req(`/${row.id}/approve`,'teacher:t',{},503);assert.equal(store.get(row.id).status,'applying');await req(`/${row.id}/cancel`,'student:a',{},409);
  state.groupStudents.add('a');
  await req(`/${row.id}/approve`,'teacher:t',{});assert.equal(state.schedules.a.length,2);
});

test('mini-group membership blocks new weekly requests and pending approval, but allows history and cancellation', async t => {
  const { req, create, state } = await fixture(t);
  const row = await create();
  state.groupStudents.add('a');
  await req('/availability', 'student:a', undefined, 403);
  await req('', 'student:a', {}, 403);
  assert.equal((await req()).requests[0].id, row.id);
  assert.match((await req(`/${row.id}/preview`, 'teacher:t')).conflict, /мини-группы/);
  await req(`/${row.id}/approve`, 'teacher:t', {}, 403);
  assert.equal(state.writes, 0);
  assert.equal((await req(`/${row.id}/cancel`, 'student:a', {})).status, 'cancelled');
  state.groupStudents.delete('a');
  const next = await create();
  assert.equal((await req(`/${next.id}/approve`, 'teacher:t', {})).status, 'approved');
});

test('joining a mini-group during weekly calendar lookup blocks availability, creation and approval', async t => {
  for (const action of ['availability', 'create', 'approve']) {
    let join = false;
    const { req, create, state, store } = await fixture(t, { load: s => { if (join) s.groupStudents.add('a'); } });
    const row = action === 'approve' ? await create() : null;
    join = true;
    if (action === 'availability') await req('/availability', 'student:a', undefined, 403);
    if (action === 'create') await req('', 'student:a', { startDate: '2026-10-05', slots: ['0-600'], baseSignature: '[]' }, 403);
    if (action === 'approve') await req(`/${row.id}/approve`, 'teacher:t', {}, 403);
    assert.equal(state.writes, 0);
    assert.ok(store.all().every(r => r.status === 'pending'));
  }
});
test('changed roster and calendar failures cannot publish availability or approve',async t=>{
  const f=await fixture(t);const row=await f.create();f.state.students.a.teacherId='other';await f.req(`/${row.id}/approve`,'teacher:t',{},403);
  const g=await fixture(t,{load:s=>{s.students.a.teacherId='other';}});await g.req('/availability','student:a',undefined,409);
  const h=await fixture(t,{load:()=>{throw Error('calendar timeout');}});await h.req('/availability','student:a',undefined,503);
});
test('stale schedule and malformed selections are rejected; repeated pending request does not replace it',async t=>{
  const {req,create,state}=await fixture(t);
  await req('','student:a',{startDate:'2026-10-05',slots:['0-600','0-630'],baseSignature:'[]'},400);
  await req('','student:a',{startDate:'2026-10-05',slots:['bad'],baseSignature:'[]'},400);
  const row=await create();await req('','student:a',{startDate:'2026-10-05',slots:['0-600'],baseSignature:'[]'},409);
  state.schedules.a.push({id:'else',source:'weekly-request',weekdayKey:'monday',time:'15:00',durationMinutes:60});
  await req(`/${row.id}/approve`,'teacher:t',{},409);
});
test('lesson topic expansion respects weekly start/end bounds',()=>{
  const schedule=[{id:'w',weekdayKey:'monday',time:'10:00',durationMinutes:60,repeatFrom:'2026-10-05',repeatUntil:'2026-10-12'}];
  const rows=expandLessonScheduleOccurrences({studentId:'a',schedule,fromDayKey:'2026-09-28',toDayKey:'2026-10-26'});
  assert.deepEqual(rows.map(r=>r.dayKey),['2026-10-05','2026-10-12']);
});
