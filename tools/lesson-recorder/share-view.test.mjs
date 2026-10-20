import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { ShareBridge } from './share-bridge.mjs';
import { SCENES } from './obs.mjs';

const html = fs.readFileSync(new URL('./share-view.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

async function fixture() {
  let time = 1_000_000, frame, peer, next = { id: 'capture', jobId: 'lesson', offer: {} };
  let failGet = false, failAnswer = false;
  const track = { kind: 'video', readyState: 'live' };
  const video = { videoWidth: 1920, play: async () => {}, requestVideoFrameCallback: callback => { frame = callback; } };
  let scene = SCENES.platform;
  const bridge = new ShareBridge({ now: () => time, active: () => ({ id: 'lesson' }), enabled: () => true,
    api: async () => next, obs: { call: async () => ({ currentProgramSceneName: scene }), select: async mode => { scene = SCENES[mode]; } } });
  bridge.initialized = true;
  await bridge.tick();
  const requests = [], peers = [];
  class Peer {
    constructor() { peer = this; peers.push(this); this.connectionState = 'connected'; this.iceGatheringState = 'complete'; }
    async setRemoteDescription() { this.ontrack({ track }); }
    async createAnswer() { return {}; }
    async setLocalDescription() { this.localDescription = { toJSON: () => ({ type: 'answer', sdp: 'v=0' }) }; }
    addEventListener() {}
    removeEventListener() {}
    close() { this.connectionState = 'closed'; }
  }
  const context = vm.createContext({ document: { querySelector: () => video }, location: { hash: '#local-key' },
    Date: { now: () => time }, RTCPeerConnection: Peer, MediaStream: class { constructor(tracks) { this.tracks = tracks; } getVideoTracks() { return this.tracks; } },
    setInterval() {}, setTimeout, clearTimeout,
    fetch: async (url, options = {}) => {
      const payload = options.body && JSON.parse(options.body);
      if (!payload && failGet || payload?.answer && failAnswer) throw Error('Temporary signalling failure');
      requests.push(payload || 'GET');
      if (payload) await bridge.receive(payload);
      return { ok: true, json: async () => next };
    },
  });
  // Exercise the actual script shipped to OBS, including its automatic first poll.
  vm.runInContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  const tick = async () => { await vm.runInContext('tick()', context); await bridge.tick(); };
  const ready = () => requests.filter(request => typeof request.ready === 'boolean').at(-1)?.ready;
  return { tick, ready, track, peers, bridge, requests,
    frame: () => frame(), advance: ms => { time += ms; }, scene: () => scene, peer: () => peer,
    stop: () => { next = null; }, failGet: value => { failGet = value; }, failAnswer: value => { failAnswer = value; } };
}

test('a static spreadsheet stays in the recording after its first decoded frame', async () => {
  const f = await fixture();
  assert.equal(f.ready(), false, 'Do not switch to a feed before its first frame');
  f.frame(); await f.tick(); assert.equal(f.scene(), SCENES.share);
  for (let second = 0; second < 60; second++) {
    f.advance(1000); await f.tick();
    assert.equal(f.ready(), true, 'An unchanged document is still a live screen share');
    assert.equal(f.scene(), SCENES.share, 'Do not alternate between the platform and the spreadsheet');
  }
  f.track.readyState = 'ended'; await f.tick();
  assert.equal(f.scene(), SCENES.platform, 'An ended video track must release the share scene');
});

test('short peer interruptions hold the spreadsheet; sustained disconnection releases it', async () => {
  const f = await fixture(); f.frame(); await f.tick();
  f.peer().connectionState = 'disconnected';
  f.advance(1000); await f.tick(); assert.equal(f.scene(), SCENES.share);
  f.advance(1000); f.peer().connectionState = 'connected'; await f.tick(); assert.equal(f.scene(), SCENES.share);
  f.peer().connectionState = 'disconnected'; f.advance(6000); await f.tick();
  assert.equal(f.scene(), SCENES.platform);
});

test('a failed local poll does not close a working video connection or change its answer', async () => {
  const f = await fixture(); f.frame(); await f.tick(); const peer = f.peer();
  f.failGet(true); f.advance(1000); await f.tick();
  assert.equal(peer.connectionState, 'connected');
  f.failGet(false); await f.tick();
  assert.equal(f.peers.length, 1, 'Keep the peer already negotiated by the platform');
  assert.equal(f.scene(), SCENES.share);
  f.stop(); await f.tick(); assert.equal(peer.connectionState, 'closed');
  assert.equal(f.scene(), SCENES.platform);
});

test('a rejected answer is retried on the same peer instead of abandoning its negotiation', async () => {
  const f = await fixture();
  // Start a new offer whose first answer submission fails.
  f.peer().connectionState = 'failed'; f.failAnswer(true); await f.tick(); const negotiating = f.peer();
  f.failAnswer(false); f.frame(); await f.tick();
  assert.equal(f.peer(), negotiating);
  assert.equal(f.requests.filter(request => request?.answer).length, 2);
  assert.equal(f.scene(), SCENES.share);
});
