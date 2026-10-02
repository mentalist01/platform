'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { TeacherAppUpdates, recorderBusy } = require('../updates.cjs');

function fixture({ busy = false, enabled = true } = {}) {
  const updater = new EventEmitter();
  const state = { checks: 0, downloads: 0, quits: 0, prevents: 0, reports: [] };
  updater.checkForUpdates = async () => { state.checks++; updater.emit('checking-for-update'); updater.emit('update-available', { version: '0.1.3' }); };
  updater.downloadUpdate = async () => { state.downloads++; updater.emit('download-progress', { percent: 27.9 }); updater.emit('update-downloaded', { version: '0.1.3' }); };
  const app = { isPackaged: enabled, quit: () => state.quits++ };
  const controller = new TeacherAppUpdates({ updater, app, report: update => state.reports.push({ ...update }), isBusy: async () => typeof busy === 'function' ? busy() : busy });
  const event = { preventDefault: () => state.prevents++ };
  return { updater, controller, state, event };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('automatic download never quits or restarts a working application', async () => {
  const { controller, updater, state } = fixture();
  await controller.check();
  assert.equal(state.checks, 1); assert.equal(state.downloads, 1); assert.equal(state.quits, 0);
  assert.deepEqual(controller.state, { status: 'ready', version: '0.1.3', percent: 100 });
  assert.equal(updater.allowDowngrade, false); assert.equal(updater.disableWebInstaller, true);
  assert.ok(state.reports.some(update => update.status === 'downloading' && update.percent === 28));
  await controller.check(); assert.equal(state.checks, 1);
});
test('a recording defers download until the helper is idle', async () => {
  let busy = true;
  const { controller, state } = fixture({ busy: () => busy });
  await controller.check(); assert.equal(controller.state.status, 'waiting'); assert.equal(state.downloads, 0);
  busy = false; await controller.downloadWhenIdle();
  assert.equal(state.downloads, 1); assert.equal(controller.state.status, 'ready'); assert.equal(state.quits, 0);
});
test('normal user quit installs silently only after a fresh idle check', async () => {
  const { controller, updater, state, event } = fixture();
  await controller.check();
  assert.equal(controller.deferQuit(event), true); assert.equal(state.prevents, 1);
  await settle();
  assert.equal(state.quits, 1); assert.equal(updater.autoInstallOnAppQuit, true); assert.equal(updater.autoRunAppAfterInstall, false);
  assert.equal(controller.deferQuit(event), false);
});
test('a new recording starting after download defers installation without preventing exit', async () => {
  let busy = false;
  const { controller, updater, state, event } = fixture({ busy: () => busy });
  await controller.check(); busy = true; controller.deferQuit(event); await settle();
  assert.equal(state.quits, 1); assert.equal(updater.autoInstallOnAppQuit, false); assert.equal(controller.state.status, 'ready');
});
test('unknown helper state and Windows shutdown cannot install an update', async () => {
  const f = fixture(); await f.controller.check();
  f.controller.isBusy = async () => { throw new Error('timeout'); };
  f.controller.deferQuit(f.event); await settle(); assert.equal(f.updater.autoInstallOnAppQuit, false); assert.equal(f.state.quits, 1);
  const shutdown = fixture(); await shutdown.controller.check(); shutdown.controller.onSessionEnd();
  assert.equal(shutdown.controller.deferQuit(shutdown.event), false); assert.equal(shutdown.updater.autoInstallOnAppQuit, false);
});
test('a late download cannot install after shutdown has already started', () => {
  const { controller, updater, event } = fixture();
  assert.equal(controller.deferQuit(event), false);
  updater.emit('update-downloaded', { version: '0.1.3' });
  assert.equal(updater.autoInstallOnAppQuit, false);
});
test('network failures preserve the running version and allow retry', async () => {
  const f = fixture(); f.updater.checkForUpdates = async () => { throw new Error('network'); };
  await f.controller.check(); assert.equal(f.controller.state.status, 'error'); assert.equal(f.state.quits, 0);
  f.updater.checkForUpdates = async () => f.updater.emit('update-not-available');
  await f.controller.check(); assert.equal(f.controller.state.status, 'current');
});
test('simultaneous update checks and downloads are coalesced', async () => {
  const f = fixture(); let release;
  f.updater.checkForUpdates = async () => { f.state.checks++; await new Promise(resolve => { release = resolve; }); f.updater.emit('update-available', { version: '0.1.3' }); };
  const first = f.controller.check(); await f.controller.check(); release(); await first;
  assert.equal(f.state.checks, 1); assert.equal(f.state.downloads, 1);
});
test('development mode never downloads real releases', async () => {
  const f = fixture({ enabled: false }); f.controller.start(); await f.controller.check();
  assert.equal(f.state.checks, 0); assert.equal(f.controller.state.status, 'development'); f.controller.stop();
});
test('active, paused, starting, stopping and uploading recordings all block installation', () => {
  const idle = { jobs: [], obs: { outputActive: false } };
  assert.equal(recorderBusy(idle), false);
  for (const status of ['starting', 'recording', 'stopping']) assert.equal(recorderBusy({ ...idle, jobs: [{ status }] }), true);
  for (const value of [{ obs: { outputActive: true, outputPaused: true } }, { uploadingId: 'upload' }, { preparingUpload: true }, { updater: { busy: true } }]) assert.equal(recorderBusy({ ...idle, ...value }), true);
  assert.throws(() => recorderBusy({ error: 'offline' }));
});
