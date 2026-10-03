'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RecordingPrivacy, SCENE, MESSAGE } = require('../recording-privacy.cjs');
function fixture() {
  let scene = 'IVAN100 — Платформа'; let recording = true;
  const calls = []; const sources = [];
  const obs = { assertCollection: async () => {}, call: async (type, data = {}) => {
    calls.push([type, data]);
    if (type === 'GetCurrentProgramScene') return { currentProgramSceneName: scene };
    if (type === 'GetSceneList') return { scenes: [] };
    if (type === 'GetInputList') return { inputs: ['IVAN100: микрофон', 'IVAN100: Телемост', 'IVAN100: платформа'].map(inputName => ({ inputName })) };
    if (type === 'GetSourceFilterList') return { filters: [] };
    if (type === 'GetSourceFilter') return { filterEnabled: true, filterSettings: { opacity: 0 } };
    if (type === 'GetInputKindList') return { inputKinds: ['text_gdiplus_v3'] };
    if (type === 'GetSceneItemList') return { sceneItems: [{ sourceName: 'Unexpected desktop capture', sceneItemId: 99 }] };
    if (type === 'GetSceneItemId') return { sceneItemId: 1 };
    if (type === 'GetVideoSettings') return { baseWidth: 1920, baseHeight: 1080 };
    if (type === 'GetSceneTransitionList') return { currentSceneTransitionName: 'Fade', transitions: [{ transitionName: 'Cut', transitionKind: 'cut_transition' }] };
    if (type === 'SetCurrentProgramScene') scene = data.sceneName;
    if (type === 'CreateSceneItem') sources.push(data.sourceName);
    return {};
  } };
  const privacy = new RecordingPrivacy({ getObs: async () => obs, isRecording: async () => recording });
  return { privacy, obs, calls, sources, scene: () => scene, setScene: value => { scene = value; }, setRecording: value => { recording = value; } };
}
test('confirms an instant private scene with the lesson audio and no capture sources', async () => {
  const f = fixture(); await f.privacy.set('platform', true);
  assert.equal(f.scene(), SCENE);
  assert.ok(f.calls.find(([type, data]) => type === 'CreateInput' && data.inputSettings.text === MESSAGE));
  assert.deepEqual(f.sources.slice(-2), ['IVAN100: микрофон', 'IVAN100: Телемост']);
  assert.ok(f.calls.find(([type, data]) => type === 'SetSceneItemEnabled' && data.sceneItemId === 99 && !data.sceneItemEnabled));
  const switchIndex = f.calls.findIndex(([type]) => type === 'SetCurrentProgramScene');
  assert.ok(f.calls.slice(0, switchIndex).some(([type, data]) => type === 'SetCurrentSceneTransition' && data.transitionName === 'Cut'));
  assert.ok(f.calls.slice(0, switchIndex).some(([type, data]) => type === 'SetSceneSceneTransitionOverride' && data.transitionName === 'Cut'));
  assert.equal(f.calls[switchIndex + 1][0], 'GetCurrentProgramScene');
  assert.equal(f.calls.at(-1)[1].transitionName, 'Fade');
  assert.ok(!f.calls.some(([type]) => /Record|InputMute|InputVolume/.test(type)));
  assert.ok(f.calls.slice(0, switchIndex).some(([type, data]) => type === 'SetSourceFilterEnabled' && data.filterEnabled));
});
test('nested private windows keep the mask until the last one closes', async () => {
  const f = fixture();
  await Promise.all([f.privacy.set('platform', true), f.privacy.set('accounts', true)]);
  await f.privacy.set('platform', false); assert.equal(f.scene(), SCENE);
  await f.privacy.set('accounts', false); assert.equal(f.scene(), 'IVAN100 — Платформа');
  assert.ok(f.calls.some(([type, data]) => type === 'SetSourceFilterEnabled' && !data.filterEnabled));
});
test('manual pause/source is preserved and a crashed privacy scene recovers to platform', async () => {
  const f = fixture(); await f.privacy.set('platform', true);
  f.setScene('IVAN100 — Перерыв'); await f.privacy.set('platform', false);
  assert.equal(f.scene(), 'IVAN100 — Перерыв');
  f.setScene(SCENE); await f.privacy.set('platform', true); await f.privacy.set('platform', false);
  assert.equal(f.scene(), 'IVAN100 — Платформа');
});
test('connection or confirmation failure rejects opening; the queue remains usable', async () => {
  const f = fixture(); const call = f.obs.call;
  f.obs.call = async (type, data) => { if (type === 'SetCurrentProgramScene') throw new Error('connection lost'); return call(type, data); };
  await assert.rejects(f.privacy.set('platform', true));
  f.obs.call = call; await f.privacy.set('platform', true); assert.equal(f.scene(), SCENE);
});
test('an idle unavailable OBS permits navigation without modifying or starting it', async () => {
  const f = fixture(); f.setRecording(false);
  f.privacy.getObs = async () => { throw new Error('not configured'); };
  await f.privacy.set('platform', true); await f.privacy.set('platform', false);
  assert.equal(f.calls.length, 0);
});
test('configured idle OBS is protected before a later record starts', async () => {
  const f = fixture(); f.setRecording(false);
  await f.privacy.set('platform', true);
  assert.equal(f.scene(), SCENE);
  assert.ok(f.calls.some(([type, data]) => type === 'SetSourceFilterEnabled' && data.filterEnabled));
  await f.privacy.set('platform', false);
  assert.equal(f.scene(), 'IVAN100 — Платформа');
});
