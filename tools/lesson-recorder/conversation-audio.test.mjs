import assert from 'node:assert/strict';
import test from 'node:test';
import { checkConversationAudio, conversationAudioHealth, selectTelemostWindow } from './conversation-audio.mjs';
import { ObsClient, INPUTS } from './obs.mjs';
const item = (value, name = value, itemEnabled = true) => ({ itemValue: value, itemName: name, itemEnabled });
const now = 100_000;

test('a renamed window with fresh sound does not report a lost conversation', () => {
  const result = conversationAudioHealth({ selected: 'old title', items: [item('old title', 'Телемост', false)], signalAt: now - 500, now });
  assert.equal(result.status, 'receiving'); assert.equal(result.warning, '');
  assert.match(result.message, /название окна изменилось/);
});
test('silence in an available conversation is not a source failure', () => {
  assert.equal(conversationAudioHealth({ selected: 'call', items: [item('call')], now }).warning, '');
});
test('old, future or disconnected meter values never establish fresh audio', () => {
  for (const signalAt of [undefined, now - 15_000, now + 1]) {
    const result = conversationAudioHealth({ selected: 'closed', items: [], signalAt, now });
    assert.equal(result.status, 'unconfirmed'); assert.match(result.warning, /не подтверждён/);
    assert.doesNotMatch(result.warning, /не записывается/);
  }
});
test('a disabled recording path takes precedence over a live input meter; an intentional break does not warn', () => {
  for (const route of [{ muted: true }, { volume: 0 }, { track: false }]) {
    assert.equal(conversationAudioHealth({ items: [], signalAt: now, now, ...route }).status, 'muted');
  }
  assert.equal(conversationAudioHealth({ items: [], muted: true, intentionalMute: true }).warning, '');
});
test('meters keep the last non-silent sample rather than treating ordinary pauses as loss', () => {
  const obs = new ObsClient();
  obs.observeAudioMeters([{ inputName: INPUTS.telemost, inputLevelsMul: [[.03, .04]] }], now);
  obs.observeAudioMeters([{ inputName: INPUTS.telemost, inputLevelsMul: [[0, 0]] }], now + 1000);
  assert.equal(obs.audioSignals[INPUTS.telemost].at, now);
  assert.equal(obs.audioSignals[INPUTS.telemost].peak, .04);
});
test('a selected open Telemost is retained, disabled and ambiguous windows are never chosen arbitrarily', () => {
  const items = [item('closed', 'Телемост', false), item('one', 'Яндекс Телемост'), item('two', 'Яндекс Телемост')];
  assert.equal(selectTelemostWindow(items, 'two'), 'two');
  assert.equal(selectTelemostWindow(items, 'closed'), '');
  assert.equal(selectTelemostWindow(items.slice(0, 2), 'closed'), 'one');
});

function fixture() {
  const obs = new ObsClient(); const events = [];
  let selected = 'platform', owner = 'lesson-test', outputActive = true;
  obs.assertCollection = async () => {};
  obs.call = async (type, data) => {
    events.push([type, data]);
    if (type === 'GetInputSettings') return { inputSettings: { window: selected } };
    if (type === 'GetRecordStatus') return { outputActive };
    if (type === 'GetProfileParameter') return { parameterValue: owner };
    if (type === 'SetInputSettings') { selected = data.inputSettings.window; delete obs.audioSignals[INPUTS.telemost]; }
    if (type === 'GetInputMute') return { inputMuted: false };
    if (type === 'GetInputVolume') return { inputVolumeMul: 1 };
    if (type === 'GetInputAudioTracks') return { inputAudioTracks: { '1': true } };
    return {};
  };
  const config = { platform: 'platform', telemost: 'platform' };
  const job = { id: 'test', status: 'recording', audioMode: 'telemost' };
  const run = (items, overrides = {}) => checkConversationAudio({ obs, config, job, items, now, ...overrides });
  return { obs, events, job, run, selected: () => selected, setSelected: value => { selected = value; }, setOwner: value => { owner = value; }, stop: () => { outputActive = false; } };
}
test('joining Telemost after recording began attaches audio to the same owned file, without touching scenes or microphone', async () => {
  const f = fixture(); const platform = item('platform', 'Платформа');
  await f.run([platform]); assert.equal(f.events.filter(([type]) => type.startsWith('Set')).length, 0);
  await f.run([platform, item('new call', 'Яндекс Телемост')]);
  assert.equal(f.selected(), 'new call');
  const writes = f.events.filter(([type]) => type.startsWith('Set'));
  assert.deepEqual(writes, [['SetInputSettings', { inputName: INPUTS.telemost, inputSettings: { window: 'new call' }, overlay: true }]]);
  await f.run([platform, item('new call', 'Яндекс Телемост')]);
  assert.equal(f.events.filter(([type]) => type.startsWith('Set')).length, 1);
});
test('a changed Telemost title reconnects; an ambiguous set of calls does not change the selection', async () => {
  const f = fixture(); f.setSelected('old Телемост');
  await f.run([item('new call', 'Яндекс Телемост')]); assert.equal(f.selected(), 'new call');
  f.setSelected('old Телемост'); f.events.length = 0;
  await f.run([item('one', 'Яндекс Телемост'), item('two', 'Яндекс Телемост')]);
  assert.equal(f.events.filter(([type]) => type.startsWith('Set')).length, 0);
});
test('another recording owner or a stopped file prevents reconnection', async () => {
  for (const state of ['foreign', 'stopped']) {
    const f = fixture(); if (state === 'foreign') f.setOwner('lesson-other'); else f.stop();
    await f.run([item('new', 'Телемост')]);
    assert.equal(f.events.filter(([type]) => type.startsWith('Set')).length, 0);
  }
});
test('Python, teacher-only, manual fallback and explicitly selected external audio remain untouched', async () => {
  for (const overrides of [{ pythonTheory: true }, { mockReview: true }, { fallbackMode: true }, { audioMode: 'teacher' }, { audioMode: 'platform' }, { status: 'starting' }]) {
    const f = fixture(); await f.run([item('new', 'Телемост')], { job: { ...f.job, ...overrides } });
    assert.equal(f.events.filter(([type]) => type.startsWith('Set')).length, 0);
  }
  const f = fixture(); f.setSelected('explicit external app');
  await f.run([item('new', 'Телемост')]); assert.equal(f.selected(), 'explicit external app');
});
test('health reads actual OBS selection after an external change rather than trusting cached preference', async () => {
  const f = fixture(); f.obs.audioWindow = 'closed'; f.setSelected('actual');
  assert.equal((await f.run([item('actual')])).warning, '');
});
test('a late join is explicitly waiting, and several meeting windows need manual selection', async () => {
  const f = fixture();
  assert.equal((await f.run([item('platform')])).status, 'waiting');
  assert.match((await f.run([item('platform'), item('one', 'Телемост'), item('two', 'Телемост')])).warning, /несколько/);
});
test('a deliberate break keeps its sources and ordinary recording readiness after a Python session is not blocked', async () => {
  const f = fixture();
  const result = await f.run([item('new', 'Телемост')], { scene: 'IVAN100 — Перерыв' });
  assert.equal(result.status, 'off'); assert.equal(f.events.filter(([type]) => type.startsWith('Set')).length, 0);
  assert.equal((await f.run([], { job: undefined, scene: 'IVAN100 Python — Редактор' })).warning, '');
});
