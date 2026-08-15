import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessStudentRecord,
  resolveStudentAccessId,
} from './studentAccess.js';

test('student self-scoped requests always resolve to the authenticated student', () => {
  assert.equal(resolveStudentAccessId({
    role: 'student',
    authenticatedStudentId: 'student-self',
    requestedStudentId: 'student-peer',
  }), 'student-self');
  assert.equal(resolveStudentAccessId({
    role: 'student',
    authenticatedStudentId: ' student-self ',
  }), 'student-self');
});

test('strict object checks preserve the real owner id and reject a peer', () => {
  const targetId = resolveStudentAccessId({
    role: 'student',
    authenticatedStudentId: 'student-self',
    requestedStudentId: 'student-peer',
    strictStudentId: true,
  });
  assert.equal(targetId, 'student-peer');
  assert.equal(canAccessStudentRecord(
    { role: 'student', id: 'student-self' },
    { id: targetId, teacherId: 'teacher-a' }
  ), false);
});

test('students can access only their own active record', () => {
  const auth = { role: 'student', id: 'student-self' };
  assert.equal(canAccessStudentRecord(auth, { id: 'student-self', teacherId: 'teacher-a' }), true);
  assert.equal(canAccessStudentRecord(auth, { id: 'student-peer', teacherId: 'teacher-a' }), false);
  assert.equal(canAccessStudentRecord(
    auth,
    { id: 'student-self', teacherId: 'teacher-a', deletedAt: '2026-08-03T00:00:00.000Z' },
    { allowDeleted: true }
  ), false);
});

test('teachers stay limited to their students and admins retain access', () => {
  const student = { id: 'student-a', teacherId: 'teacher-a' };
  assert.equal(canAccessStudentRecord({ role: 'teacher', id: 'teacher-a' }, student), true);
  assert.equal(canAccessStudentRecord({ role: 'teacher', id: 'teacher-b' }, student), false);
  assert.equal(canAccessStudentRecord({ role: 'admin', id: 'admin-a' }, student), true);
});

test('parents are permanently scoped to the student linked to their session', () => {
  const auth = { role: 'parent', id: 'parent:student-a', studentId: 'student-a' };
  assert.equal(resolveStudentAccessId({
    role: auth.role,
    authenticatedStudentId: auth.studentId,
    requestedStudentId: 'student-b',
  }), 'student-a');
  assert.equal(canAccessStudentRecord(auth, { id: 'student-a', teacherId: 'teacher-a' }), true);
  assert.equal(canAccessStudentRecord(auth, { id: 'student-b', teacherId: 'teacher-a' }), false);
  assert.equal(canAccessStudentRecord(
    auth,
    { id: 'student-a', teacherId: 'teacher-a', deletedAt: '2026-08-03T00:00:00.000Z' },
    { allowDeleted: true }
  ), false);
});
