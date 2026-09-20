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
