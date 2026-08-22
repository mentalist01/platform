import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGoogleCalendarLearningLessonId,
  normalizeGoogleCalendarLearningGroupName,
  resolveGoogleCalendarLearningGroupMatch,
} from './googleCalendarLearningGroups.js';

const group = (overrides = {}) => ({
  id: 'group-a',
  teacherId: 'teacher-a',
  name: 'Группа 2',
  status: 'active',
  members: [],
  ...overrides,
});

test('matches one unfinished teacher-owned group by exact normalized title', () => {
  const result = resolveGoogleCalendarLearningGroupMatch({
    title: '  ГРУППА-2 ',
    teacherId: 'teacher-a',
    groups: [
      group(),
      group({ id: 'foreign', teacherId: 'teacher-b' }),
      group({ id: 'completed', status: 'completed', completedAt: '2026-08-01T00:00:00.000Z' }),
    ],
  });
  assert.equal(result.group?.id, 'group-a');
  assert.equal(result.ambiguous, false);
  assert.equal(normalizeGoogleCalendarLearningGroupName('Группа ё'), 'группа е');
});

test('does not choose between duplicate normalized names', () => {
  const result = resolveGoogleCalendarLearningGroupMatch({
    title: 'Группа 2',
    teacherId: 'teacher-a',
    groups: [group(), group({ id: 'group-b', name: 'группа-2' })],
  });
  assert.equal(result.group, null);
  assert.equal(result.ambiguous, true);
  assert.deepEqual(result.matchedGroupIds, ['group-a', 'group-b']);
});

test('builds a stable lesson id per external event occurrence', () => {
  const input = {
    teacherId: 'teacher-a',
    groupId: 'group-a',
    externalEventId: 'series@example.test',
    startAt: '2026-09-07T15:30:00.000Z',
  };
  assert.equal(buildGoogleCalendarLearningLessonId(input), buildGoogleCalendarLearningLessonId(input));
  assert.notEqual(
    buildGoogleCalendarLearningLessonId(input),
    buildGoogleCalendarLearningLessonId({ ...input, startAt: '2026-09-14T15:30:00.000Z' })
  );
  assert.equal(buildGoogleCalendarLearningLessonId({ ...input, groupId: '' }), '');
});
