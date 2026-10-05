'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the app's window and IPC lifecycle without a real call, recorder or OBS.
function fixture() {
  const windows = [], handlers = new Map(), privacyCalls = [], externalCalls = [];
  let nextId = 0;
  class Contents extends EventEmitter {
    constructor() { super(); this.id = ++nextId; this.mainFrame = { url: '' }; }
    isDestroyed() { return false; }
    getURL() { return this.mainFrame.url; }
    setWindowOpenHandler(handler) { this.windowOpen = handler; }
    send() {}
    async loadURL(url) { this.navigationCount = (this.navigationCount || 0) + 1; this.mainFrame.url = url; this.emit('did-finish-load'); }
    focus() { this.owner?.emit('focus'); }
    isCurrentlyAudible() { return true; }
  }
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.webContents = new Contents(); this.webContents.owner = this;
      this.visible = options.show !== false; this.minimized = false;
      this.contentView = { addChildView: view => { view.webContents.owner = this; this.platformView = view; } };
      windows.push(this);
    }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized; }
    isFullScreen() { return false; }
    show() { this.visible = true; }
    showInactive() { this.show(); }
    hide() { this.visible = false; }
    restore() { this.minimized = false; }
    focus() { this.emit('focus'); }
    getContentSize() { return [1440, 960]; }
    getContentBounds() { return { x: 0, y: 0 }; }
    setBounds() {}
    setMenu() {}
    async loadFile(file) { this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href; }
    loadURL(url) { return this.webContents.loadURL(url); }
  }
  class View {
    constructor() { this.webContents = new Contents(); }
    setBounds() {}
    setBackgroundColor() {}
    setVisible() {}
  }
  const ses = () => Object.assign(new EventEmitter(), {
    setUserAgent() {}, setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, setDisplayMediaRequestHandler() {},
  });
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true, getVersion: () => '0.1.5', getPath: () => path.join(__dirname, 'nonexistent-fixture-profile'),
    setName() {}, setAppUserModelId() {}, setPath() {}, requestSingleInstanceLock: () => true,
    whenReady: () => ({ then: () => ({ catch() {} }) }), quit() {},
  });
  const filename = path.resolve(__dirname, '../main.cjs'), realRequire = createRequire(filename);
  const electron = { app, BrowserWindow: Window, WebContentsView: View, session: { fromPartition: ses },
    shell: { openExternal: async url => { externalCalls.push(url); } },
    Menu: { buildFromTemplate: () => ({}), setApplicationMenu() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} },
  };
  const context = vm.createContext({ __dirname: path.dirname(filename), process: { argv: [], env: {} }, console, URL, setTimeout,
    require: name => {
      if (name === 'electron') return electron;
      if (name === 'electron-updater') return { autoUpdater: {} };
      if (name === 'node:http') return { get: (_url, done) => {
        done({ statusCode: 200, resume() {} }); return { setTimeout() {}, on() {} };
      } };
      if (name === './downloads.cjs') return { ...realRequire(name), Downloads: class { list() { return []; } } };
      if (name === './credentials.cjs') return { TeacherCredentials: class {} };
      if (name === './updates.cjs') return { TeacherAppUpdates: class { start() {} } };
      if (name === './recording-privacy.cjs') return { RecordingPrivacy: class {
        async set(reason, hidden) { privacyCalls.push([reason, hidden]); }
      } };
      return realRequire(name);
    },
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8') + '\nglobalThis.lifecycle = { start, openRecorder };', context, { filename });
  return { ...context.lifecycle, windows, handlers, privacyCalls, externalCalls };
}

test('recorder remains open beside the call without masking OBS or navigating the cabinet', async () => {
  const f = fixture(); await f.start();
  const main = f.windows[0];
  if (!main.platformView.webContents.getURL()) await once(main.platformView.webContents, 'did-finish-load');
  const callUrl = main.platformView.webContents.getURL();
  const navigations = main.platformView.webContents.navigationCount;
  f.privacyCalls.length = 0;
  await f.openRecorder('/');
  const recorder = f.windows.find(window => window.options.title === 'IVAN100 — Пульт записи');
  assert.ok(recorder.visible);
  assert.equal(recorder.options.parent, undefined);
  main.focus();
  await f.handlers.get('shell:action')({ sender: main.webContents, senderFrame: main.webContents.mainFrame }, 'cabinet');
  assert.ok(recorder.visible);
  assert.equal(recorder.isMinimized(), false);
  assert.equal(main.platformView.webContents.getURL(), callUrl);
  assert.equal(main.platformView.webContents.navigationCount, navigations);
  assert.deepEqual(f.privacyCalls, []);
  await f.openRecorder('/archive');
  assert.equal(f.windows.filter(window => window.options.title === 'IVAN100 — Пульт записи').length, 1);
  assert.ok(recorder.visible);
  assert.deepEqual(f.privacyCalls, []);
});

test('workbook launch reaches the installed helper while the cabinet stays open', async () => {
  const f = fixture(); await f.start();
  const contents = f.windows[0].platformView.webContents;
  if (!contents.getURL()) await once(contents, 'did-finish-load');
  const platformUrl = contents.getURL();
  const uri = 'ivan-ege://workbook/open?origin=https%3A%2F%2Fivan100.ru&ticket=fixture-ticket-123456';
  const event = { url: uri, isMainFrame: true, preventDefault() { this.prevented = true; } };
  contents.emit('will-frame-navigate', event);
  assert.equal(event.prevented, true);
  assert.deepEqual(f.externalCalls, [uri]);
  assert.equal(contents.getURL(), platformUrl);
  contents.mainFrame.url = 'https://rutube.ru/';
  contents.emit('will-frame-navigate', { ...event, prevented: false });
  contents.windowOpen({ url: uri, referrer: { url: platformUrl } });
  assert.deepEqual(f.externalCalls, [uri], 'foreign pages cannot launch the native helper');
});
