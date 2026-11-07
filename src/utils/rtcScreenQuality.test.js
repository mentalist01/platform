import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREEN_CAPTURE_MAX_FPS, createScreenVideoSampler, createScreenVideoController, screenVideoProfile, createVideoSenderTuner, findScreenVideoReport } from './rtcScreenQuality.js';
import { rtcVideoBudget } from './rtcVideoBudget.js';
const stats = (...rows) => new Map(rows.map(row => [row.id, row]));
const outgoing = (extra = {}) => ({ id: 'screen', type: 'outbound-rtp', kind: 'video', mid: '1', ssrc: 42,
  timestamp: 1000, framesEncoded: 20, bytesSent: 50000, packetsSent: 100, totalEncodeTime: 0.2, ...extra });
const active = { direction: 'outbound', measured: true, fps: 20, bitrate: 500000, processingLoad: 0.1, limitation: 'none', lossPercent: 0 };

test('screen matching never mistakes a simultaneous camera for the shared sheet', () => {
  const camera = outgoing({ id: 'camera', mid: '2' }), screen = outgoing();
  const report = stats(camera, screen);
  assert.equal(findScreenVideoReport(report, { direction: 'outbound', mid: '1' }), screen);
  assert.equal(findScreenVideoReport(report, { direction: 'outbound', trackId: 'unknown' }), null);
  assert.equal(findScreenVideoReport(report, { direction: 'inbound', mid: '1' }), null);
  const source = { id: 'source', trackIdentifier: 'sheet-track' };
  assert.equal(findScreenVideoReport(stats({ ...screen, mediaSourceId: source.id }, source), { direction: 'outbound', trackId: 'sheet-track' }).id, 'screen');
});

test('video samples use interval counters, not lifetime averages, including remote packet loss', () => {
  const sampler = createScreenVideoSampler(), selector = { direction: 'outbound', mid: '1', trackId: 'sheet' };
  const report = (row, lost) => stats({ ...row, remoteId: 'remote', codecId: 'codec', transportId: 'transport' },
    { id: 'remote', packetsLost: lost }, { id: 'codec', mimeType: 'video/H264' },
    { id: 'transport', selectedCandidatePairId: 'pair' }, { id: 'pair', availableOutgoingBitrate: 2000000 });
  assert.equal(sampler.sample(report(outgoing(), 1), selector).measured, false);
  const sample = sampler.sample(report(outgoing({ timestamp: 3500, framesEncoded: 70, bytesSent: 300000, packetsSent: 200, totalEncodeTime: 0.7 }), 3), selector);
  assert.equal(sample.fps, 20); assert.equal(sample.bitrate, 800000); assert.equal(sample.lossPercent, 2);
  assert.ok(Math.abs(sample.processingMs - 10) < 0.0001); assert.equal(sample.availableBitrate, 2000000);
  assert.equal(sample.codec, 'video/H264');
  assert.equal(sampler.sample(report(outgoing({ timestamp: 6000, framesEncoded: 1, bytesSent: 3 }), 0), selector).measured, false);
  assert.equal(sampler.sample(report(outgoing({ timestamp: 8500, ssrc: 43 }), 0), selector).measured, false);
  assert.equal(sampler.sample(report(outgoing({ timestamp: 11000, ssrc: 43 }), 0), { ...selector, trackId: 'new-share' }).measured, false);
});

test('receiving diagnostics distinguish decode time, dropped frames and freezes; long sampling gaps reset', () => {
  const sampler = createScreenVideoSampler(), selector = { direction: 'inbound', trackId: 'remote' };
  const initial = { id: 'rx', type: 'inbound-rtp', kind: 'video', trackIdentifier: 'remote', timestamp: 1000,
    framesDecoded: 100, bytesReceived: 10000, packetsReceived: 100, packetsLost: 2, totalDecodeTime: 1, framesDropped: 5, freezeCount: 1 };
  sampler.sample(stats(initial), selector);
  const sample = sampler.sample(stats({ ...initial, timestamp: 3500, framesDecoded: 125, bytesReceived: 110000,
    packetsReceived: 195, packetsLost: 7, totalDecodeTime: 1.5, framesDropped: 8, freezeCount: 3 }), selector);
  assert.equal(sample.fps, 10); assert.equal(sample.lossPercent, 5); assert.equal(sample.processingMs, 20);
  assert.equal(sample.framesDropped, 3); assert.equal(sample.freezes, 2);
  assert.equal(sampler.sample(stats({ ...initial, timestamp: 60000 }), selector).measured, false);
  sampler.reset(); assert.equal(sampler.sample(stats({ ...initial, timestamp: 62500 }), selector).measured, false);
});

test('a static spreadsheet and missing browser counters do not trigger a quality spiral', () => {
  const controller = createScreenVideoController();
  for (let now = 0; now < 120000; now += 2500) controller.sample({ ...active, fps: 0, bitrate: 0, limitation: 'bandwidth' }, now);
  assert.deepEqual(controller.profile(), { cpu: 0, network: 0 });
  assert.equal(controller.sample({ ...active, measured: false, limitation: 'cpu' }, 120000), false);
  assert.equal(controller.sample({ ...active, direction: 'inbound', limitation: 'cpu' }, 125000), false);
});

test('persistent encoder pressure reduces fps before pixels, with hysteresis and gradual recovery', () => {
  const controller = createScreenVideoController(), bad = { ...active, limitation: 'cpu' };
  assert.equal(controller.sample(bad, 0), false); assert.equal(controller.sample(bad, 2500), true);
  assert.deepEqual(controller.profile(), { cpu: 1, network: 0 });
  controller.sample(bad, 5000); assert.equal(controller.sample(bad, 7500), false);
  controller.sample(bad, 10000); assert.equal(controller.sample(bad, 12500), true);
  const reduced = screenVideoProfile({ controller: controller.profile() });
  assert.equal(reduced.screenScale, 1); assert.equal(reduced.screenFramerate, 10);
  for (let now = 15000; now <= 32500; now += 2500) controller.sample(active, now);
  assert.equal(controller.profile().cpu, 1);
  for (let now = 35000; now <= 52500; now += 2500) controller.sample(active, now);
  assert.equal(controller.profile().cpu, 0);
});

test('sustained video congestion is per peer and alone permits modest downscaling', () => {
  const bad = createScreenVideoController(), healthy = createScreenVideoController();
  for (let now = 0; now <= 15000; now += 2500) {
    bad.sample({ ...active, limitation: 'bandwidth', lossPercent: 8 }, now); healthy.sample(active, now);
  }
  assert.deepEqual(bad.profile(), { cpu: 0, network: 2 }); assert.equal(healthy.profile().network, 0);
  const first = screenVideoProfile({ controller: { network: 1 } }); assert.equal(first.screenScale, 1); assert.equal(first.screenFramerate, 15);
  const severe = screenVideoProfile({ controller: bad.profile() }); assert.equal(severe.screenScale, 1.25); assert.equal(severe.screenFramerate, 8);
});

test('audio jitter or enabling a webcam preserves text resolution and the 30 fps capture cap is hard', () => {
  assert.equal(SCREEN_CAPTURE_MAX_FPS, 30);
  for (const quality of ['good', 'ok', 'poor']) for (const highVideoLoad of [true, false]) {
    const profile = screenVideoProfile({ quality, highVideoLoad, framerate: 60 });
    assert.equal(profile.screenScale, 1); assert.ok(profile.screenFramerate <= 30);
    assert.equal(profile.degradationPreference, 'maintain-resolution');
    const group = rtcVideoBudget({ group: true, peers: 6, bitrate: profile.screenBitrate, framerate: profile.screenFramerate, scale: profile.screenScale });
    assert.ok(group.maxBitrate * 6 <= 7000000); assert.ok(group.maxFramerate <= 15);
  }
});

test('sender updates serialize, coalesce and preserve RTP identifiers instead of racing', async () => {
  let params = { transactionId: 'tx', encodings: [{ rid: 'screen', active: true }] }, release;
  const calls = [], sender = { getParameters: () => structuredClone(params), setParameters: async next => {
    calls.push(next); if (calls.length === 1) await new Promise(resolve => { release = resolve; }); params = next;
  } };
  const apply = createVideoSenderTuner();
  const budget = fps => ({ encoding: { maxFramerate: fps }, degradationPreference: 'maintain-resolution' });
  const first = apply(sender, budget(30)); await Promise.resolve();
  apply(sender, budget(20)); apply(sender, budget(10)); release(); await first;
  assert.deepEqual(calls.map(call => call.encodings[0].maxFramerate), [30, 10]);
  assert.equal(calls[1].encodings[0].rid, 'screen'); assert.equal(calls[1].transactionId, 'tx');
  await apply(sender, budget(10)); assert.equal(calls.length, 2);
});

test('missing SDP encodings are retried later, and a rejected tune does not poison future updates', async () => {
  let ready = false, failed = false, applied = 0, errors = 0;
  const sender = { getParameters: () => ({ encodings: ready ? [{}] : [] }), setParameters: async () => {
    if (!failed) { failed = true; throw new DOMException('fixture', 'OperationError'); } applied++;
  } };
  const apply = createVideoSenderTuner(() => errors++), budget = { encoding: { maxFramerate: 15 }, degradationPreference: 'maintain-resolution' };
  await apply(sender, budget); ready = true; await apply(sender, budget); await apply(sender, budget);
  assert.equal(errors, 1); assert.equal(applied, 1);
});
