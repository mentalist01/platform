import test from 'node:test';
import assert from 'node:assert/strict';
import { CALL_RESUME_KEY, clearCallResume, readCallResume, saveCallResume } from './callResume.js';
const fixture = () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const user = { id: 't', role: 'teacher' };
  const call = { userId: 't', role: 'teacher', teacherId: 't', studentId: 's', roomId: 'rtc:t:s', micEnabled: false };
  const options = { storage, navigationType: 'reload', now: 100_000 };
  saveCallResume(call, storage, 90_000);
  return { storage, user, call, options };
};
test('reload restores exact room and mute state for the same teacher', () => {
  const { user, options } = fixture();
  assert.equal(readCallResume(user, options).studentId, 's');
  assert.equal(readCallResume(user, options).micEnabled, false);
});
test('student reload requires the same assigned teacher and own student id', () => {
  const { storage, options } = fixture();
  const user = { id: 's', role: 'student', teacherId: 't' };
  saveCallResume({ userId: 's', role: 'student', teacherId: 't', studentId: 's', roomId: 'rtc:t:s' }, storage, 90_000);
  assert.ok(readCallResume(user, options));
  assert.equal(readCallResume({ ...user, teacherId: 'other' }, options), null);
});
test('new tab, history navigation, different account and old markers never autojoin', () => {
  const { user, options } = fixture();
  for (const navigationType of ['navigate', 'back_forward', undefined]) {
    assert.equal(readCallResume(user, { ...options, navigationType }), null);
  }
  assert.equal(readCallResume({ ...user, id: 'other' }, options), null);
  assert.equal(readCallResume(user, { ...options, now: 300_000 }), null);
});
test('manual leave/logout clears reload intent; malformed and blocked storage are safe', () => {
  const { storage, user, options } = fixture();
  clearCallResume(storage);
  assert.equal(readCallResume(user, options), null);
  storage.setItem(CALL_RESUME_KEY, '{');
  assert.equal(readCallResume(user, options), null);
  assert.doesNotThrow(() => clearCallResume({ removeItem() { throw new Error(); } }));
});
test('room metadata mismatch cannot resume a different room', () => {
  const { storage, user, call, options } = fixture();
  saveCallResume({ ...call, roomId: 'rtc:other:s' }, storage, 90_000);
  assert.equal(readCallResume(user, options), null);
});
