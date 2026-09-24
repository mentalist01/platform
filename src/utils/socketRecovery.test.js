import test from 'node:test';
import assert from 'node:assert/strict';
import { probeWebSocket, retireWebSocket, subscribeNetworkRecovery } from './socketRecovery.js';

const fakeSocket = () => Object.assign(new EventTarget(), {
  readyState: 1, send() {}, close() {},
});

test('a blackholed close handshake does not block recovery; late close cannot repeat it', () => {
  const socket = fakeSocket();
  let reconnects = 0;
  socket.onclose = () => { reconnects++; };
  socket.onmessage = () => assert.fail('retired socket must not deliver stale messages');
  socket.close = code => assert.equal(code, 4000, 'browser-compatible application close code');
  retireWebSocket(socket);
  assert.equal(reconnects, 1);
  assert.equal(socket.onmessage, null);
  assert.equal(socket.onclose, null);
  retireWebSocket(socket);
  assert.equal(reconnects, 1);
});

test('recovery runs even if the browser throws while closing', () => {
  const socket = fakeSocket();
  let recovered = false;
  socket.close = () => { throw new Error('close failed'); };
  socket.onclose = () => { recovered = true; };
  retireWebSocket(socket);
  assert.ok(recovered);
});

test('network hint leaves a responsive call connected', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = fakeSocket();
  socket.send = message => {
    assert.deepEqual(JSON.parse(message), { type: 'ping' });
    socket.dispatchEvent(new MessageEvent('message', { data: '{"type":"pong"}' }));
  };
  probeWebSocket(socket, { onTimeout: () => assert.fail('healthy call restarted') });
  t.mock.timers.tick(5000);
});

test('network hint retires an unresponsive call once after the probe deadline', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = fakeSocket();
  let reconnects = 0;
  socket.onclose = () => { reconnects++; };
  probeWebSocket(socket);
  socket.dispatchEvent(new MessageEvent('message', { data: '{"type":"other"}' }));
  t.mock.timers.tick(3999);
  assert.equal(reconnects, 0);
  t.mock.timers.tick(1);
  assert.equal(reconnects, 1);
  t.mock.timers.tick(20_000);
  assert.equal(reconnects, 1);
});

test('leaving the call or receiving close cancels a pending recovery probe', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = fakeSocket();
  const options = { onTimeout: () => assert.fail('call restarted after leaving') };
  probeWebSocket(socket, options)();
  probeWebSocket(socket, options);
  socket.dispatchEvent(new Event('close'));
  t.mock.timers.tick(5000);
});

test('network subscriptions clean up on leaving the room', () => {
  const target = new EventTarget();
  const connection = new EventTarget();
  let hints = 0;
  const stop = subscribeNetworkRecovery(() => { hints++; }, { target, connection });
  target.dispatchEvent(new Event('online'));
  connection.dispatchEvent(new Event('change'));
  assert.equal(hints, 2);
  stop();
  target.dispatchEvent(new Event('online'));
  connection.dispatchEvent(new Event('change'));
  assert.equal(hints, 2);
});
