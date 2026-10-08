import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkbookHelperInstall, getWorkbookHelperPlatform, getWorkbookHelperUnsupportedMessage, isWorkbookHelperSupported, resolveWorkbookHelperInstallUrl } from './workbookHelperInstall.js';

test('Windows and macOS use their own helpers while iPad, mobile and Linux stay unsupported', () => {
  for (const device of [
    { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    { userAgentData: { platform: 'Windows' }, userAgent: 'Mozilla/5.0' },
  ]) {
    assert.equal(getWorkbookHelperPlatform(device), 'windows');
    assert.equal(isWorkbookHelperSupported(device), true);
  }
  for (const [platform, device] of [
    ['mac', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15' }],
    ['mac', { userAgentData: { platform: 'macOS' } }],
    ['ios', { platform: 'MacIntel', maxTouchPoints: 5 }],
    ['ios', { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)' }],
    ['android', { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14)' }],
    ['linux', { platform: 'Linux x86_64' }],
    ['unknown', {}],
  ]) {
    assert.equal(getWorkbookHelperPlatform(device), platform);
    assert.equal(isWorkbookHelperSupported(device), platform === 'mac', platform);
  }
});

test('Mac installs its experimental ZIP and never recommends the Windows exe', () => {
  const installer = getWorkbookHelperInstall({ platform: 'MacIntel' });
  assert.equal(installer.url, '/assets/IVAN100-WorkbookHelper-Mac-0.1.0.zip');
  assert.equal(installer.isDownload, true);
  assert.equal(installer.supported, true);
  assert.equal(installer.badge, 'Тестовая версия macOS');
  assert.equal(installer.saveShortcut, 'Cmd+S');
  assert.match(installer.instructions, /Установить\.command/);
  assert.doesNotMatch(installer.url + installer.instructions, /\.exe|Microsoft Store/);
  const message = getWorkbookHelperUnsupportedMessage({ platform: 'MacIntel' });
  for (const text of ['тестовую версию', 'На Mac', 'Скачать', 'Cmd+S', 'загрузить']) assert.ok(message.includes(text));
});

test('Windows install URL stays unchanged and unsupported devices get no installer URL', () => {
  const installer = getWorkbookHelperInstall({ platform: 'Win32' });
  assert.equal(installer.url, '/downloads/IvanEgeWorkbookHelper.exe');
  assert.equal(installer.isDownload, true);
  assert.equal(installer.saveShortcut, 'Ctrl+S');
  for (const device of [{ platform: 'MacIntel', maxTouchPoints: 5 }, { platform: 'iPhone' }, { platform: 'Linux x86_64' }, {}]) {
    assert.equal(getWorkbookHelperInstall(device).url, '');
    assert.equal(getWorkbookHelperInstall(device).supported, false);
  }
  assert.equal(resolveWorkbookHelperInstallUrl('http://example.test/helper.exe'), '');
  assert.equal(resolveWorkbookHelperInstallUrl('/downloads/IvanEgeWorkbookHelper.exe'), '/downloads/IvanEgeWorkbookHelper.exe');
});
