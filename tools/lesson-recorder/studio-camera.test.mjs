import assert from 'node:assert/strict';
import test from 'node:test';
import { ObsClient, PYTHON_SCENES, SCENES } from './obs.mjs';
import { configurePythonCapture, pythonCaptureConfig, pythonCaptureReason } from './python-capture.mjs';
import { startMockReview } from './mock-review.mjs';
import { STUDIO_CAMERA_INPUT, studioCameraConfig, studioCameraReason, studioCameraTransform, cameraCorners } from './studio-camera.mjs';

const camera = { enabled: true, device: 'link-2c-id', corner: 'bottom-right', size: 'small' };
const cameraItems = [{ itemEnabled: true, itemName: 'Insta360 Link 2C', itemValue: camera.device }];
const sources = { platform: [{ itemEnabled: true, itemValue: 'editor' }], mic: [{ itemEnabled: true, itemValue: 'mic' }], camera: cameraItems };
const capture = { mode: 'window', window: 'editor', mic: 'mic', camera };

test('old recordings have no camera; invalid settings normalize to a small bottom-right inset', () => {
  assert.equal(pythonCaptureConfig().camera.enabled, false);
  assert.deepEqual(studioCameraConfig({ enabled: 'true', device: 123, corner: 'outside', size: '__proto__' }), { enabled: false, device: '', corner: 'bottom-right', size: 'small' });
  for (const baseWidth of [1920, 2560]) for (const corner of cameraCorners) for (const size of ['small', 'medium', 'large']) {
    const baseHeight = baseWidth * 9 / 16, transform = studioCameraTransform({ corner, size }, { baseWidth, baseHeight });
    assert.ok(transform.positionX > 0 && transform.positionY > 0);
    assert.ok(transform.positionX + transform.boundsWidth < baseWidth && transform.positionY + transform.boundsHeight < baseHeight);
    assert.equal(transform.alignment, 5);
    if (size === 'small') assert.equal(transform.boundsWidth, Math.round(baseWidth * .2));
  }
});

test('an enabled missing or unplugged camera blocks recording instead of substituting another device', () => {
  assert.equal(pythonCaptureReason(capture, sources), '');
  assert.match(studioCameraReason({ enabled: true }), /Выберите веб-камеру/);
  assert.match(pythonCaptureReason(capture, { ...sources, camera: [] }), /недоступна/);
  assert.match(pythonCaptureReason(capture, { ...sources, camera: [{ ...cameraItems[0], itemEnabled: false }] }), /недоступна/);
  assert.equal(pythonCaptureReason({ ...capture, camera: { enabled: false, device: 'unplugged' } }, sources), '');
});

function obsFixture() {
  const obs = new ObsClient(), calls = [], inputs = new Map(), scenes = new Map(Object.values(PYTHON_SCENES).map(name => [name, []]));
  let nextId = 1, recording = false, streaming = false, scene = SCENES.platform;
  const settings = { active: true };
  obs.assertCollection = async () => {};
  obs.call = async (type, data = {}) => {
    calls.push({ type, data });
    if (type === 'GetRecordStatus') return { outputActive: recording };
    if (type === 'GetStreamStatus') return { outputActive: streaming };
    if (type === 'GetCurrentProgramScene') return { currentProgramSceneName: scene };
    if (type === 'SetCurrentProgramScene') scene = data.sceneName;
    if (type === 'GetInputSettings') return { inputSettings: { ...settings } };
    if (type === 'SetInputSettings') Object.assign(settings, data.inputSettings);
    if (type === 'CallInputPropertiesButton') throw Error('Unknown OBS WebSocket request');
    if (type === 'PressInputPropertiesButton') settings.active = !settings.active;
    if (type === 'GetSceneItemId') return { sceneItemId: 1 };
    if (type === 'GetSceneList') return { scenes: [...scenes.keys()].map(sceneName => ({ sceneName })) };
    if (type === 'GetInputList') return { inputs: [...inputs].map(([inputName, inputKind]) => ({ inputName, inputKind })) };
    if (type === 'CreateInput') {
      inputs.set(data.inputName, data.inputKind);
      scenes.get(data.sceneName).push({ sourceName: data.inputName, sceneItemId: nextId++, sceneItemEnabled: data.sceneItemEnabled });
    }
    if (type === 'CreateSceneItem') scenes.get(data.sceneName).push({ sourceName: data.sourceName, sceneItemId: nextId++, sceneItemEnabled: data.sceneItemEnabled });
    if (type === 'GetSceneItemList') return { sceneItems: scenes.get(data.sceneName) };
    if (type === 'GetVideoSettings') return { baseWidth: 2560, baseHeight: 1440 };
    if (type === 'GetInputPropertiesListPropertyItems') return { propertyItems: cameraItems };
    if (type === 'SetSceneItemEnabled') scenes.get(data.sceneName).find(item => item.sceneItemId === data.sceneItemId).sceneItemEnabled = data.sceneItemEnabled;
    return {};
  };
  return { obs, calls, scenes, inputs, settings, recording: value => recording = value, streaming: value => streaming = value };
}

test('camera discovery stays disabled and refuses to modify OBS during a recording or stream', async () => {
  for (const output of ['recording', 'streaming']) {
    const f = obsFixture(); f[output](true);
    await assert.rejects(f.obs.setupStudioCamera(), /окончания/);
    assert.ok(f.calls.every(call => call.type.startsWith('Get')));
  }
  const f = obsFixture(); assert.deepEqual(await f.obs.setupStudioCamera(), cameraItems);
  assert.deepEqual(await f.obs.setupStudioCamera(), cameraItems);
  assert.equal(f.calls.filter(call => call.type === 'CreateInput' && call.data.inputName === STUDIO_CAMERA_INPUT).length, 1);
  for (const items of f.scenes.values()) assert.equal(items.find(item => item.sourceName === STUDIO_CAMERA_INPUT).sceneItemEnabled, false);
  const created = f.calls.find(call => call.type === 'CreateInput' && call.data.inputName === STUDIO_CAMERA_INPUT).data;
  assert.equal(created.inputSettings.video_device_id, '');
  assert.equal(created.inputSettings.deactivate_when_not_showing, true);
  assert.equal(f.calls.some(call => call.type === 'SetCurrentProgramScene' || call.type === 'StartRecord'), false);
});

test('hours of background source polling enumerate cameras once while windows stay live; explicit refresh discovers new devices', async () => {
  const f = obsFixture();
  for (let poll = 0; poll < 1080; poll++) assert.deepEqual((await f.obs.choices()).camera, cameraItems);
  const cameraCalls = () => f.calls.filter(c => c.type === 'GetInputPropertiesListPropertyItems' && c.data.inputName === STUDIO_CAMERA_INPUT);
  assert.equal(cameraCalls().length, 1, 'Three hours of ten-second polls must not repeatedly load virtual-camera drivers');
  assert.equal(f.calls.filter(c => c.type === 'GetInputPropertiesListPropertyItems' && c.data.propertyName === 'window').length, 2160);
  await f.obs.setupStudioCamera();
  assert.equal(cameraCalls().length, 2, 'The existing Refresh cameras action still enumerates devices');
  await f.obs.choices(); assert.equal(cameraCalls().length, 2);
});

test('concurrent camera requests share discovery, failed discovery can retry, and empty lists are cached', async () => {
  const obs = new ObsClient(); let reads = 0, release;
  obs.call = async () => { reads++; await new Promise(r => { release = r; }); return { propertyItems: [] }; };
  const first = obs.cameraChoices(), second = obs.cameraChoices();
  assert.equal(reads, 1); release();
  assert.deepEqual(await Promise.all([first, second]), [[], []]);
  assert.deepEqual(await obs.cameraChoices(), []); assert.equal(reads, 1);
  obs.call = async () => { reads++; throw Error('Disconnected'); };
  await assert.rejects(obs.cameraChoices({ refresh: true }), /Disconnected/);
  obs.call = async () => { reads++; return { propertyItems: cameraItems }; };
  assert.deepEqual(await obs.cameraChoices({ refresh: true }), cameraItems);
  assert.deepEqual(await obs.cameraChoices(), cameraItems); assert.equal(reads, 3);
});

test('the inset is composited over every studio source, muted, and never attached to ordinary lesson scenes', async () => {
  const f = obsFixture(); await f.obs.setupStudioCamera(); f.calls.length = 0;
  await f.obs.configureStudioCamera(camera);
  const settings = f.calls.find(call => call.type === 'SetInputSettings').data.inputSettings;
  assert.equal(settings.video_device_id, camera.device);
  assert.equal(settings.resolution, '1280x720');
  assert.equal(settings.deactivate_when_not_showing, true);
  for (const [sceneName, items] of f.scenes) {
    assert.equal(items.find(item => item.sourceName === STUDIO_CAMERA_INPUT).sceneItemEnabled, true);
    const transform = f.calls.find(call => call.type === 'SetSceneItemTransform' && call.data.sceneName === sceneName).data.sceneItemTransform;
    assert.equal(transform.boundsWidth, 512);
    assert.ok(transform.positionX > 1900 && transform.positionY > 1000);
    assert.equal(f.calls.find(call => call.type === 'SetSceneItemIndex' && call.data.sceneName === sceneName).data.sceneItemIndex, items.length - 1);
  }
  assert.ok(f.calls.some(call => call.type === 'SetInputMute' && call.data.inputMuted));
  assert.ok(f.calls.filter(call => call.type === 'SetInputAudioTracks').every(call => Object.values(call.data.inputAudioTracks).every(value => value === false)));
  assert.ok(f.calls.every(call => !Object.values(SCENES).includes(call.data.sceneName)));
  assert.equal(f.settings.active, false, 'Saving preferences outside the studio must not leave the physical camera on');
  await f.obs.selectPython('screen');
  assert.equal(f.settings.active, true, 'Showing the studio activates its selected camera');
  const deviceUpdates = f.calls.filter(call => call.type === 'SetInputSettings').length;
  await f.obs.configureStudioCamera({ ...camera, corner: 'top-left' });
  assert.equal(f.calls.filter(call => call.type === 'SetInputSettings').length, deviceUpdates, 'Moving the inset must not restart the camera device');
  await f.obs.configureStudioCamera({ enabled: false });
  for (const items of f.scenes.values()) assert.equal(items.find(item => item.sourceName === STUDIO_CAMERA_INPUT).sceneItemEnabled, false);
  assert.equal(f.settings.active, false);
});

test('camera preferences and live job snapshots persist; normal lessons reject all studio mutations', async () => {
  const state = { config: { platform: 'lesson', pythonCapture: capture } }, writes = [];
  let active = { id: 'review', status: 'recording', captureProfile: 'python', mockReview: {}, captureConfig: capture };
  const obs = { status: async () => ({ outputActive: true }), call: async type => type === 'GetStreamStatus' ? { outputActive: false } : { parameterValue: `lesson-${active.id}` },
    choices: async () => sources, ensurePythonSources: async () => writes.push('ensure'), configurePython: async value => writes.push(value), selectPython: async () => writes.push('select') };
  const run = payload => configurePythonCapture({ state, obs, engine: { active: () => active }, save: () => writes.push('save'), payload });
  await run({ camera: { corner: 'top-left', size: 'medium' } });
  assert.equal(state.config.pythonCapture.camera.device, camera.device);
  assert.equal(active.captureConfig.camera.corner, 'top-left');
  assert.equal(state.config.platform, 'lesson');
  writes.length = 0;
  await assert.rejects(run({ camera: { device: 'other-device' } }), /недоступна/); assert.deepEqual(writes, []);
  active = { id: 'lesson', status: 'recording' };
  await assert.rejects(run({ camera: { enabled: false } }), /завершите/); assert.deepEqual(writes, []);
});

test('a monthly review preserves its camera in the capture snapshot and the same montage publication gate', async () => {
  let job;
  await startMockReview({ api: async () => ({ teacherId: 'teacher', month: '2026-10', exams: [{ id: 'exam', title: 'Октябрь', existingUrl: '' }] }),
    engine: { active: () => null, start: async value => job = value }, payload: { month: '2026-10', examId: 'exam', expectedUrl: '' }, captureConfig: capture });
  assert.deepEqual(job.captureConfig.camera, camera);
  assert.equal(job.pythonTimeline.approved, false);
  assert.equal(job.mockReview.examId, 'exam');
});
