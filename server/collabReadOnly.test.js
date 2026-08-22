import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  installReadOnlyYWebsocketMessageFilter,
  isReadOnlyYWebsocketMessageAllowed,
  wrapReadOnlyYWebsocketMessageListener,
} from './collabReadOnly.js';

test('completed document filter permits state requests and awareness but blocks Yjs mutations', () => {
  assert.equal(isReadOnlyYWebsocketMessageAllowed(Uint8Array.of(0, 0, 0)), true, 'SyncStep1');
  assert.equal(isReadOnlyYWebsocketMessageAllowed(Buffer.from([1, 0])), true, 'awareness');
  assert.equal(isReadOnlyYWebsocketMessageAllowed(Uint8Array.of(0, 1, 0)), false, 'SyncStep2');
  assert.equal(isReadOnlyYWebsocketMessageAllowed(Uint8Array.of(0, 2, 0)), false, 'Update');
  assert.equal(isReadOnlyYWebsocketMessageAllowed(Uint8Array.of(0, 3, 0)), false, 'unknown sync subtype');
  assert.equal(isReadOnlyYWebsocketMessageAllowed(new Uint8Array()), false, 'malformed empty message');
});

test('filter installation wraps only listeners added by y-websocket setup', () => {
  const socket = new EventEmitter();
  let unrelatedCalls = 0;
  let yjsCalls = 0;
  socket.on('message', () => { unrelatedCalls += 1; });
  const previousListeners = new Set(socket.listeners('message'));
  socket.on('message', () => { yjsCalls += 1; });

  assert.equal(installReadOnlyYWebsocketMessageFilter(socket, previousListeners), 1);
  socket.emit('message', Uint8Array.of(0, 2, 0), true);
  assert.equal(unrelatedCalls, 1);
  assert.equal(yjsCalls, 0);
  socket.emit('message', Uint8Array.of(0, 0, 0), true);
  assert.equal(unrelatedCalls, 2);
  assert.equal(yjsCalls, 1);
});

test('read-only wrapper never invokes the Yjs listener for an update', () => {
  const received = [];
  const context = { name: 'socket' };
  const wrapped = wrapReadOnlyYWebsocketMessageListener(function listener(message, isBinary) {
    received.push({ context: this, message: Array.from(message), isBinary });
  });
  wrapped.call(context, Uint8Array.of(0, 2, 0), true);
  wrapped.call(context, Uint8Array.of(0, 0, 0), true);
  assert.deepEqual(received, [{
    context,
    message: [0, 0, 0],
    isBinary: true,
  }]);
});
