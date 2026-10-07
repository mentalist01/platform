import test from 'node:test';
import assert from 'node:assert/strict';
import { preferH264ForVideoSender } from './rtcVideoCodec.js';

test('H.264 preference retains fallback formats and repair codecs on the matching sender', () => {
  const sender = {}, otherSender = {};
  const vp8 = { mimeType: 'video/VP8', clockRate: 90000 };
  const rtx = { mimeType: 'video/rtx', clockRate: 90000 };
  const baseline = { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42e01f', clockRate: 90000 };
  const high = { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=640c1f', clockRate: 90000 };
  const codecs = [vp8, rtx, baseline, high];
  let applied;
  const pc = { getTransceivers: () => [
    { sender: otherSender, setCodecPreferences: () => assert.fail('wrong sender') },
    { sender, setCodecPreferences: next => { applied = next; } },
  ] };
  assert.equal(preferH264ForVideoSender(pc, sender, { getCapabilities: () => ({ codecs }) }), true);
  assert.deepEqual(applied, [baseline, high, vp8, rtx]);
  assert.deepEqual(codecs, [vp8, rtx, baseline, high]);
});

test('missing H.264 and unsupported preference APIs retain default negotiation', () => {
  const sender = {};
  const pc = { getTransceivers: () => [{ sender, setCodecPreferences: () => assert.fail('must retain default') }] };
  assert.equal(preferH264ForVideoSender(pc, sender, { getCapabilities: () => ({ codecs: [{ mimeType: 'video/VP8' }] }) }), false);
  assert.equal(preferH264ForVideoSender({}, sender), false);
});

test('unsupported preferences do not break screen-sharing setup', () => {
  const sender = {};
  const capabilities = { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264' }] }) };
  const pc = { getTransceivers: () => [{ sender, setCodecPreferences: () => { throw new DOMException('unsupported'); } }] };
  assert.equal(preferH264ForVideoSender(pc, sender, capabilities), false);
});
