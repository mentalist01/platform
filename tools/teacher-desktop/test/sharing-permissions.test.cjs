'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');

function fixture() {
  const filename = path.resolve(__dirname, '../main.cjs'), realRequire = createRequire(filename);
  let pickerCalls = 0;
  const contents = { id: 1, getURL: () => 'https://ivan100.ru/', isDestroyed: () => false };
  const ses = Object.assign(new EventEmitter(), {
    setUserAgent() {}, setPermissionCheckHandler(fn) { this.check = fn; },
    setPermissionRequestHandler(fn) { this.permission = fn; }, setDisplayMediaRequestHandler(fn) { this.display = fn; },
  });
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false, getVersion: () => 'fixture', getPath: () => __dirname,
    setName() {}, setAppUserModelId() {}, setPath() {}, requestSingleInstanceLock: () => true,
    whenReady: () => ({ then: () => ({ catch() {} }) }), quit() {},
  });
  const context = vm.createContext({ __dirname: path.dirname(filename), console, URL, process: { argv: [], env: {} }, setTimeout,
    require: name => name === 'electron' ? { app, ipcMain: { handle() {}, on() {} }, webContents: { fromFrame: () => contents } } : realRequire(name),
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8') + '\nglobalThis.qa = { configurePlatformSession, ownedWebContents, setPicker: fn => { createSharingPicker = fn; } };', context, { filename });
  context.qa.ownedWebContents.add(1);
  context.qa.setPicker(async (_request, callback) => { pickerCalls++; callback({ selected: true }); });
  context.qa.configurePlatformSession(ses);
  const frame = {}; frame.top = frame;
  return { ses, contents, frame, pickerCalls: () => pickerCalls };
}
test('Chromium empty-media display request reaches the explicit source picker', async () => {
  const f = fixture(); let granted;
  await f.ses.permission(f.contents, 'media', value => { granted = value; }, { requestingUrl: 'https://ivan100.ru/', isMainFrame: true, mediaTypes: [] });
  assert.equal(granted, true);
  let selected;
  f.ses.display({ frame: f.frame, securityOrigin: 'https://ivan100.ru/', videoRequested: true, audioRequested: true, userGesture: true }, value => { selected = value; });
  assert.equal(f.pickerCalls(), 1); assert.equal(selected.selected, true);
});
test('empty-media requests cannot grant access to embeds, foreign pages or unowned windows', async () => {
  const f = fixture();
  for (const [contents, details] of [
    [f.contents, { requestingUrl: 'https://rutube.ru/', isMainFrame: true, mediaTypes: [] }],
    [f.contents, { requestingUrl: 'https://ivan100.ru/', isMainFrame: false, mediaTypes: [] }],
    [{ ...f.contents, id: 2 }, { requestingUrl: 'https://ivan100.ru/', isMainFrame: true, mediaTypes: [] }],
    [f.contents, { requestingUrl: 'https://ivan100.ru/', isMainFrame: true }],
  ]) {
    let granted; await f.ses.permission(contents, 'media', value => { granted = value; }, details); assert.equal(granted, false);
  }
});
test('display capture still requires user action, video and the trusted main frame', () => {
  const f = fixture();
  const valid = { frame: f.frame, securityOrigin: 'https://ivan100.ru/', videoRequested: true, audioRequested: true, userGesture: true };
  for (const patch of [{ userGesture: false }, { videoRequested: false }, { frame: null }, { frame: { top: f.frame } }, { securityOrigin: 'https://evil.example/' }]) {
    let result; f.ses.display({ ...valid, ...patch }, value => { result = value; }); assert.deepEqual(Object.keys(result), []);
  }
  assert.equal(f.pickerCalls(), 0);
});
