import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldEndRecordingOnCallExit } from './callExitIntent.js';

test('leaving or switching call transport does not immediately finish a lesson recording', () => {
  for (const role of ['teacher', 'student']) for (const action of ['leave', 'telemost', 'reconnect', undefined]) {
    assert.equal(shouldEndRecordingOnCallExit({ action, role, isGroupLesson: false, meetingId: '' }), false);
  }
});
test('only an explicit individual lesson finish by its teacher requests an immediate recorder stop', () => {
  assert.equal(shouldEndRecordingOnCallExit({ action: 'finish-lesson', role: 'teacher' }), true);
  for (const scope of [{ role: 'student' }, { role: 'teacher', isGroupLesson: true }, { role: 'teacher', meetingId: 'meeting' }]) {
    assert.equal(shouldEndRecordingOnCallExit({ action: 'finish-lesson', ...scope }), false);
  }
});
