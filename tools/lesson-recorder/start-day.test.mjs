import test from 'node:test';
import assert from 'node:assert/strict';
import { startDay, refreshDaySources } from './start-day.mjs';
const item = (value, name = value) => ({ itemValue: value, itemName: name, itemEnabled: true });
const config = { platform: 'old', telemost: 'closed', mic: 'microphone', screen: 'display' };
const choices = { platform: [item('new', 'Платформа - Google Chrome')], telemost: [], mic: [item('microphone')], screen: [item('display')] };
test('daily preparation reselects one platform window and permits absent Telemost without guessing a microphone', () => {
  assert.deepEqual(refreshDaySources(config, choices), { ...config, platform: 'new', telemost: 'new' });
  assert.throws(() => refreshDaySources(config, { ...choices, mic: [] }), /микрофон/);
  assert.throws(() => refreshDaySources(config, { ...choices, platform: [...choices.platform, item('two', 'Платформа')] }), /несколько/);
});
test('start day checks storage first, preserves an ongoing recording, and never records by itself', async () => {
  const calls = []; const cfg = { ...config, token: 'test', recordDirectory: 'D:\\video' };
  const obs = { launch: async () => calls.push('launch'), status: async () => ({ outputActive: true }), setup: async () => calls.push('setup'), choices: async () => choices, configure: async () => calls.push('configure') };
  const options = { config: cfg, obs, checkDirectory: () => calls.push('disk'), platform: async () => calls.push('platform'), save: () => {} };
  await assert.rejects(startDay(options), /уже записывает/); assert.deepEqual(calls, ['disk', 'launch']);
  calls.length = 0; obs.status = async () => ({ outputActive: false }); await startDay(options);
  assert.deepEqual(calls, ['disk', 'launch', 'setup', 'configure', 'platform']); assert.ok(cfg.dayStartedAt);
});

test('daily preparation finds the teacher app, ignores its recorder window, and follows the platform audio source', () => {
  const app = item('IVAN100 Учитель:Chrome_WidgetWin_1:IVAN100-Teacher.exe', '[IVAN100-Teacher.exe]: IVAN100 Учитель');
  const helper = item('helper', '[IVAN100-Teacher.exe]: IVAN100 — Пульт записи');
  const sources = { ...choices, platform: [...choices.platform, helper, app], telemost: [item('old'), app] };
  const result = refreshDaySources({ ...config, telemost: config.platform }, sources);
  assert.equal(result.platform, app.itemValue);
  assert.equal(result.telemost, app.itemValue);
  assert.equal(refreshDaySources({ ...config, platform: 'new', telemost: 'new' }, sources).platform, 'new');
  assert.throws(() => refreshDaySources(config, { ...sources, platform: [...sources.platform, { ...app, itemValue: 'another-app' }] }), /несколько/);
});

test('a saved desktop source does not fall back to the browser when the application is closed', () => {
  const savedApp = 'IVAN100 Учитель:Chrome_WidgetWin_1:IVAN100-Teacher.exe';
  assert.throws(() => refreshDaySources({ ...config, platform: savedApp }, choices), /Откройте приложение/);
  const disabledApp = item(savedApp, '[IVAN100-Teacher.exe]: IVAN100 Учитель');
  disabledApp.itemEnabled = false;
  assert.throws(() => refreshDaySources({ ...config, platform: savedApp }, { ...choices, platform: [...choices.platform, disabledApp] }), /Откройте приложение/);
});
