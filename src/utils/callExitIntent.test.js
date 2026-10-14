import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldEndRecordingOnCallExit } from './callExitIntent.js';

test('leaving or switching call transport does not immediately finish a lesson recording', () => {
  for (const role of ['teacher', 'student']) for (const action of ['leave', 'telemost', 'reconnect', undefined]) {
    assert.equal(shouldEndRecordingOnCallExit({ action, role, isGroupLesson: false, meetingId: '' }), false);
  }
});
test('teacher finishes stop individual and group recordings; pupils and guest meetings cannot', () => {
  assert.equal(shouldEndRecordingOnCallExit({ action: 'finish-lesson', role: 'teacher' }), true);
  assert.equal(shouldEndRecordingOnCallExit({ action: 'finish-lesson', role: 'teacher', isGroupLesson: true }), true);
  assert.equal(shouldEndRecordingOnCallExit({ action: 'leave', role: 'teacher', isGroupLesson: true }), true);
  for (const scope of [{ role: 'student' }, { role: 'teacher', meetingId: 'meeting' }]) {
    assert.equal(shouldEndRecordingOnCallExit({ action: 'finish-lesson', ...scope }), false);
  }
});
