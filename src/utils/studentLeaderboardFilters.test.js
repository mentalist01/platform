import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterStudentLeaderboardRows,
  isLeaderboardRowStudying,
} from './studentLeaderboardFilters.js';

const rows = [
  { studentId: 'active-11', grade: 11, isStudying: true, isOnline: true },
  { studentId: 'inactive-11', grade: 11, isStudying: false, isOnline: true },
  { studentId: 'active-10', grade: 10, isStudying: true, isOnline: false },
  { studentId: 'graduate', grade: 'graduate', isGraduate: true, isStudying: false, isOnline: true },
];

const ids = (items) => items.map((row) => row.studentId);

test('leaderboard shows only current students by default', () => {
  assert.deepEqual(ids(filterStudentLeaderboardRows(rows)), ['active-11', 'active-10']);
});

test('leaderboard audience filters keep all, grade and graduate views available', () => {
  assert.deepEqual(
    ids(filterStudentLeaderboardRows(rows, { audienceFilter: 'all' })),
    ['active-11', 'inactive-11', 'active-10', 'graduate']
  );
  assert.deepEqual(
    ids(filterStudentLeaderboardRows(rows, { audienceFilter: 'grade', currentStudentGrade: 11 })),
    ['active-11', 'inactive-11']
  );
  assert.deepEqual(
    ids(filterStudentLeaderboardRows(rows, { audienceFilter: 'graduates' })),
    ['graduate']
  );
});

test('online-only can be combined with current and all audiences', () => {
  assert.deepEqual(
    ids(filterStudentLeaderboardRows(rows, { onlineOnly: true })),
    ['active-11']
  );
  assert.deepEqual(
    ids(filterStudentLeaderboardRows(rows, { audienceFilter: 'all', onlineOnly: true })),
    ['active-11', 'inactive-11', 'graduate']
  );
});

test('legacy rows fall back to the canonical study-status rules', () => {
  assert.equal(isLeaderboardRowStudying({ grade: 11 }), true);
  assert.equal(isLeaderboardRowStudying({ grade: 11, studyStatus: 'inactive' }), false);
  assert.equal(isLeaderboardRowStudying({ grade: 'graduate', studyStatus: 'active' }), false);
});
