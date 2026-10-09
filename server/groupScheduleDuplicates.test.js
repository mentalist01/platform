import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateGroupScheduleEntries, deduplicateGroupLessonSessions } from './groupScheduleDuplicates.js';

test('group booking copies merge despite different names and IDs while Google payment identity is retained', () => {
  const plan = { id: 'plan', groupId: 'g', date: '2026-10-07', time: '20:00', durationMinutes: 60, subject: 'Группа 2', lessonId: 'plan-lesson' };
  const google = { ...plan, id: 'google', source: 'google-calendar', subject: 'Занятие', externalEventId: 'event', lessonId: 'google-lesson' };
  const separate = [{ ...plan, id: 'individual', groupId: '' }, { ...plan, groupId: 'other' }, { ...plan, time: '21:00' }, { ...plan, date: '2026-10-09' }, { ...plan, durationMinutes: 90 }];
  for (const copies of [[plan, google], [google, plan]]) {
    const rows = deduplicateGroupScheduleEntries([...copies, ...separate]);
    assert.equal(rows.length, 6);
    assert.equal(rows[0].externalEventId, 'event');
    assert.equal(rows[0].lessonId, 'google-lesson');
  }
  assert.equal(plan.id, 'plan');
});

test('Google and plan lesson copies resolve to one room; every existing recording remains visible', () => {
  const google = { id: 'g', groupId: 'group', startAt: '2026-10-07T17:00:00Z', durationMinutes: 60, status: 'scheduled', source: 'google-calendar' };
  const plan = { ...google, id: 'p', startAt: '2026-10-07T20:00:00+03:00', source: 'availability-plan' };
  const other = { ...plan, id: 'other', groupId: 'other' };
  assert.deepEqual(deduplicateGroupLessonSessions([plan, google, other]).map(l => l.id), ['g', 'other']);
  assert.deepEqual(deduplicateGroupLessonSessions([plan, google], l => l.id === 'p').map(l => l.id), ['p']);
  assert.equal(deduplicateGroupLessonSessions([plan, google], () => true).length, 2);
  assert.deepEqual(deduplicateGroupLessonSessions([{ ...plan, status: 'active' }, google]).map(l => l.id), ['p']);
});

test('student booking copies retain payment aliases without sharing another pupil marks', () => {
  const plan = { id: 'plan:pupil', studentId: 'pupil', groupId: 'g', date: '2026-10-07', time: '20:00', paymentSourceIds: ['plan', 'plan:pupil'] };
  const google = { ...plan, id: 'google:pupil', externalEventId: 'google', paymentSourceIds: undefined };
  for (const copies of [[plan, google], [google, plan]]) {
    const [row] = deduplicateGroupScheduleEntries(copies);
    assert.equal(row.id, google.id);
    assert.deepEqual(new Set(row.paymentSourceIds), new Set(['plan', 'plan:pupil', 'google:pupil']));
  }
  const [row] = deduplicateGroupScheduleEntries([google, { ...plan, studentId: 'other', paymentSourceIds: ['other-secret'] }]);
  assert.equal(row.paymentSourceIds, undefined);
  assert.deepEqual(plan.paymentSourceIds, ['plan', 'plan:pupil']);
});
