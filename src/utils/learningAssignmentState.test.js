import test from 'node:test';
import assert from 'node:assert/strict';
import { getLearningAssignmentState } from './learningAssignmentState.js';

test('acceptance closes exactly at the deadline, including timezone offsets', () => {
  const assignment = { status: 'assigned', dueAt: '2026-10-09T20:00:00+03:00' };
  assert.equal(getLearningAssignmentState(assignment, '2026-10-09T16:59:59.999Z').status, 'assigned');
  assert.deepEqual(getLearningAssignmentState(assignment, '2026-10-09T17:00:00Z'), { status: 'closed', closureReason: 'deadline' });
  assert.equal(getLearningAssignmentState(assignment, '2026-10-10T00:00:00Z').status, 'closed');
});

test('deadline extension reopens auto expiry, but never manual closure or a draft', () => {
  const now = '2026-10-09T17:00:00Z';
  const expiredProjection = { status: 'closed', acceptanceStatus: 'assigned', dueAt: now };
  assert.equal(getLearningAssignmentState(expiredProjection, now).closureReason, 'deadline');
  assert.equal(getLearningAssignmentState({ ...expiredProjection, dueAt: '2026-10-16T17:00:00Z' }, now).status, 'assigned');
  assert.deepEqual(getLearningAssignmentState({ status: 'closed', dueAt: '2026-10-16T17:00:00Z' }, now), { status: 'closed', closureReason: 'manual' });
  assert.equal(getLearningAssignmentState({ status: 'draft', dueAt: now }, now).status, 'draft');
});

test('use the homework deadline consistently and leave undated homework open', () => {
  const now = '2026-10-09T17:00:00Z';
  assert.equal(getLearningAssignmentState({ dueAt: '2026-10-16T17:00:00Z', homework: { dueAt: now } }, now).status, 'closed');
  for (const dueAt of ['', undefined, 'invalid']) assert.equal(getLearningAssignmentState({ dueAt }, now).status, 'assigned');
});
