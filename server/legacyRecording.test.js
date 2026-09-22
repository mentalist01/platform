import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyRecordingWriteGuard } from './legacyRecording.js';

test('disabled legacy capture keeps archives and OBS lesson lifecycle available', () => {
  for (const [method, path, passes] of [
    ['GET', '/audio/id', true], ['GET', '/snapshot/id', true], ['GET', '/activity', true],
    ['POST', '/lesson/finish', true], ['POST', '/session', false], ['POST', '/events', false],
    ['POST', '/snapshot', false], ['POST', '/audio/upload/id', false], ['POST', '/finish', false],
  ]) {
    let next = false;
    let code;
    const res = { status(value) { code = value; return this; }, json(value) { assert.equal(value.code, 'LEGACY_RECORDING_DISABLED'); } };
    legacyRecordingWriteGuard(false)({ method, path }, res, () => { next = true; });
    assert.equal(next, passes, `${method} ${path}`);
    if (!passes) assert.equal(code, 410);
  }
});
test('explicit legacy fallback still permits recording', () => {
  let next = false;
  legacyRecordingWriteGuard(true)({ method: 'POST', path: '/session' }, {}, () => { next = true; });
  assert.equal(next, true);
});
