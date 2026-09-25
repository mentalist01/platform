import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeerRecovery, getRtcPeerConnectionState, reconcileRtcPeer } from './peerRecovery.js';

test('ICE failure is not hidden by a stale aggregate connected state', () => {
  assert.equal(getRtcPeerConnectionState({ connectionState: 'connected', iceConnectionState: 'failed' }), 'failed');
  assert.equal(getRtcPeerConnectionState({ connectionState: 'connected', iceConnectionState: 'disconnected' }), 'disconnected');
});
test('media-only failure requests fresh ICE while signalling is still healthy', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pc = { connectionState: 'connected', iceConnectionState: 'disconnected' };
  let restarts = 0;
  const recovery = createPeerRecovery({ pc, restartIce: () => { restarts++; }, reconnect: () => assert.fail() });
  recovery.update();
  t.mock.timers.tick(2999); await Promise.resolve(); assert.equal(restarts, 0);
  t.mock.timers.tick(1); await Promise.resolve(); assert.equal(restarts, 1);
  pc.iceConnectionState = 'connected'; recovery.update();
  t.mock.timers.tick(30_000); await Promise.resolve(); assert.equal(restarts, 1);
});
test('stuck SDP cannot leave a call hanging: watchdog rejoins after two attempts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pc = { connectionState: 'failed' };
  let reconnects = 0, attempts = 0;
  const recovery = createPeerRecovery({ pc, restartIce: () => { attempts++; return new Promise(() => {}); }, reconnect: () => { reconnects++; } });
  recovery.update(); t.mock.timers.tick(1); await Promise.resolve();
  t.mock.timers.tick(10_000); await Promise.resolve();
  t.mock.timers.tick(10_000); await Promise.resolve();
  assert.equal(attempts, 2); assert.equal(reconnects, 1);
});
test('manual leave/disposal and transient disconnection cancel media recovery', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pc = { connectionState: 'disconnected' };
  const recovery = createPeerRecovery({ pc, restartIce: () => assert.fail(), reconnect: () => assert.fail() });
  recovery.update(); pc.connectionState = 'connected'; recovery.update();
  t.mock.timers.tick(30_000); await Promise.resolve();
  pc.connectionState = 'failed'; recovery.update(); recovery.dispose();
  t.mock.timers.tick(30_000); await Promise.resolve();
});
test('old own socket is ignored; reconnected participant replaces stale entry', () => {
  const self = { userId: 't', role: 'teacher' };
  assert.ok(reconcileRtcPeer({ id: 'old-self', peer: self, self, peers: [] }).ignore);
  const old = { userId: 's', role: 'student', joinedAt: 100 };
  const fresh = { ...old, joinedAt: 200 };
  assert.deepEqual(reconcileRtcPeer({ id: 'new', peer: fresh, self, peers: [['old', old]] }), { ignore: false, replace: ['old'] });
  assert.ok(reconcileRtcPeer({ id: 'old', peer: old, self, peers: [['new', fresh]] }).ignore);
});
