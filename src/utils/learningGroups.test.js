import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLearningGroup,
  normalizeLearningGroupAttendance,
  normalizeLearningGroupList,
} from './learningGroups.js';

test('normalizes a teacher group without duplicating its shared schedule', () => {
  const group = normalizeLearningGroup({
    id: 'group-a',
    name: 'ЕГЭ 90+',
    maxStudents: 5,
    members: [
      { studentId: 'student-a', name: 'Анна' },
      { studentId: 'student-b', name: 'Борис' },
    ],
    schedule: [{ id: 'slot-a', weekdayKey: 'monday', time: '18:30', durationMinutes: 60 }],
  });

  assert.equal(group.status, 'ready');
  assert.equal(group.memberCount, 2);
  assert.equal(group.schedule.length, 1);
  assert.deepEqual(group.participantIds, ['student-a', 'student-b']);
});

test('accepts wrapped student projections and keeps only returned groups', () => {
  const groups = normalizeLearningGroupList({
    groups: [{ id: 'group-a', name: 'Поток', status: 'active', members: [] }],
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].status, 'active');
});

test('treats a one-student group as ready to start', () => {
  const group = normalizeLearningGroup({
    id: 'group-one',
    name: 'Один участник',
    members: [{ studentId: 'student-a', name: 'Анна' }],
  });
  assert.equal(group.status, 'ready');
  assert.equal(group.memberCount, 1);
});

test('attendance fills missing roster entries without sharing another student record', () => {
  const records = normalizeLearningGroupAttendance({
    records: [{ studentId: 'student-a', status: 'present', attendedSeconds: 3200 }],
  }, [
    { studentId: 'student-a', name: 'Анна' },
    { studentId: 'student-b', name: 'Борис' },
  ]);

  assert.equal(records.length, 2);
  assert.equal(records.find((entry) => entry.studentId === 'student-a').status, 'present');
  assert.equal(records.find((entry) => entry.studentId === 'student-b').status, 'unknown');
});
