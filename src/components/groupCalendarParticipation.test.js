import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {getLearningGroupCalendarParticipants} from '../utils/groupCalendarParticipants.js';

const source = fs.readFileSync(new URL('./TeacherCalendarSection.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  const handleGroupMemberParticipationToggle =');
const handler = source.slice(start, source.indexOf('  const handleEventDetailsCancellationToggle =', start));
assert.ok(start >= 0 && handler.includes('saveLearningLessonParticipation'));

function fixture({member = {}, label = 'Урок', cancelled = false, busy = '', request} = {}) {
  const selected = {isLearningGroupEvent:true,groupId:'g',lessonId:'tomorrow',participantIds:['vadim','other'],
    memberPaymentStatuses:[{studentId:'vadim',studentName:'Вадим',participationRequired:true,...member},
      {studentId:'other',studentName:'Другой',participationRequired:true}]};
  const elsewhere = {...structuredClone(selected),lessonId:'next-week'};
  const state = {entries:[structuredClone(selected),elsewhere],details:structuredClone(selected),calls:[],errors:[],success:[],refreshes:0,invalidations:0};
  const run = vm.runInNewContext(`${handler}\nhandleGroupMemberParticipationToggle;`, {
    useCallback:fn=>fn, eventDetails:selected,eventDetailsCancelled:cancelled,eventDetailsStatusLabel:label,
    lessonPanelFinanceBusy:busy,studentNameById:{},getLearningGroupCalendarParticipants,
    groupParticipationApi:{saveLearningLessonParticipation:async(...args)=>{state.calls.push(args);return request?.(...args);}},
    setLessonPanelFinanceBusy:value=>{state.busy=value;},setLessonPanelError:value=>state.errors.push(value),
    setLessonPanelSuccess:value=>state.success.push(value),
    calendarSnapshotGuard:{current:{invalidate:()=>state.invalidations++}},
    setEntries:fn=>{state.entries=fn(state.entries);},setEventDetails:fn=>{state.details=fn(state.details);},
    loadTeacherCalendar:async()=>{state.refreshes++;},
  });
  return {state,run,member:selected.memberPaymentStatuses[0]};
}

test('a future absence excludes one pupil from one lesson and offers immediate billing-free state',async()=>{
  const f=fixture(),before=structuredClone(f.state.entries);
  await f.run(f.member);
  assert.equal(JSON.stringify(f.state.calls),JSON.stringify([['g','tomorrow',{studentId:'vadim',assigned:false}]]));
  assert.equal(f.state.details.memberPaymentStatuses[0].participationRequired,false);
  assert.deepEqual(f.state.details.participantIds,['vadim','other']);
  assert.deepEqual(f.state.entries[0].memberPaymentStatuses[1],before[0].memberPaymentStatuses[1]);
  assert.deepEqual(f.state.entries[1],before[1]);
  assert.equal(f.state.refreshes,1);assert.equal(f.state.invalidations,1);assert.equal(f.state.busy,'');
  assert.match(f.state.success.at(-1),/не придёт/);
});

test('restoring participation changes the same occurrence without changing the group plan',async()=>{
  const f=fixture({member:{participationRequired:false,status:'not-required'}});
  await f.run(f.member);
  assert.equal(f.state.calls[0][2].assigned,true);
  assert.equal(f.state.details.memberPaymentStatuses[0].participationRequired,true);
  assert.match(f.state.success.at(-1),/возвращено/);
});

test('payment rejection leaves participation and billing display unchanged and reports the reason',async()=>{
  const f=fixture({request:async()=>{throw new Error('Урок уже оплачен');}}),before=structuredClone(f.state.entries);
  await f.run(f.member);
  assert.deepEqual(f.state.entries,before);
  assert.equal(f.state.details.memberPaymentStatuses[0].participationRequired,true);
  assert.equal(f.state.errors.at(-1),'Урок уже оплачен');assert.equal(f.state.success.at(-1),'');
  assert.equal(f.state.refreshes,0);assert.equal(f.state.busy,'');
});

test('the future action cannot replace the past absence action or operate during another edit',async()=>{
  for(const options of [{label:'Прошедший урок'},{label:'Идёт сейчас'},{cancelled:true},{busy:'payment-panel'}]){
    const f=fixture(options);await f.run(f.member);assert.equal(f.state.calls.length,0);
  }
});

test('a delayed response cannot overwrite another opened lesson or reopen a closed dialog',async()=>{
  for(const other of [null,{groupId:'g',lessonId:'another',subject:'Другой урок'}]){
    let finish;const f=fixture({request:()=>new Promise(resolve=>{finish=resolve;})});
    const pending=f.run(f.member);f.state.details=other;finish({});await pending;
    assert.equal(f.state.details,other);
    assert.equal(f.state.entries[0].memberPaymentStatuses[0].participationRequired,false);
  }
});
