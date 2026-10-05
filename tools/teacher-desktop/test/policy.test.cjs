'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const policy = require('../policy.cjs');
test('browser compatibility preserves the real Chromium version without application tokens', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ivan100-teacher/0.1.1 Chrome/152.0.7977.130 Electron/44.5.1 Safari/537.36';
  assert.equal(policy.browserUserAgent(ua), 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36');
});
test('only downloads initiated by the platform can reach local disk', () => {
  assert.equal(policy.canDownload('https://ivan100.ru/', 'https://ivan100.ru'), true);
  for (const origin of ['https://rutube.ru', '', 'file://', 'https://ivan100.ru.evil.example']) assert.equal(policy.canDownload('https://ivan100.ru/', origin), false);
});
test('only the platform and the exact recorder origin stay inside the application', () => {
  assert.equal(policy.classifyNavigation('https://ivan100.ru/?view=recording'), 'platform');
  assert.equal(policy.classifyNavigation('http://127.0.0.1:18765/archive'), 'recorder');
  assert.equal(policy.classifyNavigation('http://localhost:18765/#setup'), 'recorder');
  assert.equal(policy.classifyNavigation('https://rutube.ru/video/123'), 'external');
  for (const url of ['file:///C:/Windows/System32/cmd.exe', 'javascript:alert(1)', 'powershell:foo', 'http://127.0.0.1:9999/', 'http://localhost:1234/', 'http://10.0.0.1', 'http://[::1]', 'https://user:password@ivan100.ru/']) assert.equal(policy.classifyNavigation(url), 'blocked', url);
  for (const url of ['https://ivan100.ru.evil.example/', 'https://evil.example/ivan100.ru', 'https://ivan100.ru:9000/', 'http://ivan100.ru/']) assert.equal(policy.isPlatform(url), false, url);
});
test('camera and microphone cannot be requested by embeds or redirected windows', () => {
  assert.equal(policy.canRequestPermission('https://ivan100.ru/', 'https://ivan100.ru/?meeting=a', true), true);
  for (const args of [ ['https://ivan100.ru/', 'https://rutube.ru/', false], ['https://ivan100.ru/', 'https://ivan100.ru/', false], ['https://evil.example/', 'https://ivan100.ru/', true], ['https://ivan100.ru/', 'https://ivan100.ru.evil.example/', true], ['https://ivan100.ru/', undefined, true] ]) assert.equal(policy.canRequestPermission(...args), false);
});
test('only the actual bundled UI receives privileged application actions', () => {
  const filename = path.resolve(__dirname, '../ui/shell.html');
  assert.equal(policy.isLocalPage(pathToFileURL(filename).href, filename), true);
  assert.equal(policy.isLocalPage('https://ivan100.ru/', filename), false);
  assert.equal(policy.isLocalPage(pathToFileURL(path.resolve(__dirname, '../ui/sharing.html')).href, filename), false);
});
test('Windows downloads retain extensions without paths or reserved device names', () => {
  assert.equal(policy.safeDownloadName('../../my:lesson?.mp4'), 'my_lesson_.mp4');
  assert.equal(policy.safeDownloadName('C:\\private\\report.pdf'), 'report.pdf');
  assert.equal(policy.safeDownloadName('CON.txt'), 'Файл-CON.txt');
  assert.equal(policy.safeDownloadName('..'), 'Файл-скачивание');
});
test('workbook helper accepts only the platform open action with a single scoped ticket', () => {
  const valid = 'ivan-ege://workbook/open?origin=https%3A%2F%2Fivan100.ru&ticket=0123456789abcdef';
  assert.equal(policy.isWorkbookHelper(valid), true);
  assert.equal(policy.classifyNavigation(valid), 'workbook-helper');
  for (const url of [valid.replace('workbook/open', 'workbook/delete'), valid.replace('ivan100.ru', 'evil.example'), valid.replace('ivan100.ru', 'ivan100.ru%2Fuploads%2Ffile'), valid.replace('0123456789abcdef', 'short'), valid + '&ticket=secondvalidticket', valid + '&origin=https%3A%2F%2Fivan100.ru', valid + '#x', valid.replace('://workbook', '://user@workbook'), valid.replace('0123456789abcdef', '%22%26start%20calc.exe')]) {
    assert.equal(policy.isWorkbookHelper(url), false, url); assert.equal(policy.classifyNavigation(url), 'blocked', url);
  }
});
test('screen sharing uses the chosen source and never starts computer audio by default', () => {
  const frame = {}; frame.top = frame;
  const sources = [{ id: 'window:1', name: 'Writer' }, { id: 'screen:1', name: 'Screen 1' }];
  const request = { frame, videoRequested: true, audioRequested: true };
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'window:1', request, withAudio: false }), { video: sources[0] });
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'screen:1', request, withAudio: true }), { video: sources[1], audio: 'loopback' });
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'platform-tab', request, withAudio: true }), { video: frame, audio: frame });
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'window:unknown', request, withAudio: true }), {});
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'window:1', request: { ...request, audioRequested: false }, withAudio: true }), { video: sources[0] });
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'window:1', request: { ...request, frame: { top: frame } } }), {});
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'window:1', request: { ...request, frame: null } }), {});
  const closedFrame = {}; Object.defineProperty(closedFrame, 'top', { get() { throw new Error('Frame was disposed'); } });
  assert.deepEqual(policy.sharingResult({ sources, sourceId: 'window:1', request: { ...request, frame: closedFrame } }), {});
});
