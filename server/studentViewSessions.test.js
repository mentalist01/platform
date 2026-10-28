import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDENT_VIEW_TTL_MS,normalizeStudentView,studentViewExpiry,canContinueStudentView,publicStudentView,createStudentViewHandoffs} from './studentViewSessions.js';

test('delegated session has a fixed finite lifetime and validates the parent and current pupil ownership',()=>{
  const now=Date.now(),view={parentToken:'a'.repeat(64),teacherId:'t',teacherRole:'teacher',teacherName:'Учитель'};
  const session={studentView:view,createdAtMs:now,expiresAtMs:now+STUDENT_VIEW_TTL_MS};
  assert.equal(studentViewExpiry(session,now),session.expiresAtMs);
  for(const expiresAtMs of [null,undefined,now,now+STUDENT_VIEW_TTL_MS+1])assert.equal(studentViewExpiry({...session,expiresAtMs},now),undefined);
  assert.equal(normalizeStudentView({...view,parentToken:'sv_bad'}),null);
  const parent={user:{id:'t',role:'teacher'}},pupil={role:'student',teacherId:'t'};
  assert.equal(canContinueStudentView(session,parent,pupil),true);
  assert.equal(canContinueStudentView(session,null,pupil),false);
  assert.equal(canContinueStudentView(session,{...parent,studentView:view},pupil),false);
  assert.equal(canContinueStudentView(session,parent,{...pupil,teacherId:'another'}),false);
  assert.equal(JSON.stringify(publicStudentView(session)).includes(view.parentToken),false);
});


test('browser handoffs expire, are single-use and stay bounded without exposing the parent credential',()=>{
  let time=1000;const store=createStudentViewHandoffs({now:()=>time,maxTickets:2});
  const first=store.issue('private-parent','student-a');
  assert.match(first.handoff,/^svh_[a-f0-9]{64}$/);assert.equal(JSON.stringify(first).includes('private-parent'),false);
  assert.equal(store.take(first.handoff).studentId,'student-a');assert.equal(store.take(first.handoff),null);
  const expired=store.issue('parent','student-a');time+=60_001;assert.equal(store.take(expired.handoff),null);
  store.issue('parent','student-a');store.issue('parent','student-b');assert.throws(()=>store.issue('parent','student-c'));
  time+=60_001;assert.ok(store.issue('parent','student-c').handoff);
  assert.equal(store.take('svh_short'),null);
});
