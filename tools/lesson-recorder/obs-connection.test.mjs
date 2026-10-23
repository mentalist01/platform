import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ObsClient } from './obs.mjs';

const fixture = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-connection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'plugin_config/obs-websocket'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugin_config/obs-websocket/config.json'), JSON.stringify({ server_enabled: true }));
  const sockets = [];
  class Socket extends EventTarget {
    readyState = 1;
    constructor() { super(); sockets.push(this); queueMicrotask(() => this.receive({ op: 0, d: {} })); }
    receive(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
    send(value) {
      const { op, d } = JSON.parse(value);
      if (op === 1) queueMicrotask(() => this.receive({ op: 2, d: {} }));
      if (op === 6) this.request = d;
    }
    respond(responseData = { outputActive: true }) { this.receive({ op: 7, d: { requestId: this.request.requestId, requestStatus: { result: true }, responseData } }); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const obs = new ObsClient({ configDir: root, webSocketClass: Socket });
  t.after(() => sockets.forEach(socket => socket.close()));
  return { obs, sockets };
};

test('a stale socket close cannot disconnect a new OBS connection or reject its requests', async t => {
  const { obs, sockets } = fixture(t);
  await obs.connect(); const old = sockets[0];
  old.readyState = 3; obs.connected = false;
  await obs.connect();
  const current = sockets[1], request = obs.call('GetRecordStatus');
  await Promise.resolve();
  old.close();
  assert.equal(obs.connected, true); assert.equal(obs.pending.size, 1);
  current.respond();
  assert.equal((await request).outputActive, true);
});

test('a closed current OBS socket reports a retryable transport failure and reconnects cleanly', async t => {
  const { obs, sockets } = fixture(t);
  await obs.connect();
  const request = obs.call('GetRecordStatus'); await Promise.resolve();
  sockets[0].close();
  await assert.rejects(request, error => error.obsTransport === true && /OBS отключился/.test(error.message));
  assert.equal(obs.pending.size, 0);
  await obs.connect(); assert.equal(obs.connected, true); assert.equal(sockets.length, 2);
});

test('OBS output events retain the pending-start guard until an actual output transition', async t => {
  const { obs, sockets } = fixture(t); await obs.connect();
  const event = outputState => sockets[0].receive({ op: 5, d: { eventType: 'RecordStateChanged', eventData: { outputState } } });
  event('OBS_WEBSOCKET_OUTPUT_STARTING');
  assert.throws(() => obs.assertNoPendingStart(), /повторная команда/);
  event('OBS_WEBSOCKET_OUTPUT_STARTED'); obs.assertNoPendingStart();
  event('OBS_WEBSOCKET_OUTPUT_STARTING'); event('OBS_WEBSOCKET_OUTPUT_STOPPED'); obs.assertNoPendingStart();
});

test('camera discovery refreshes after a real OBS reconnection and ignores stale socket closure', async t => {
  const { obs, sockets } = fixture(t); await obs.connect();
  const old = sockets[0], first = obs.cameraChoices(); await Promise.resolve();
  old.respond({ propertyItems: [{ itemValue: 'old-camera' }] });
  assert.equal((await first)[0].itemValue, 'old-camera');
  old.close(); await obs.connect();
  const second = obs.cameraChoices(); await Promise.resolve();
  sockets[1].respond({ propertyItems: [{ itemValue: 'new-camera' }] });
  assert.equal((await second)[0].itemValue, 'new-camera');
  old.close();
  assert.equal((await obs.cameraChoices())[0].itemValue, 'new-camera');
});
