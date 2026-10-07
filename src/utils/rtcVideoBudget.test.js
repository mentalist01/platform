import test from 'node:test';
import assert from 'node:assert/strict';
import { rtcVideoBudget } from './rtcVideoBudget.js';
const options = { bitrate: 3500000, framerate: 60, scale: 1, width: 1920, height: 1080 };
test('individual display sharing keeps the original quality', () => {
  assert.deepEqual(rtcVideoBudget({ ...options, peers: 8 }), { maxBitrate: 3500000, maxFramerate: 60, scaleResolutionDownBy: 1 });
});
test('mesh screen aggregate stays within 7 Mbps for 1 through 20 recipients', () => {
  for (let peers = 1; peers <= 20; peers++) {
    const result = rtcVideoBudget({ ...options, group: true, peers });
    assert.ok(result.maxBitrate * peers <= 7000000); assert.ok(result.maxFramerate <= 15);
    assert.ok(1920 / result.scaleResolutionDownBy <= (peers >= 8 ? 1280 : peers >= 4 ? 1600 : 1920));
  }
});
test('portrait/4K sources fit the budget and poor connection limits are preserved', () => {
  const result = rtcVideoBudget({ ...options, group: true, peers: 6, width: 2160, height: 3840, bitrate: 500000, framerate: 8, scale: 2 });
  assert.equal(result.maxBitrate, 500000); assert.equal(result.maxFramerate, 8);
  assert.ok(3840 / result.scaleResolutionDownBy <= 900);
});
test('cameras use a separate bounded budget; quality recovers as peers leave', () => {
  const many = rtcVideoBudget({ ...options, group: true, peers: 6, camera: true });
  assert.equal(many.maxBitrate, 300000); assert.equal(many.maxFramerate, 15); assert.equal(many.scaleResolutionDownBy, 3);
  const less = rtcVideoBudget({ ...options, group: true, peers: 2 });
  assert.equal(less.maxBitrate, 3500000); assert.equal(less.scaleResolutionDownBy, 1);
});
