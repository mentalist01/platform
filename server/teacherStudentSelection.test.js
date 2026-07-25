import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTeacherStudentId,
  resolveTeacherStudentSelection,
} from '../src/utils/teacherStudentSelection.js';

const students = [
  { id: 'student-a' },
  { id: 'student-b' },
];

test('keeps the teacher-selected student when the roster refreshes or changes order', () => {
  assert.equal(resolveTeacherStudentSelection({
    currentId: 'student-b',
    storedId: 'student-a',
    students,
  }), 'student-b');
  assert.equal(resolveTeacherStudentSelection({
    currentId: 'student-b',
    storedId: 'student-a',
    students: [...students].reverse(),
  }), 'student-b');
});

test('restores the saved student before falling back to the first roster entry', () => {
  assert.equal(resolveTeacherStudentSelection({
    currentId: null,
    storedId: 'student-b',
    students,
  }), 'student-b');
  assert.equal(resolveTeacherStudentSelection({
    currentId: null,
    storedId: 'missing',
    students,
  }), 'student-a');
});

test('normalizes identifiers and returns null for an empty roster', () => {
  assert.equal(normalizeTeacherStudentId(' student-b '), 'student-b');
  assert.equal(resolveTeacherStudentSelection({
    currentId: 'student-b',
    storedId: 'student-a',
    students: [],
  }), null);
});

test('never restores or selects a student who no longer studies', () => {
  assert.equal(resolveTeacherStudentSelection({
    currentId: 'former',
    storedId: 'graduate',
    students: [
      { id: 'former', grade: 11, studyStatus: 'inactive' },
      { id: 'graduate', grade: 'graduate' },
      { id: 'current', grade: 11 },
    ],
  }), 'current');
});
