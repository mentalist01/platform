import assert from 'node:assert/strict';
import test from 'node:test';
import { pythonCaptureConfig, pythonCaptureReason, configurePythonCapture, PythonPreviewSession } from './python-capture.mjs';
import { ObsClient, INPUTS, SCENES, PYTHON_INPUTS, PYTHON_SCENES } from './obs.mjs';

const item = value => ({ itemEnabled: true, itemValue: value });
const choices = { platform: ['python-platform', 'editor', 'other-editor'].map(item), mic: [item('python-mic')], screen: [item('monitor')] };
const selected = { mode: 'window', platform: 'python-platform', window: 'editor', screen: 'monitor', mic: 'python-mic' };
function fixture() {
  let active; let output = false; let stream = false; let owner = ''; let saves = 0; const calls = [];
  const state = { config: { platform: 'lesson-platform', program: 'lesson-editor', telemost: 'lesson-call', screen: 'lesson-screen', mic: 'lesson-mic' } };
  const obs = { status: async () => ({ outputActive: output }), call: async type => type === 'GetStreamStatus' ? { outputActive: stream } : { parameterValue: owner },
    choices: async () => choices, ensurePythonSources: async () => calls.push('ensure'), configurePython: async value => calls.push(['configure', value]), selectPython: async mode => calls.push(['select', mode]) };
  const run = (payload, busy) => configurePythonCapture({ obs, state, engine: { active: () => active }, save: () => saves++, payload, busy });
  return { run, state, calls, saves: () => saves, live: job => { active = job; output = !!job; owner = job ? `lesson-${job.id}` : ''; }, foreign: () => { output = true; owner = 'foreign'; }, stream: () => { stream = true; }, lost: () => { output = false; } };
}
test('Python preferences start empty, persist independently, and accept separate window and screen modes', async () => {
  const f = fixture(); const before = JSON.stringify(f.state.config);
  assert.equal(pythonCaptureConfig(f.state.config.pythonCapture).window, '');
  await f.run({ window: 'editor' });
  assert.match(pythonCaptureReason(f.state.config.pythonCapture), /микрофон/);
  await f.run({ mic: 'python-mic' });
  assert.equal(pythonCaptureReason(f.state.config.pythonCapture, choices), '');
  await f.run({ platform: 'python-platform', screen: 'monitor', mode: 'screen' });
  const restored = JSON.parse(JSON.stringify(f.state));
  assert.equal(restored.config.pythonCapture.mode, 'screen');
  assert.equal(restored.config.pythonCapture.window, 'editor');
  const { pythonCapture, ...ordinary } = f.state.config;
  assert.equal(JSON.stringify(ordinary), before);
  assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === 'select'), false, 'Idle setup must not switch the current lesson scene');
});
test('changing a live Python source keeps the job, updates its capture snapshot and never restores lesson sources', async () => {
  const f = fixture(); await f.run(selected);
  const job = { id: 'python', status: 'recording', pythonTheory: {}, captureConfig: selected };
  f.live(job); await f.run({ window: 'other-editor' });
  assert.equal(job.id, 'python'); assert.equal(job.captureConfig.window, 'other-editor');
  assert.deepEqual(f.calls.at(-1), ['select', 'window']);
  assert.equal(f.state.config.program, 'lesson-editor');
  await f.run({ mode: 'platform' }); assert.deepEqual(f.calls.at(-1), ['select', 'platform']);
  await f.run({ mode: 'screen' }); assert.deepEqual(f.calls.at(-1), ['select', 'screen']);
});
test('a normal lesson, a starting or stopping Python job, foreign recording, stream and busy work block every mutation', async () => {
  for (const job of [{ id: 'normal', status: 'recording' }, { id: 'python', status: 'starting', pythonTheory: {} }, { id: 'python', status: 'stopping', pythonTheory: {} }]) {
    const f = fixture(); f.live(job); await assert.rejects(f.run(selected), /завершите/); assert.equal(f.saves(), 0); assert.deepEqual(f.calls, []);
  }
  for (const change of ['foreign', 'stream']) { const f = fixture(); f[change](); await assert.rejects(f.run(selected), /другая запись|трансляцию/); assert.equal(f.saves(), 0); assert.deepEqual(f.calls, []); }
  const busy = fixture(); await assert.rejects(busy.run(selected, true), /окончания/); assert.deepEqual(busy.calls, []);
  const lost = fixture(); lost.live({ id: 'python', status: 'recording', pythonTheory: {} }); lost.lost(); await assert.rejects(lost.run(selected), /не подтверждает/); assert.deepEqual(lost.calls, []);
});
test('missing, closed and invalid sources do not silently select another window', async () => {
  assert.match(pythonCaptureReason({}, choices), /окно редактора/);
  for (const mode of ['window', 'platform', 'screen']) assert.match(pythonCaptureReason({ ...selected, mode, [mode]: 'closed' }, choices), /Недоступен/);
  const f = fixture(); await assert.rejects(f.run({ window: 'closed' }), /доступный/); await assert.rejects(f.run({ mode: 'pause' }), /Неизвестный/);
  assert.deepEqual(f.calls, []); assert.equal(f.saves(), 0);
});
test('dedicated OBS sources include only their own microphone and preview does not switch the program scene', async () => {
  const obs = new ObsClient(); obs.assertCollection = async () => {}; const calls = []; const scenes = new Map(); const inputs = new Set();
  obs.call = async (type, payload = {}) => {
    calls.push([type, payload]);
    if (type === 'GetSceneList') return { scenes: [...scenes.keys()].map(sceneName => ({ sceneName })) };
    if (type === 'CreateScene') scenes.set(payload.sceneName, []);
    if (type === 'GetInputList') return { inputs: [...inputs].map(inputName => ({ inputName })) };
    if (type === 'CreateInput') { inputs.add(payload.inputName); scenes.get(payload.sceneName).push({ sourceName: payload.inputName }); }
    if (type === 'GetSceneItemList') return { sceneItems: scenes.get(payload.sceneName) };
    if (type === 'CreateSceneItem') scenes.get(payload.sceneName).push({ sourceName: payload.sourceName });
    if (type === 'GetSceneItemId') return { sceneItemId: 1 };
    if (type === 'GetVideoSettings') return { baseWidth: 2560, baseHeight: 1440 };
    if (type === 'GetSourceScreenshot') return { imageData: 'preview' };
    return {};
  };
  await obs.ensurePythonSources(); await obs.ensurePythonSources(); await obs.configurePython(selected);
  assert.equal(inputs.size, 4);
  for (const [mode, name] of Object.entries(PYTHON_SCENES)) assert.deepEqual(scenes.get(name).map(item => item.sourceName).sort(), [PYTHON_INPUTS[mode], PYTHON_INPUTS.mic].sort());
  for (const [type, payload] of calls) if (type === 'SetInputSettings' || type === 'SetInputMute') assert.ok(Object.values(PYTHON_INPUTS).includes(payload.inputName));
  assert.equal(await obs.preview(PYTHON_SCENES.window), 'preview');
  assert.equal(calls.some(([type]) => type === 'SetCurrentProgramScene'), false);
  await obs.selectPython('window'); assert.equal(calls.at(-1)[1].sceneName, PYTHON_SCENES.window);
  assert.ok(calls.some(([type, p]) => type === 'SetSceneItemTransform' && p.sceneItemTransform.boundsWidth === 2560));
  assert.equal(calls.some(([, p]) => p.inputName === INPUTS.telemost || p.sceneName === SCENES.platform), false);
});

function previewFixture() {
  let now=0,scene=SCENES.platform,output=false,stream=false;const switches=[];
  const obs={status:async()=>({outputActive:output,scene}),call:async(type,data)=>{if(type==='GetStreamStatus')return {outputActive:stream};if(type==='SetCurrentProgramScene'){scene=data.sceneName;switches.push(scene);}},selectPython:async mode=>{scene=PYTHON_SCENES[mode];switches.push(scene);},preview:async name=>name===scene?'live frame':'black frame'};
  return {session:new PythonPreviewSession({obs,now:()=>now}),switches,scene:()=>scene,time:value=>now=value,output:value=>output=value,stream:value=>stream=value,manual:value=>scene=value};
}
test('visible idle Python preview activates its sources, switches modes, then restores the preceding scene on release or timeout',async()=>{
  const f=previewFixture();assert.equal(await f.session.image('screen',{idle:true}),'live frame');assert.equal(f.scene(),PYTHON_SCENES.screen);
  f.time(5000);await f.session.image('window',{idle:true});f.time(16000);await f.session.expire();assert.equal(f.scene(),PYTHON_SCENES.window);
  f.time(17000);await f.session.expire();assert.equal(f.scene(),SCENES.platform);
  await f.session.image('screen',{idle:true});await f.session.release();assert.equal(f.scene(),SCENES.platform);
});
test('preview does not redirect an active lesson, foreign output, stream or busy operation, and release preserves a newer scene',async()=>{
  for(const change of ['output','stream']){const f=previewFixture();f[change](true);await assert.rejects(f.session.image('screen',{idle:true}),/урока|трансляции/);assert.deepEqual(f.switches,[]);}
  const busy=previewFixture();await assert.rejects(busy.session.image('screen',{idle:false}),/операции/);assert.deepEqual(busy.switches,[]);
  const active=previewFixture();await active.session.image('screen',{idle:true});active.output(true);await active.session.release();assert.equal(active.scene(),PYTHON_SCENES.screen);
  const manual=previewFixture();await manual.session.image('screen',{idle:true});manual.manual(SCENES.window);await manual.session.release();assert.equal(manual.scene(),SCENES.window);
});
test('preview of the current Python recording reads its active scene without a scene switch or a restoration lease',async()=>{
  const f=previewFixture();f.manual(PYTHON_SCENES.window);f.output(true);assert.equal(await f.session.image('window',{ownRecording:true}),'live frame');await f.session.release();assert.deepEqual(f.switches,[]);
});
