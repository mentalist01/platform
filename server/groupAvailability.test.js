import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { availabilityConfig, currentAvailabilityConfig, busySlots, groupAvailabilityBusyEntries, createAvailabilityStore, materializeAvailabilityPlans, registerGroupAvailability } from './groupAvailability.js';
import { addCalendarDays, moscowDay, availabilitySlots, rankedSlots, suggestedPair } from '../src/utils/groupAvailability.js';

const tomorrow = addCalendarDays(moscowDay(), 1);
const config = (extra = {}) => ({ startDate: tomorrow, durationMinutes: 60, startMinute: 600, endMinute: 1260, days: [0,1,2,3,4,5,6], weeks: 8, ...extra });
const member = id => ({ studentId: id, status: 'active' });
const group = id => ({ id, teacherId: 't', name: 'Группа', status: 'active', members: [member('a'), member('b')] });

test('only this group reservations are excluded; other groups, individuals and ambiguous matches still block', () => {
  const own = { groupId: 'g', teacherId: 't', weekdayKey: 'monday', time: '10:00', durationMinutes: 60 };
  const entries = [{ ...own, id: 'own-google', source: 'google-ical', isLearningGroupEvent: true },
    { ...own, id: 'own-plan', source: 'availability-plan' },
    { ...own, id: 'other-group', groupId: 'g2', time: '11:00' },
    { id: 'individual', weekdayKey: 'thursday', time: '10:00', studentId: 'a' },
    { ...own, id: 'ambiguous', learningGroupMatchAmbiguous: true, time: '12:00' },
    { ...own, id: 'foreign-teacher', teacherId: 'u', time: '13:00' },
    { id: 'same-title', subject: 'Группа', weekdayKey: 'friday', time: '10:00' }];
  const filtered = groupAvailabilityBusyEntries(group('g'), entries);
  assert.deepEqual(filtered.map(entry => entry.id), ['other-group', 'individual', 'ambiguous', 'foreign-teacher', 'same-title']);
  const blocked = busySlots(config({ startDate: '2026-09-28' }), filtered, Date.parse('2026-09-27T08:00:00Z'));
  assert.equal(blocked['0-600'], undefined);
  for (const slot of ['0-660', '3-600', '0-720', '0-780', '4-600']) assert.ok(blocked[slot], slot);
});

test('an old open poll does not mark passed weekdays busy and still checks eight future weeks', () => {
  const now=Date.parse('2026-09-27T17:00:00Z');
  const cfg=config({startDate:'2026-09-24'});
  assert.equal(currentAvailabilityConfig(cfg,now).startDate,'2026-09-28');
  assert.deepEqual(busySlots(cfg,[],now),{});
  const actual=busySlots(cfg,[{date:'2026-09-24',time:'10:00'}, {date:'2026-11-22',time:'11:00'}],now);
  assert.equal(actual['3-600'],undefined);
  assert.deepEqual(actual['6-660'],['2026-11-22']);
  assert.equal(busySlots({...cfg,startDate:'2026-09-27'},[],now)['6-600'],undefined);
});

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
test('materialization reuses an existing Google occurrence at the same group time', () => {
  const now = Date.parse('2026-09-23T08:00:00Z');
  const plan = { groupId: 'g', id: 'p', config: config({ startDate: '2026-09-28' }), slots: ['0-600'] };
  const google = { id: 'google', groupId: 'g', source: 'google-calendar', status: 'scheduled', startAt: '2026-09-28T07:00:00Z', durationMinutes: 60 };
  const create = (g, p, opts) => ({ ...p, id: opts.id, groupId: g.id, status: 'scheduled' });
  const result = materializeAvailabilityPlans([plan], [group('g')], [google], create, now);
  assert.equal(result.lessons.filter(l => Date.parse(l.startAt) === Date.parse(google.startAt)).length, 1);
  const next = materializeAvailabilityPlans([plan], [group('g')], result.lessons, create, now);
  assert.equal(next.changed, false);
  assert.equal(next.lessons[0].id, 'google');
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
  const state={groups:[group('g'),group('g2')],entries:[],down:false,approved:[], hook:null, notifications:[]};
  const app=express(); app.use(express.json());
  app.use((req,_res,next)=>{req.auth={id:req.headers['x-user'],role:req.headers['x-role']};next();});
  registerGroupAvailability(app,{store,getGroup:id=>state.groups.find(g=>g.id===id),canManage:(a,g)=>a.role==='teacher'&&a.id===g.teacherId,
    getStudentName:id=>id==='a'?'Аня':'Борис',getBusyEntries:async (g,c,force)=>{
      if(state.down) throw Error('offline');
      if(state.hook) await state.hook(g,c,force);
      return state.entries;
    },materialize:()=>{state.approved=store.plans();},notifyAnswer:(group,poll,event)=>state.notifications.push({groupId:group.id,roundId:poll.id,...structuredClone(event)})});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
  const call=async(action='',body=null,id='t',role='teacher',gid='g',status=200)=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/learning-groups/${gid}/availability${action?'/'+action:''}`,
      {method:action?'POST':'GET',headers:{'Content-Type':'application/json','x-user':id,'x-role':role},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await r.json();assert.equal(r.status,status,JSON.stringify(payload));return payload;
  };
  const open=async(gid='g')=>(await call('open',config(),'t','teacher',gid)).poll.id;
  return {call,open,state,store,file:path.join(dir,'polls.json')};
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
  await call('answer',{roundId,version:1,choices:{'0-600':'yes'}},'a','student');
  state.groups[0].members[0].status='removed';
  await call('',null,'a','student','g',403);
  assert.equal((await call()).poll.answers.a,undefined);
  state.down=true; assert.ok((await call()).calendarError);
  assert.ok((await call('propose',{roundId,slots:['1-600','2-600']},'t','teacher')).calendarError);
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

test('saved preference changes notify once; rejected saves and unchanged reordered choices do not notify', async t => {
  const { call, open, state, store, file } = await fixture(t);
  const roundId = await open();
  assert.equal(state.notifications.length, 0);
  await call('answer', { roundId, version: 0, choices: { '0-600': 'yes', '3-600': 'maybe' } }, 'a', 'student');
  assert.equal(state.notifications.length, 1);
  const first = state.notifications[0].answer.teacherNotification;
  assert.equal(first.updated, false);
  await call('answer', { roundId, version: 1, choices: { '3-600': 'maybe', '0-600': 'yes' } }, 'a', 'student');
  assert.equal(state.notifications.length, 1);
  assert.deepEqual(store.get('g').answers.a.teacherNotification, first);
  await call('answer', { roundId, version: 1, choices: {} }, 'a', 'student', 'g', 409);
  await call('answer', { roundId, version: 2, choices: { '0-601': 'yes' } }, 'a', 'student', 'g', 400);
  await call('answer', { roundId, version: 0, choices: {} }, 'outsider', 'student', 'g', 403);
  assert.equal(state.notifications.length, 1);
  await call('answer', { roundId, version: 2, choices: {} }, 'a', 'student');
  assert.equal(state.notifications.length, 2);
  const updated = state.notifications[1].answer.teacherNotification;
  assert.equal(updated.updated, true);
  assert.notEqual(updated.id, first.id);
  assert.deepEqual(createAvailabilityStore(file).get('g').answers.a.teacherNotification, updated);
});

test('reopening an approved plan retains availability and lessons, includes newcomers and requires fresh consent', async t => {
  const { call, open, state, store, file } = await fixture(t);
  const roundId = await open();
  const choices = { '0-600': 'yes', '3-600': 'maybe', '5-720': 'yes' };
  for (const id of ['a', 'b']) await call('answer', { roundId, version: 0, choices }, id, 'student');
  const proposalId = (await call('propose', { roundId, slots: ['0-600', '3-600'] })).poll.proposal.id;
  for (const id of ['a', 'b']) await call('vote', { roundId, proposalId, choice: 'yes' }, id, 'student');
  const approved = (await call('approve', { roundId, proposalId })).poll;
  assert.deepEqual(approved.answers.a.choices, choices);
  state.groups[0].members.push(member('c'));
  assert.equal((await call()).poll.members.length, 3);
  await call('reopen', { roundId }, 'a', 'student', 'g', 403);
  await call('reopen', { roundId: 'stale' }, 't', 'teacher', 'g', 409);
  assert.equal(store.get('g').status, 'approved');
  state.down = false;
  const reopened = (await call('reopen', { roundId })).poll;
  assert.notEqual(reopened.id, roundId);
  assert.equal(reopened.status, 'open');
  assert.deepEqual(reopened.answers, approved.answers);
  assert.deepEqual(reopened.plan, approved.plan);
  assert.equal(reopened.proposal, null);
  assert.equal(reopened.answers.c, undefined);
  assert.deepEqual(store.plans()[0].slots, approved.plan.slots);
  await call('answer', { roundId, version: 1, choices }, 'a', 'student', 'g', 409);
  await call('answer', { roundId: reopened.id, version: 0, choices }, 'c', 'student');
  const nextId = (await call('propose', { roundId: reopened.id, slots: ['0-660', '3-660'] })).poll.proposal.id;
  for (const id of ['a', 'b']) await call('vote', { roundId: reopened.id, proposalId: nextId, choice: 'yes' }, id, 'student');
  await call('approve', { roundId: reopened.id, proposalId: nextId }, 't', 'teacher', 'g', 409);
  await call('vote', { roundId: reopened.id, proposalId: nextId, choice: 'maybe' }, 'c', 'student');
  const changed = (await call('approve', { roundId: reopened.id, proposalId: nextId })).poll;
  assert.deepEqual(changed.plan.slots, ['0-660', '3-660']);
  assert.deepEqual(changed.answers.a.choices, choices);
  assert.deepEqual(createAvailabilityStore(file).get('g').answers, changed.answers);
  state.groups[0].status = 'completed';
  await call('reopen', { roundId: changed.id }, 't', 'teacher', 'g', 409);
});
test('own Google lessons can be selected, approved and selected again; a new individual conflict prevents approval', async t => {
  const { call, open, state } = await fixture(t);
  const own = { groupId: 'g', source: 'google-ical', isLearningGroupEvent: true, time: '10:00', durationMinutes: 60 };
  state.entries = [{ ...own, weekdayKey: 'monday' }, { ...own, weekdayKey: 'thursday' },
    { ...own, groupId: 'g2', weekdayKey: 'monday', time: '11:00' }];
  const roundId = await open();
  const snapshot = await call();
  assert.equal(snapshot.blocked['0-600'], undefined); assert.ok(snapshot.blocked['0-660']);
  const choices = { '0-600': 'yes', '3-600': 'yes' };
  for (const id of ['a', 'b']) await call('answer', { roundId, version: 0, choices }, id, 'student');
  const proposalId = (await call('propose', { roundId, slots: Object.keys(choices) })).poll.proposal.id;
  for (const id of ['a', 'b']) await call('vote', { roundId, proposalId, choice: 'yes' }, id, 'student');
  state.entries.push({ weekdayKey: 'thursday', time: '10:15', durationMinutes: 60 });
  await call('approve', { roundId, proposalId }, 't', 'teacher', 'g', 409);
  state.entries.pop(); await call('approve', { roundId, proposalId });
  const reopened = await call('reopen', { roundId });
  assert.equal(reopened.blocked['0-600'], undefined); assert.equal(reopened.blocked['3-600'], undefined);
  assert.ok(reopened.blocked['0-660']); assert.deepEqual(reopened.poll.answers.a.choices, choices);
  await call('answer', { roundId: reopened.poll.id, version: 1, choices }, 'a', 'student');
});

test('collecting pupil availability needs no calendar lookup and still rejects removed members', async t=>{
  const {call,open,state}=await fixture(t); const roundId=await open();
  state.hook=async()=>{throw Error('Pupil preferences must not fetch Google');};
  assert.deepEqual((await call('',null,'a','student')).blocked,{});
  await call('answer',{roundId,version:0,choices:{'0-600':'yes'}},'a','student');
  state.groups[0].members[0].status='removed';
  await call('answer',{roundId,version:1,choices:{}},'a','student','g',403);
});

test('occupied group preferences and proposals stay visible, but approval waits for calendar conflicts to be cleared', async t => {
  const {call,open,state,store}=await fixture(t); const roundId=await open();
  state.entries=[{weekdayKey:'monday',time:'10:00',durationMinutes:60,subject:'PRIVATE'}];
  for(const id of ['a','b']) {
    const answer=await call('answer',{roundId,version:0,choices:{'0-600':'yes','3-600':'maybe'}},id,'student');
    assert.deepEqual(answer.blocked,{}); assert.equal(answer.calendarError,'');
    assert.ok(!JSON.stringify(answer).includes('PRIVATE'));
  }
  const teacher=await call(); assert.ok(teacher.blocked['0-600']);
  assert.deepEqual(suggestedPair(teacher.poll),['0-600','3-600']);
  const proposalId=(await call('propose',{roundId,slots:['0-600','3-600']},'a','student')).poll.proposal.id;
  for(const id of ['a','b']) await call('vote',{roundId,proposalId,choice:'yes'},id,'student');
  await call('approve',{roundId,proposalId},'t','teacher','g',409);
  assert.equal(store.get('g').plan,null); assert.equal(state.approved.length,0);
  state.down=true;
  await call('answer',{roundId,version:1,choices:{'0-600':'yes','3-600':'yes'}},'a','student');
  await call('vote',{roundId,proposalId,choice:'yes'},'a','student');
  await call('approve',{roundId,proposalId},'t','teacher','g',503);
  state.down=false; state.entries=[];
  assert.equal((await call('approve',{roundId,proposalId})).poll.status,'approved');
});

test('late group slots end at 23:00 and legacy rounds expand without clearing answers or the current plan', async t => {
  const {call,open,store}=await fixture(t); const roundId=await open();
  const old=store.get('g'); delete old.hoursVersion;
  old.config={...old.config,endMinute:1260}; old.answers={a:{version:1,choices:{'0-600':'yes'}}};
  old.plan={id:'previous-plan',config:{...old.config},slots:['0-600','3-600']}; store.put('g',old);
  const expanded=(await call('',null,'a','student')).poll;
  assert.equal(expanded.config.endMinute,1380); assert.deepEqual(expanded.answers,old.answers); assert.deepEqual(expanded.plan,old.plan);
  assert.equal(availabilitySlots(expanded.config).filter(s=>s.day===0).at(-1).time,'22:00');
  await call('answer',{roundId,version:1,choices:{'0-1320':'yes','3-1290':'maybe'}},'a','student');
  await call('answer',{roundId,version:2,choices:{'0-1350':'yes'}},'a','student','g',400);
  assert.equal(store.get('g').hoursVersion,1); assert.deepEqual(store.get('g').plan,old.plan);
  assert.throws(()=>availabilityConfig(config({endMinute:1440})));
  assert.equal(availabilitySlots({...expanded.config,durationMinutes:90}).filter(s=>s.day===0).at(-1).time,'21:30');
});

test('teacher can switch between all hours and free hours without losing answers, proposal or votes',async t=>{
  const {call,open,state,store,file}=await fixture(t); const roundId=await open();
  assert.equal((await call('',null,'a','student')).poll.includeBusyTimes,true);
  state.entries=[{weekdayKey:'monday',time:'10:00',durationMinutes:60,subject:'PRIVATE'}];
  await call('answer',{roundId,version:0,choices:{'0-600':'yes','3-600':'maybe'}},'a','student');
  const proposalId=(await call('propose',{roundId,slots:['0-600','3-600']})).poll.proposal.id;
  await call('vote',{roundId,proposalId,choice:'yes'},'a','student');
  const before=store.get('g');
  const body={roundId,previousIncludeBusyTimes:true,includeBusyTimes:false};
  await call('settings',body,'a','student','g',403);
  await call('settings',{...body,includeBusyTimes:'false'},'t','teacher','g',400);
  await call('settings',{...body,roundId:'stale'},'t','teacher','g',409);
  const restricted=await call('settings',body);
  assert.equal(restricted.poll.includeBusyTimes,false);
  assert.deepEqual(restricted.poll.answers,before.answers); assert.deepEqual(restricted.poll.proposal,before.proposal);
  const student=await call('',null,'a','student');
  assert.ok(student.blocked['0-600']); assert.ok(!JSON.stringify(student).includes('PRIVATE'));
  await call('answer',{roundId,version:1,choices:{'0-600':'yes'}},'a','student','g',409);
  await call('propose',{roundId,previousProposalId:proposalId,slots:['0-600','3-600']},'a','student','g',409);
  await call('propose',{roundId,previousProposalId:proposalId,slots:['0-600','3-600']},'t','teacher','g',409);
  assert.deepEqual(createAvailabilityStore(file).get('g').answers,before.answers);
  await call('settings',body,'t','teacher','g',409);
  const restored=await call('settings',{roundId,previousIncludeBusyTimes:false,includeBusyTimes:true});
  assert.deepEqual(restored.poll.answers,before.answers); assert.deepEqual(restored.poll.proposal,before.proposal);
  assert.deepEqual((await call('',null,'a','student')).blocked,{});
  await call('answer',{roundId,version:1,choices:{'0-600':'yes'}},'a','student');
});

test('free-hours mode rechecks calendar on writes, rejects revoked members and fails closed on calendar errors',async t=>{
  const {call,open,state,store}=await fixture(t); const roundId=await open();
  await call('settings',{roundId,previousIncludeBusyTimes:true,includeBusyTimes:false});
  assert.deepEqual((await call('',null,'a','student')).blocked,{});
  state.entries=[{weekdayKey:'monday',time:'10:00'}];
  await call('answer',{roundId,version:0,choices:{'0-600':'yes'}},'a','student','g',409);
  assert.equal(store.get('g').answers.a,undefined);
  state.down=true;
  assert.ok((await call('',null,'a','student')).calendarError);
  await call('answer',{roundId,version:0,choices:{'3-600':'yes'}},'a','student','g',503);
  state.down=false;
  state.hook=async(_g,_cfg,force)=>{if(force)state.groups[0].members[0].status='removed';};
  await call('answer',{roundId,version:0,choices:{'3-600':'yes'}},'a','student','g',403);
  assert.equal(store.get('g').answers.a,undefined);
});

test('selection mode is retained for approved schedules, reopened polls and new rounds',async t=>{
  const {call,open,state,store}=await fixture(t); const roundId=await open();
  const proposalId=(await call('propose',{roundId,slots:['0-600','3-600']})).poll.proposal.id;
  for(const id of ['a','b'])await call('vote',{roundId,proposalId,choice:'yes'},id,'student');
  const approved=(await call('approve',{roundId,proposalId})).poll;
  await call('settings',{roundId,previousIncludeBusyTimes:true,includeBusyTimes:false});
  assert.deepEqual(store.get('g').plan,approved.plan); assert.equal(state.approved.length,1);
  const reopened=(await call('reopen',{roundId})).poll; assert.equal(reopened.includeBusyTimes,false);
  const fresh=(await call('open',{...config(),previousRoundId:reopened.id})).poll; assert.equal(fresh.includeBusyTimes,false);
  state.groups[0].status='completed';
  await call('settings',{roundId:fresh.id,previousIncludeBusyTimes:false,includeBusyTimes:true},'t','teacher','g',409);
});
