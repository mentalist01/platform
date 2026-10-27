import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDENT_VIEW_TTL_MS,normalizeStudentView,studentViewExpiry,canContinueStudentView,publicStudentView} from './studentViewSessions.js';

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
