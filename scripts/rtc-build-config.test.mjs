import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRtcBuildConfig, verifyRtcBuildBundle } from './rtc-build-config.mjs';
const env = { VITE_RTC_ICE_SERVERS: JSON.stringify([{ urls: ['stun:test'], }, { urls: ['turn:relay.test:3478?transport=udp'], username: 'fixture', credential: 'fictional' }]), VITE_RTC_ICE_TRANSPORT_POLICY: 'relay' };
test('a production or release build refuses missing, STUN-only, malformed or unauthenticated TURN configuration', () => {
  for (const value of [undefined, '[]', 'bad-json', '{}', '[{"urls":"stun:test"}]', '[{"urls":"turn:relay.test"}]']) {
    assert.throws(() => validateRtcBuildConfig({ VITE_RTC_ICE_SERVERS: value }));
  }
  assert.throws(() => validateRtcBuildConfig({ ...env, VITE_RTC_ICE_TRANSPORT_POLICY: 'invalid' }));
  assert.equal(validateRtcBuildConfig(env).policy, 'relay');
});
test('an otherwise valid build fails verification if its published call bundle drops TURN or the relay policy', () => {
  const valid = 'VITE_RTC_ICE_TRANSPORT_POLICY:"relay";turn:relay.test:3478?transport=udp';
  verifyRtcBuildBundle(valid, env);
  assert.throws(() => verifyRtcBuildBundle(valid.replace('turn:relay.test:3478?transport=udp', ''), env));
  assert.throws(() => verifyRtcBuildBundle(valid.replace('"relay"', '""'), env));
});
