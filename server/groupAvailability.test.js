import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { availabilityConfig, busySlots, createAvailabilityStore, materializeAvailabilityPlans, registerGroupAvailability } from './groupAvailability.js';
import { addCalendarDays, moscowDay, availabilitySlots, rankedSlots, suggestedPair } from '../src/utils/groupAvailability.js';

const tomorrow = addCalendarDays(moscowDay(), 1);
const config = (extra = {}) => ({ startDate: tomorrow, durationMinutes: 60, startMinute: 600, endMinute: 1260, days: [0,1,2,3,4,5,6], weeks: 8, ...extra });
const member = id => ({ studentId: id, status: 'active' });
const group = id => ({ id, teacherId: 't', name: 'Группа', status: 'active', members: [member('a'), member('b')] });

test('validates real dates, hours, duration and weekdays; Moscow date boundary', () => {
  assert.equal(moscowDay(Date.parse('2026-09-23T22:30:00Z')), '2026-09-24');
  assert.equal(availabilityConfig(config()).weeks, 8);
  for (const patch of [{startDate:'2026-02-31'}, {startDate:'2000-01-01'}, {days:null}, {days:[7]}, {durationMinutes:61}, {startMinute:601}, {endMinute:590}]) {
    assert.throws(() => availabilityConfig(config(patch)));
  }
  assert.equal(availabilitySlots(config({ durationMinutes:90, startMinute:600, endMinute:720, days:[1] })).length, 2);
});
test('busy calendar checks whole duration, adjacency, recurrence, exceptions and midnight without returning private data', () => {
  const cfg = config({startDate:'2026-09-28', weeks:1}); // Monday
  const now = Date.parse('2026-09-23');
  const entries = [
    {date:'2026-09-28', time:'11:00', durationMinutes:60, subject:'PRIVATE'},
    {weekdayKey:'tuesday',time:'10:00',durationMinutes:60},
    {date:'2026-09-30',time:'10:00',cancelled:true},
    {weekdayKey:'thursday',time:'10:00',excludedDates:['2026-10-01']},
    {weekdayKey:'friday',time:'10:00',cancelledDates:['2026-10-02']},
  ];
  const busy = busySlots(cfg, entries, now);
  assert.equal(busy['0-600'], undefined); assert.deepEqual(busy['0-630'], ['2026-09-28']);
  assert.equal(busy['0-720'], undefined); assert.ok(busy['1-600']);
  for (const d of [2,3,4]) assert.equal(busy[`${d}-600`], undefined);
  assert.ok(!JSON.stringify(busy).includes('PRIVATE'));
  const midnight = busySlots({...cfg,startMinute:0,endMinute:120}, [{date:'2026-09-27',time:'23:30',durationMinutes:90}], now);
  assert.ok(midnight['0-0']); assert.equal(midnight['0-60'], undefined);
  assert.ok(busySlots({...cfg,weeks:8}, [{date:'2026-11-16',time:'10:00'}], now)['0-600']);
});
test('empty answer differs from not answered, and ranking ignores blocked times', () => {
  const poll = { config:config(), members:[{id:'a'},{id:'b'},{id:'c'}], answers:{a:{choices:{'0-600':'yes','1-600':'maybe'}}, b:{choices:{}}} };
  const first = rankedSlots(poll)[0];
  assert.equal(first.no,1); assert.equal(first.pending,1);
  assert.deepEqual(suggestedPair(poll,{}), ['0-600','1-600']);
  assert.deepEqual(suggestedPair(poll,{'0-600':['x']}), ['1-600']);
});
test('approved schedule survives reload, derives stable occurrences, preserves history and manual cancellations', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ga-store-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'polls.json'); const store=createAvailabilityStore(file);
  const g=group('g'); const now=Date.parse('2026-09-23T08:00:00Z');
  const plan={id:'p',config:config({startDate:'2026-09-28'}),slots:['0-600','3-660']};
  store.put('g',{plan}); assert.deepEqual(createAvailabilityStore(file).plans(),[{groupId:'g',...plan}]);
  const create=(g,p,opts)=>({...p,id:opts.id,groupId:g.id,status:'scheduled'});
  const a=materializeAvailabilityPlans(store.plans(),[g],[],create,now);
  assert.equal(a.lessons.length,16); assert.equal(new Set(a.lessons.map(l=>l.id)).size,16);
  a.lessons[0].status='cancelled';
  assert.equal(materializeAvailabilityPlans(store.plans(),[g],a.lessons,create,now).changed,false);
  const history={...a.lessons[1],id:'history',status:'completed'};
  const manual={...a.lessons[1],id:'manual',source:'manual'};
  const active={...a.lessons[1],id:'active',status:'active'};
  const next=materializeAvailabilityPlans([{groupId:'g',...plan,id:'p2'}],[g],[...a.lessons,history,manual,active],create,now);
  assert.equal(next.lessons.find(l=>l.id==='history').status,'completed');
  assert.equal(next.lessons.find(l=>l.id==='manual').status,'scheduled');
  assert.equal(next.lessons.find(l=>l.id==='active').status,'active');
  assert.equal(next.lessons.filter(l=>l.source==='availability-plan' && l.scheduleEntryId?.startsWith('p:') && l.status==='scheduled').length,0);
  assert.equal(materializeAvailabilityPlans(store.plans(),[{...g,status:'completed'}],[],create,now).lessons.length,0);
});

async function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ga-api-'));
  const store=createAvailabilityStore(path.join(dir,'polls.json'));
  const state={groups:[group('g'),group('g2')],entries:[],down:false,approved:[], hook:null};
  const app=express(); app.use(express.json());
  app.use((req,_res,next)=>{req.auth={id:req.headers['x-user'],role:req.headers['x-role']};next();});
  registerGroupAvailability(app,{store,getGroup:id=>state.groups.find(g=>g.id===id),canManage:(a,g)=>a.role==='teacher'&&a.id===g.teacherId,
    getStudentName:id=>id==='a'?'Аня':'Борис',getBusyEntries:async (g,c,force)=>{
      if(state.down) throw Error('offline');
      if(state.hook) await state.hook(g,c,force);
      return state.entries;
    },materialize:()=>{state.approved=store.plans();}});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
  const call=async(action='',body=null,id='t',role='teacher',gid='g',status=200)=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/learning-groups/${gid}/availability${action?'/'+action:''}`,
      {method:action?'POST':'GET',headers:{'Content-Type':'application/json','x-user':id,'x-role':role},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await r.json();assert.equal(r.status,status,JSON.stringify(payload));return payload;
  };
  const open=async(gid='g')=>(await call('open',config(),'t','teacher',gid)).poll.id;
  return {call,open,state,store};
}
test('API isolates groups, rejects removed pupils, validates answers and preserves concurrent responses', async t=>{
  const {call,open,state}=await fixture(t); const roundId=await open();
  await call('',null,'x','student','g',403); await call('',null,'x','teacher','g',403);
  await call('open',config(),'a','student','g',403);
  await call('answer',{roundId,version:0,choices:{}},'t','teacher','g',403);
  await Promise.all(['a','b'].map(id=>call('answer',{roundId,version:0,choices:{'0-600':'yes'}},id,'student')));
  assert.equal(Object.keys((await call()).poll.answers).length,2);
  await call('answer',{roundId,version:0,choices:{}},'a','student','g',409);
  await call('answer',{roundId,version:1,choices:{'0-601':'yes'}},'a','student','g',400);
  state.entries=[{weekdayKey:'monday',time:'10:00'}];
  await call('answer',{roundId,version:1,choices:{'0-600':'yes'}},'a','student','g',409);
  state.groups[0].members[0].status='removed';
  await call('',null,'a','student','g',403);
  assert.equal((await call()).poll.answers.a,undefined);
  state.down=true; assert.ok((await call()).calendarError);
  await call('propose',{roundId,slots:['1-600','2-600']},'t','teacher','g',503);
});
test('proposal consensus is tied to current proposal, answers and roster; approval rechecks occupancy', async t=>{
  const {call,open,state}=await fixture(t); const roundId=await open();
  await call('propose',{roundId,slots:['0-600','0-660']},'t','teacher','g',400);
  let p=(await call('propose',{roundId,slots:['0-600','3-600'],comment:'Договоримся'})).poll.proposal;
  await call('approve',{roundId,proposalId:p.id},'t','teacher','g',409);
  await call('vote',{roundId,proposalId:'old',choice:'yes'},'a','student','g',409);
  const vote=(id,choice='yes')=>call('vote',{roundId,proposalId:p.id,choice},id,'student');
  await vote('a'); await vote('b','no');
  await call('approve',{roundId,proposalId:p.id},'t','teacher','g',409);
  await vote('b','maybe');
  await call('answer',{roundId,version:0,choices:{}},'a','student');
  assert.equal((await call()).poll.proposal.votes.a,undefined); await vote('a');
  state.hook=async(_g,_c,force)=>{if(force) state.groups[0].members.push(member('c'));};
  await call('approve',{roundId,proposalId:p.id},'t','teacher','g',409); state.hook=null;
  await vote('c'); state.entries=[{weekdayKey:'monday',time:'10:30',subject:'secret'}];
  await call('approve',{roundId,proposalId:p.id},'t','teacher','g',409); state.entries=[];
  assert.equal((await call('approve',{roundId,proposalId:p.id})).poll.status,'approved');
  assert.equal(state.approved.length,1);
  await call('vote',{roundId,proposalId:p.id,choice:'no'},'a','student','g',409);
  const next=(await call('open',{...config(),previousRoundId:roundId})).poll;
  assert.ok(next.plan); assert.deepEqual(next.answers,{}); assert.equal(next.proposal,null);
  await call('answer',{roundId,version:0,choices:{}},'a','student','g',409);
});
test('simultaneous approvals of two groups cannot reserve the same teacher time', async t=>{
  const {call,open,state}=await fixture(t);
  const requests=[];
  for(const gid of ['g','g2']) {
    const roundId=await open(gid);
    const proposalId=(await call('propose',{roundId,slots:['0-600','3-600']},'t','teacher',gid)).poll.proposal.id;
    for(const id of ['a','b']) await call('vote',{roundId,proposalId,choice:'yes'},id,'student',gid);
    requests.push({gid,body:{roundId,proposalId}});
  }
  state.hook=async()=>{state.entries=state.approved.length?[{weekdayKey:'monday',time:'10:00'}]:[];};
  await Promise.all(requests.map((r,i)=>call('approve',r.body,'t','teacher',r.gid,i?409:200)));
  assert.equal(state.approved.length,1);
});
test('membership removed while external calendar is loading cannot submit an answer', async t=>{
  const {call,open,state}=await fixture(t); const roundId=await open();
  state.hook=async()=>{state.groups[0].members[0].status='removed';};
  await call('answer',{roundId,version:0,choices:{}},'a','student','g',403);
});
