import assert from 'node:assert/strict';
import test from 'node:test';

import { getActiveReplayScreenEvent } from './lessonReplaySurfaces.js';

const events = [
  { id: 'student-first', type: 'screen', offsetMs: 1000, payload: { snapshotId: 'student-1', sharedByRole: 'student' } },
  { id: 'teacher-first', type: 'screen', offsetMs: 1500, payload: { snapshotId: 'teacher-1', sharedByRole: 'teacher' } },
  { id: 'student-second', type: 'screen', offsetMs: 2000, payload: { snapshotId: 'student-2', sharedByRole: 'student' } },
  { id: 'student-stop', type: 'screen', offsetMs: 3000, payload: { active: false, sharedByRole: 'student' } },
];

test('returns the newest active student screen snapshot at the replay position', () => {
  assert.equal(getActiveReplayScreenEvent(events, 2500)?.id, 'student-second');
});

test('does not expose the teacher screen as the student screen', () => {
  assert.equal(getActiveReplayScreenEvent(events, 1700)?.id, 'student-first');
  assert.equal(getActiveReplayScreenEvent(events, 1700, 'teacher')?.id, 'teacher-first');
});

test('hides the screen after sharing has stopped', () => {
  assert.equal(getActiveReplayScreenEvent(events, 3000), null);
  assert.equal(getActiveReplayScreenEvent(events, 500), null);
});
