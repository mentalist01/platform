import assert from 'node:assert/strict';
import test from 'node:test';
import { ObsClient } from './obs.mjs';

function fixture() {
  const obs = new ObsClient(); const collection = 'IVAN100 Lessons'; let configured;
  obs.launch = async () => {};
  obs.setRecordDirectory = async () => {};
  obs.call = async (type) => {
    if (type === 'GetProfileList') return { profiles: [collection], currentProfileName: collection };
    if (type === 'GetSceneCollectionList') return { sceneCollections: [collection], currentSceneCollectionName: collection };
    return { outputActive: false };
  };
  obs.choices = async () => ({
    platform: [{ itemEnabled: true, itemValue: 'platform' }],
    telemost: [
      { itemEnabled: false, itemValue: 'closed', itemName: 'Старый Телемост' },
      { itemEnabled: true, itemValue: 'platform', itemName: 'Платформа' },
      { itemEnabled: true, itemValue: 'meeting', itemName: 'Яндекс Телемост' },
    ], mic: [{ itemEnabled: true, itemValue: 'mic' }],
  });
  obs.configure = async (value) => { configured = value; };
  return { obs, configured: () => configured };
}

test('start waits for the encoder instead of treating the accepted RPC as an active output', async () => {
  const obs = new ObsClient(); obs.assertCollection = async () => {};
  obs.selectPython = async mode => assert.equal(mode, 'screen');
  let owner = ''; let accepted = false; let reads = 0; let starts = 0;
  obs.call = async (type, data) => {
    if (type === 'GetProfileParameter') return { parameterValue: owner };
    if (type === 'SetProfileParameter') owner = data.parameterValue;
    if (type === 'StartRecord') { accepted = true; starts++; }
    if (type === 'GetRecordStatus') return { outputActive: accepted && ++reads >= 3 };
    return {};
  };
  await obs.start('python', 'python', 'screen');
  assert.equal(starts, 1); assert.equal(reads, 3); assert.equal(owner, 'lesson-python');
});

test('stop waits until output is inactive before another lesson can take over the profile', async () => {
  const obs = new ObsClient(); obs.assertCollection = async () => {};
  let reads = 0; let stops = 0;
  obs.call = async type => {
    if (type === 'GetProfileParameter') return { parameterValue: 'lesson-python' };
    if (type === 'StopRecord') { stops++; return { outputPath: 'lesson-python.mkv' }; }
    if (type === 'GetRecordStatus') return { outputActive: ++reads < 3 };
    return {};
  };
  assert.equal(await obs.stop(), 'lesson-python.mkv'); assert.equal(reads, 3); assert.equal(stops, 1);
});

test('unconfirmed transitions and a changed output owner never claim success or issue another start/stop', async () => {
  const obs = new ObsClient(); let active = false; let owner = 'lesson-python'; const calls = [];
  obs.call = async type => { calls.push(type); return type === 'GetProfileParameter' ? { parameterValue: owner } : { outputActive: active }; };
  await assert.rejects(obs.waitRecordingState('lesson-python', { active: true, timeoutMs: 0 }), /не подтвердил/);
  active = true;
  await assert.rejects(obs.waitRecordingState('lesson-python', { active: false, timeoutMs: 0 }), /сохраняет/);
  owner = 'lesson-other';
  await assert.rejects(obs.waitRecordingState('lesson-python', { active: true }), /другая запись/);
  assert.ok(calls.every(type => ['GetRecordStatus', 'GetProfileParameter'].includes(type)));
});

test('native pause and resume verify output ownership, confirm state and tolerate retries', async () => {
  const obs = new ObsClient(); obs.assertCollection = async () => {};
  let paused = false; let owner = 'lesson-python'; let active = true; const calls = [];
  obs.call = async type => {
    calls.push(type);
    if (type === 'GetProfileParameter') return { parameterValue: owner };
    if (type === 'PauseRecord') paused = true;
    if (type === 'ResumeRecord') paused = false;
    return { outputActive: active, outputPaused: paused };
  };
  assert.equal((await obs.setRecordPaused('python', true)).outputPaused, true);
  await obs.setRecordPaused('python', true);
  assert.equal(calls.filter(type => type === 'PauseRecord').length, 1);
  assert.equal((await obs.setRecordPaused('python', false)).outputPaused, false);
  assert.equal(calls.filter(type => type === 'ResumeRecord').length, 1);
  owner = 'lesson-other';
  await assert.rejects(obs.setRecordPaused('python', true), /другая запись/);
  active = false;
  await assert.rejects(obs.setRecordPaused('python', true), /завершил/);
  assert.equal(calls.filter(type => type === 'PauseRecord').length, 1);
});

test('OBS must confirm pause before the control can claim success', async () => {
  const obs = new ObsClient(); obs.assertCollection = async () => {};
  obs.call = async type => type === 'GetProfileParameter' ? { parameterValue: 'lesson-python' } : { outputActive: true, outputPaused: false };
  await assert.rejects(obs.setRecordPaused('python', true), /подтвердить/);
});

test('a platform call uses platform audio even when the saved Telemost window is closed', async () => {
  const f = fixture(); const config = { platform: 'platform', telemost: 'closed', mic: 'mic' };
  await f.obs.prepare(config, 'unused', 'platform');
  assert.equal(f.configured().telemost, 'platform');
  assert.equal(config.telemost, 'closed', 'Keep the saved preference for later calls');
});

test('a Telemost lesson selects its open meeting window', async () => {
  const f = fixture();
  await f.obs.prepare({ platform: 'platform', telemost: 'platform', mic: 'mic' }, 'unused', 'telemost');
  assert.equal(f.configured().telemost, 'meeting');
});
test('desktop lesson captures the selected application window for both video and conversation audio', async () => {
  const f = fixture(); const config = { platform: 'IVAN100 Учитель:Qt5152QWindowIcon:IVAN100-Teacher.exe', telemost: 'old-chrome', mic: 'mic' };
  f.obs.choices = async () => ({ platform: [{ itemEnabled: true, itemValue: config.platform }], telemost: [{ itemEnabled: true, itemValue: config.platform }], mic: [{ itemEnabled: true, itemValue: 'mic' }] });
  await f.obs.prepare(config, 'unused', 'platform');
  assert.equal(f.configured().platform, config.platform); assert.equal(f.configured().telemost, config.platform);
});

test('Python theory mutes conversation, then an ordinary lesson restores it', async () => {
  const f = fixture(); const original = f.obs.call; const mutes = [];
  f.obs.call = async (method, payload) => { if (method === 'SetInputMute') mutes.push(payload); return original(method, payload); };
  const config = { platform: 'platform', telemost: 'closed', mic: 'mic' };
  await f.obs.prepare(config, 'unused', 'teacher');
  assert.equal(mutes.find(m => m.inputName.endsWith('Телемост')).inputMuted, true);
  mutes.length = 0; await f.obs.prepare(config, 'unused', 'platform');
  assert.equal(mutes.find(m => m.inputName.endsWith('Телемост')).inputMuted, false);
});

test('source fitting follows the configured canvas instead of reducing 1440p to 1080p', async () => {
  const obs = new ObsClient(); let transform;
  obs.call = async (type, data) => {
    if (type === 'GetSceneItemId') return { sceneItemId: 1 };
    if (type === 'GetVideoSettings') return { baseWidth: 2560, baseHeight: 1440 };
    if (type === 'SetSceneItemTransform') transform = data.sceneItemTransform;
  };
  await obs.fit('platform');
  assert.equal(transform.boundsWidth, 2560);
  assert.equal(transform.boundsHeight, 1440);
});
