import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDENT_STUDY_STATUS_ACTIVE,
  STUDENT_STUDY_STATUS_INACTIVE,
  isCurrentStudent,
  isInactiveStudent,
  normalizeStudentStudyStatus,
} from '../src/utils/studentStudyStatus.js';

test('students study by default and can be explicitly archived', () => {
  assert.equal(normalizeStudentStudyStatus(undefined, 11), STUDENT_STUDY_STATUS_ACTIVE);
  assert.equal(normalizeStudentStudyStatus('inactive', 11), STUDENT_STUDY_STATUS_INACTIVE);
  assert.equal(isCurrentStudent({ id: 'active', grade: 11 }), true);
  assert.equal(isInactiveStudent({ id: 'inactive', grade: 11, studyStatus: 'inactive' }), true);
});

test('legacy graduates are inactive without a data migration', () => {
  assert.equal(normalizeStudentStudyStatus('active', 'graduate'), STUDENT_STUDY_STATUS_INACTIVE);
  assert.equal(isCurrentStudent({ id: 'graduate', grade: 'Выпускник' }), false);
  assert.equal(isInactiveStudent({ id: 'graduate', grade: 'graduate' }), true);
});

test('deleted students belong to neither study group', () => {
  const student = { id: 'deleted', grade: 11, deletedAt: '2026-07-26T00:00:00.000Z' };
  assert.equal(isCurrentStudent(student), false);
  assert.equal(isInactiveStudent(student), false);
});
