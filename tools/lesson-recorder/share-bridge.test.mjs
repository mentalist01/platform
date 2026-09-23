import test from 'node:test';
import assert from 'node:assert/strict';
import { ShareBridge } from './share-bridge.mjs';
import { SCENES } from './obs.mjs';
test('share follows only a live matching lesson; pause and manual scenes win; ending restores platform', async () => {
  let time = 100; let scene = SCENES.platform; let offer = { id: 'capture', jobId: 'one' }; let enabled = true;
  const bridge = new ShareBridge({ now: () => time, active: () => ({ id: 'one' }), enabled: () => enabled,
    api: async () => offer, obs: { call: async () => ({ currentProgramSceneName: scene }), select: async mode => { scene = SCENES[mode]; } } });
  bridge.initialized = true;
  await bridge.tick(); assert.equal(scene, SCENES.platform, 'Do not capture a blank/unconnected feed');
  await bridge.receive({ id: 'capture', ready: true }); await bridge.tick(); assert.equal(scene, SCENES.share);
  scene = SCENES.pause; await bridge.tick(); assert.equal(scene, SCENES.pause);
  scene = SCENES.window; await bridge.tick(); assert.equal(scene, SCENES.window);
  scene = SCENES.platform; await bridge.tick(); assert.equal(scene, SCENES.share);
  offer = { id: 'other', jobId: 'other-lesson' }; await bridge.tick(); assert.equal(scene, SCENES.platform);
  offer = { id: 'again', jobId: 'one' }; await bridge.tick(); await bridge.receive({ id: 'again', ready: true }); await bridge.tick();
  time += 4001; await bridge.tick(); assert.equal(scene, SCENES.platform);
  await bridge.receive({ id: 'again', ready: true }); await bridge.tick();
  enabled = false; await bridge.tick(); assert.equal(scene, SCENES.platform);
});
