import test from 'node:test';
import assert from 'node:assert/strict';
import { focusedSource, OfficeFollower } from './office-follow.mjs';
import { SCENES } from './obs.mjs';

const windowItem = (value, exe, title) => ({ itemValue: value, itemName: `[${exe}]: ${title}`, itemEnabled: true });
const platform = windowItem('platform-window', 'chrome.exe', 'Платформа - Google Chrome');
const calc = windowItem('calc-window', 'soffice.bin', 'Задача.ods - LibreOffice Calc');
const writer = windowItem('writer-window', 'soffice.bin', 'Урок.odt - LibreOffice Writer');
const calcFocus = { exe: 'soffice.bin', title: 'Задача.ods - LibreOffice Calc' };
const writerFocus = { exe: 'soffice.bin', title: 'Урок.odt - LibreOffice Writer' };
const platformFocus = { exe: 'chrome.exe', title: 'Платформа - Google Chrome' };

test('only the configured platform or an unambiguous LibreOffice document can be followed', () => {
  const items = [platform, calc, writer];
  assert.equal(focusedSource(items, calcFocus, platform.itemValue)?.mode, 'office');
  const localizedTitle = 'Без имени 1 — LibreOffice Calc';
  assert.equal(focusedSource([windowItem('ru-calc', 'soffice.bin', localizedTitle)], { exe: 'soffice.bin', title: localizedTitle }, platform.itemValue)?.mode, 'office');
  assert.equal(focusedSource(items, platformFocus, platform.itemValue)?.mode, 'platform');
  assert.equal(focusedSource(items, { exe: 'chrome.exe', title: 'Другая вкладка' }, platform.itemValue), null);
  assert.equal(focusedSource([...items, { ...calc }], calcFocus, platform.itemValue), null);
  assert.equal(focusedSource([{ ...calc, itemEnabled: false }], calcFocus, platform.itemValue), null);
  const dialog = windowItem('dialog', 'soffice.bin', 'Сохранить как');
  assert.equal(focusedSource([dialog], { exe: 'soffice.bin', title: 'Сохранить как' }, platform.itemValue), null);
});

test('working in LibreOffice follows each document, then returns to platform; unrelated apps never become sources', async () => {
  let foreground = calcFocus; let scene = SCENES.platform; let items = [platform, calc, writer]; let shared = false;
  const calls = []; const config = { autoOffice: true, platform: platform.itemValue };
  const follower = new OfficeFollower({ config: () => config, shareActive: () => shared,
    reader: { start() {}, stop() {}, current: () => foreground },
    obs: { call: async type => type === 'GetCurrentProgramScene' ? { currentProgramSceneName: scene } : { propertyItems: items },
      select: async (mode, window) => { calls.push([mode, window]); scene = SCENES[mode]; } } });
  await follower.tick(); assert.deepEqual(calls.pop(), ['office', calc.itemValue]);
  await follower.tick(); assert.equal(calls.length, 0, 'Do not reset the capture every second');
  foreground = writerFocus; await follower.tick(); assert.deepEqual(calls.pop(), ['office', writer.itemValue]);
  foreground = { exe: '', title: '' }; await follower.tick(); assert.equal(calls.length, 0);
  foreground = platformFocus; await follower.tick(); assert.deepEqual(calls.pop(), ['platform', undefined]);
  foreground = calcFocus;
  for (const mode of ['pause', 'window', 'screen', 'share']) { scene = SCENES[mode]; await follower.tick(); assert.equal(calls.length, 0, mode); }
  scene = SCENES.platform; shared = true; await follower.tick(); assert.equal(calls.length, 0);
  shared = false; await follower.tick(); calls.length = 0;
  items = [platform]; await follower.tick(); assert.equal(scene, SCENES.platform, 'A closed or minimized document must not linger');
  items = [platform, calc]; await follower.tick(); foreground = null; await follower.tick(); assert.equal(scene, SCENES.platform, 'Watcher failure restores platform');
  config.autoOffice = false; foreground = calcFocus; await follower.tick(); assert.equal(scene, SCENES.platform);
});
