import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStudentAvailabilityStore } from './studentAvailability.js';
import { placementConfig, rankPlacementGroups, registerGroupPlacement } from './groupPlacement.js';

const now = Date.parse('2026-10-10T12:00:00+03:00');
const config = { ...placementConfig(60), startDate: '2026-10-12', startMinute: 600, endMinute: 1380 };
const record = choices => ({ slots: Object.fromEntries(Object.entries(choices).map(([id,choice]) => [id,{choice,updatedAt:now}])) });
const group = (id, schedule = [], members = ['a','b']) => ({ id, teacherId: 'teacher', name: id, status: 'forming', schedule,
  members: members.map(studentId => ({studentId,status:'active'})) });
const schedule = (day, time, durationMinutes = 60) => ({weekdayKey: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'][day],time,durationMinutes});
const rank = input => rankPlacementGroups({ groups: [], polls: {}, records: {}, studentId: 'new', now, ...input });

test('ranks complete schedules above flexible and conflicting groups and checks every lesson', () => {
  const groups = [group('conflict',[schedule(0,'10:00'),schedule(3,'10:00')]),
    group('flexible',[schedule(0,'10:00'),schedule(2,'10:00')]), group('exact',[schedule(0,'10:00'),schedule(1,'10:00')])];
  const result = rank({groups,records:{60:record({'0-600':'yes','1-600':'yes','2-600':'maybe','3-600':'no'})}});
  assert.deepEqual(result.map(item=>[item.id,item.fit]),[['exact','exact'],['flexible','flexible'],['conflict','conflict']]);
  assert.equal(result[0].matchedCount,2); assert.equal(result[2].matchedCount,1);
});

test('duration, unknown hours, removed members and completed groups do not become false matches', () => {
  const groups = [group('wrong-duration',[schedule(0,'10:00',90)]),group('unknown-hour',[schedule(1,'10:00')]),
    {...group('completed',[schedule(0,'10:00')]),status:'completed'}, {...group('member',[schedule(0,'10:00')]),members:[{studentId:'new',status:'active'}]}];
  const result=rank({groups,records:{60:record({'0-600':'yes'})}});
  assert.deepEqual(result.map(item=>item.fit),['unanswered','unanswered','member']);
  assert.equal(result.find(item=>item.id==='member').alreadyMember,true);
  assert.ok(!result.some(item=>item.id==='completed'));
});

test('forming groups require common availability of every active pupil on two different days', () => {
  const g=group('forming'); const polls={forming:{status:'open',config,answers:{
    a:{choices:{'0-600':'yes','0-630':'yes','2-600':'maybe','4-600':'yes'}},
    b:{choices:{'0-600':'yes','0-630':'yes','2-600':'yes'}}}}};
  const records={60:record({'0-600':'yes','0-630':'yes','2-600':'yes','4-600':'yes'})};
  let result=rank({groups:[g],polls,records})[0];
  assert.equal(result.fit,'flexible'); assert.equal(result.availableDays,2);
  assert.ok(!result.slots.some(slot=>slot.id==='4-600'),'one rejecting participant prevents the slot');
  assert.equal(result.slots[1].day,2,'the preview includes a second distinct day');
  polls.forming.answers.a.choices['2-600']='yes';
  assert.equal(rank({groups:[g],polls,records})[0].fit,'exact');
  delete polls.forming.answers.b;
  assert.equal(rank({groups:[g],polls,records})[0].fit,'waiting');
  polls.forming.answers.b={choices:{'0-600':'yes','0-630':'yes'}};
  assert.equal(rank({groups:[g],polls,records})[0].fit,'partial','two times on one day are insufficient');
});

test('teacher conflicts and unavailable calendar are visible rather than recommended as a free pair', () => {
  const g=group('forming',[],['a']); const polls={forming:{status:'open',config,answers:{a:{choices:{'0-600':'yes','2-600':'yes'}}}}};
  const records={60:record({'0-600':'yes','2-600':'yes'})};
  const entries=[{date:'2026-10-12',time:'10:00',durationMinutes:60,groupId:'other',teacherId:'teacher'}];
  assert.equal(rank({groups:[g],polls,records,entries})[0].fit,'partial');
  assert.equal(rank({groups:[g],polls,records,calendarError:true})[0].fit,'unverified');
  assert.equal(rank({groups:[g],polls})[0].fit,'unanswered');
});

test('approved plans and authoritative future imported lessons can be matched without a new poll', () => {
  const g=group('planned'), imported=group('imported');
  const result=rank({groups:[g,imported],polls:{planned:{plan:{config,slots:['0-600','2-600']}}},
    records:{60:record({'0-600':'yes','2-600':'yes'})},entries:[
      {groupId:'imported',teacherId:'teacher',date:'2026-10-12',time:'10:00',durationMinutes:60},
      {groupId:'imported',teacherId:'teacher',date:'2026-10-19',time:'10:00',durationMinutes:60},
      {groupId:'imported',date:'2026-10-10',time:'09:00',status:'cancelled'},
      {groupId:'imported',date:'2026-10-13',time:'09:00',learningGroupMatchAmbiguous:true},
    ]});
  assert.ok(result.every(item=>item.fit==='exact')); assert.equal(result.find(item=>item.id==='imported').totalCount,1);
});

async function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'placement-test-'));
  const store=createStudentAvailabilityStore(path.join(root,'student-availability.json'));
  const students={new:{id:'new',teacherId:'teacher',name:'Новый',schedule:'individual'},other:{id:'other',teacherId:'foreign',name:'Secret'}};
  const groups=[group('exact',[schedule(0,'10:00'),schedule(2,'10:00')]),{...group('foreign'),teacherId:'foreign'}];
  const polls={}; let entriesCalls=0;
  const app=express(); app.use(express.json()); app.use((req,res,next)=>{const value=req.headers.authorization?.split(':'); if(value)req.auth={role:value[0],id:value[1]};next();});
  registerGroupPlacement(app,{store,students:id=>Object.values(students).filter(student=>student.teacherId===id),getStudent:id=>students[id],groups:()=>groups,polls:()=>polls,getEntries:async()=>{entriesCalls++;return [];}});
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
  const request=async(route,auth='student:new',body,status=200)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
  };
  return {store,students,groups,polls,request,entriesCalls:()=>entriesCalls};
}

test('a pupil without a group fills a durable private questionnaire, while remaining individual; the teacher sees recommendations', async t=>{
  const f=await fixture(t); const before=structuredClone(f.students), beforeGroups=structuredClone(f.groups);
  const initial=await f.request('/api/student-availability');assert.equal(initial.answer,null);
  const saved=await f.request('/api/student-availability/answer','student:new',{durationMinutes:60,revision:initial.revision,choices:{'0-600':'yes','2-600':'yes'}});
  assert.notEqual(saved.revision,initial.revision);assert.deepEqual(saved.answer.choices,{'0-600':'yes','2-600':'yes'});
  const recommendations=await f.request('/api/students/new/group-placement','teacher:teacher');
  assert.equal(recommendations.groups.length,1);assert.equal(recommendations.groups[0].fit,'exact');
  assert.deepEqual(f.students,before);assert.deepEqual(f.groups,beforeGroups);
  const seeded=f.store.seed({teacherId:'teacher',studentId:'new',config});
  assert.deepEqual(seeded.choices,saved.answer.choices,'later group admission uses the same personal profile');
  await f.request('/api/student-availability/answer','student:new',{durationMinutes:60,revision:initial.revision,choices:{}},409);
  const cleared=await f.request('/api/student-availability/answer','student:new',{durationMinutes:60,revision:saved.revision,choices:{}});
  assert.deepEqual(cleared.answer.choices,{});assert.equal((await f.request('/api/students/new/group-placement','teacher:teacher')).groups[0].fit,'conflict');
});

test('access is limited to the pupil and their own teacher, and invalid/stale writes cannot change preferences',async t=>{
  const f=await fixture(t);
  await f.request('/api/student-availability','',undefined,403);
  await f.request('/api/student-availability','teacher:teacher',undefined,403);
  await f.request('/api/students/new/group-placement','student:new',undefined,403);
  await f.request('/api/students/new/group-placement','teacher:foreign',undefined,403);
  await f.request('/api/students/other/group-placement','teacher:teacher',undefined,403);
  assert.equal(f.entriesCalls(),0,'authorization is checked before loading any calendar');
  const initial=await f.request('/api/student-availability');
  await f.request('/api/student-availability/answer','teacher:teacher',{revision:initial.revision,choices:{}},403);
  await f.request('/api/student-availability/answer','student:new',{revision:initial.revision,choices:{'0-615':'yes'}},400);
  await f.request('/api/student-availability/answer','student:new',{revision:initial.revision,choices:{'0-600':'no'}},400);
  assert.equal((await f.request('/api/student-availability')).answer,null);
});

test('placement shows only active own pupils for comparing group levels, even before the candidate answers', async t => {
  const f = await fixture(t);
  f.students.a = { id: 'a', teacherId: 'teacher', name: 'Анна' };
  f.students.b = { id: 'b', teacherId: 'foreign', name: 'Чужой ученик' };
  f.students.left = { id: 'left', teacherId: 'teacher', name: 'Вышел' };
  f.groups[0].members.push({ studentId: 'left', status: 'left' });
  const result = await f.request('/api/students/new/group-placement', 'teacher:teacher');
  assert.ok(result.answers.every(answer => !answer.answer));
  assert.deepEqual(result.groups[0].members, [{ id: 'a', name: 'Анна' }]);
  assert.equal(JSON.stringify(result).includes('Чужой ученик'), false);
});

test('placement invitations are opt-in, durable, teacher-owned and never change saved availability', async t => {
  const f = await fixture(t);
  const initial = await f.request('/api/student-availability');
  await f.request('/api/student-availability/answer', 'student:new', { durationMinutes: 60, revision: initial.revision, choices: { '0-600': 'yes' } });
  const preferences = f.store.record({ teacherId: 'teacher', studentId: 'new', durationMinutes: 60 });
  assert.equal((await f.request('/api/student-availability/prompt')).prompt, null);
  await f.request('/api/students/new/group-placement/settings', 'teacher:foreign', { seekingGroup: true }, 403);
  await f.request('/api/students/new/group-placement/settings', 'student:new', { seekingGroup: true }, 403);
  await f.request('/api/students/new/group-placement/settings', 'teacher:teacher', { seekingGroup: 'yes' }, 400);
  await f.request('/api/students/new/group-placement/settings', 'teacher:teacher', { seekingGroup: true });
  assert.deepEqual((await f.request('/api/student-availability/prompt')).prompt, { kind: 'personal' });
  assert.equal((await f.request('/api/students/new/group-placement', 'teacher:teacher')).seekingGroup, true);
  await f.request('/api/students/new/group-placement/settings', 'teacher:teacher', { seekingGroup: false });
  assert.equal((await f.request('/api/student-availability/prompt')).prompt, null);
  assert.deepEqual(f.store.record({ teacherId: 'teacher', studentId: 'new', durationMinutes: 60 }), preferences);
});

test('scheduled group pupils only see an invitation for an open poll in an active own membership', async t => {
  const f = await fixture(t);
  f.groups[0].members.push({ studentId: 'new', status: 'active' });
  await f.request('/api/students/new/group-placement/settings', 'teacher:teacher', { seekingGroup: true });
  for (const status of [undefined, 'approved', 'closed']) {
    f.polls.exact = status ? { status } : undefined;
    assert.equal((await f.request('/api/student-availability/prompt')).prompt, null);
  }
  f.polls.exact = { status: 'open', answers: { new: { choices: { '0-600': 'yes' } } }, proposal: { votes: {} } };
  assert.deepEqual((await f.request('/api/student-availability/prompt')).prompt, { kind: 'group', groupId: 'exact', groupName: 'exact', answered: true, needsVote: true });
  f.polls.exact.proposal.votes.new = { choice: 'yes' };
  assert.equal((await f.request('/api/student-availability/prompt')).prompt, null, 'an open poll with no outstanding pupil action is silent');
  f.polls.exact.proposal = null;
  f.polls.exact.plan = { approvedAt: now };
  assert.equal((await f.request('/api/student-availability/prompt')).prompt, null, 'reopened polls kept for teacher comparison do not ask answered pupils again');
  f.groups[0].status = 'completed';
  f.groups[1].members.push({ studentId: 'new', status: 'active' });
  f.polls.foreign = { status: 'open' };
  assert.deepEqual((await f.request('/api/student-availability/prompt')).prompt, { kind: 'personal' });
  assert.equal(f.entriesCalls(), 0, 'the banner does not read the calendar or calculate matches');
});

test('historical midnight slots outside the questionnaire are preserved without preventing a new save', async t=>{
  const f=await fixture(t);
  f.store.remember({teacherId:'teacher',studentId:'new',config:{...placementConfig(60),endMinute:1440},answer:{choices:{'0-1380':'yes'},updatedAt:now},sourceRoundId:'historical'});
  const initial=await f.request('/api/student-availability');
  assert.deepEqual(initial.answer.choices,{});
  await f.request('/api/student-availability/answer','student:new',{durationMinutes:60,revision:initial.revision,choices:{'0-600':'yes'}});
  assert.equal(f.store.record({teacherId:'teacher',studentId:'new',durationMinutes:60}).slots['0-1380'].choice,'yes');
});
test('teacher placement roster reports pending, answered and cleared availability in one isolated read without Google', async t => {
  const f = await fixture(t);
  await f.request('/api/teacher-group-placement', 'student:new', undefined, 403);
  let list = await f.request('/api/teacher-group-placement', 'teacher:teacher');
  assert.deepEqual(list.students.map(row => [row.studentId, row.answerState]), [['new', 'pending']]);
  await f.request('/api/students/new/group-placement/settings', 'teacher:teacher', { seekingGroup: true });
  const initial = await f.request('/api/student-availability');
  const saved = await f.request('/api/student-availability/answer', 'student:new', { durationMinutes: 60, revision: initial.revision, choices: { '0-600': 'yes', '2-600': 'maybe' } });
  list = await f.request('/api/teacher-group-placement', 'teacher:teacher');
  assert.equal(list.students[0].answerState, 'answered'); assert.equal(list.students[0].slotCount, 2);
  assert.deepEqual(list.students[0].durations, [60]); assert.equal(list.students[0].seekingGroup, true);
  await f.request('/api/student-availability/answer', 'student:new', { durationMinutes: 60, revision: saved.revision, choices: {} });
  assert.equal((await f.request('/api/teacher-group-placement', 'teacher:teacher')).students[0].answerState, 'empty');
  assert.ok(!(await f.request('/api/teacher-group-placement', 'teacher:foreign')).students.some(row => row.studentId === 'new'));
  assert.equal(f.entriesCalls(), 0);
});
