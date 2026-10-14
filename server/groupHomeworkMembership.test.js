import test from 'node:test';
import assert from 'node:assert/strict';
import { isGroupHomeworkRequired, groupHomeworkMembershipProjection } from './groupHomeworkMembership.js';

const work = { id: 'old', source: 'learning-group', issuedAt: '2026-10-08T10:00Z', dueAt: '2026-10-14T17:00Z' };
const group = (status = 'removed', leftAt = '2026-10-14T12:00Z') => ({ members: [{ studentId: 'artem', status, leftAt }] });
test('leaving before or exactly at the deadline withdraws old group work, retaining history', () => {
  for (const leftAt of ['2026-10-14T12:00Z', work.dueAt]) {
    const g = group('removed', leftAt);
    assert.equal(isGroupHomeworkRequired(work, g, 'artem'), false);
    assert.deepEqual(groupHomeworkMembershipProjection(work, g, 'artem', 'assigned'), {
      learningMembershipEndedAt: leftAt, learningHomeworkCancelledAt: leftAt, learningAssignmentStatus: 'closed',
    });
  }
  assert.equal(work.id, 'old');
  assert.equal(work.dueAt, '2026-10-14T17:00Z');
});
test('late departure preserves the deadline result, but the assignment leaves the active list', () => {
  const g = group('removed', '2026-10-14T18:00Z');
  assert.equal(isGroupHomeworkRequired(work, g, 'artem'), true);
  assert.equal(groupHomeworkMembershipProjection(work, g, 'artem', 'assigned').learningAssignmentStatus, 'closed');
  assert.equal(groupHomeworkMembershipProjection(work, g, 'artem', 'assigned').learningHomeworkCancelledAt, '');
});
test('active students and individual work keep their obligations', () => {
  const g = group('active', '');
  assert.equal(isGroupHomeworkRequired(work, g, 'artem'), true);
  assert.equal(groupHomeworkMembershipProjection(work, g, 'artem', 'assigned').learningAssignmentStatus, 'assigned');
  assert.equal(isGroupHomeworkRequired({ ...work, source: '' }, null, 'artem'), true);
});
test('missing membership or unknown departure does not invent a penalty; undated old work is withdrawn', () => {
  for (const g of [null, { members: [] }, group('removed', ''), { ...group(), deletedAt: '2026-10-14' }]) {
    assert.equal(isGroupHomeworkRequired(work, g, 'artem'), false);
  }
  assert.equal(isGroupHomeworkRequired({ ...work, dueAt: '' }, group(), 'artem'), false);
});
test('returning to the group does not revive an already withdrawn assignment', () => {
  const withdrawn = { ...work, ...groupHomeworkMembershipProjection(work, group(), 'artem', 'assigned') };
  assert.equal(isGroupHomeworkRequired(withdrawn, group('active'), 'artem'), false);
  assert.equal(groupHomeworkMembershipProjection(withdrawn, group('active'), 'artem', 'assigned').learningAssignmentStatus, 'closed');
  assert.equal(isGroupHomeworkRequired({ ...work, id: 'new-assignment' }, group('active'), 'artem'), true);
});
