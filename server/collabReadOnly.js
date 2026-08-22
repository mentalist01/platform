import * as decoding from 'lib0/decoding';

const Y_WEBSOCKET_MESSAGE_SYNC = 0;
const Y_SYNC_STEP_1 = 0;

const toUint8Array = (value) => {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
};

// Read-only clients may request the document state (SyncStep1) and exchange
// awareness. SyncStep2 and Update both carry document mutations and are denied.
export const isReadOnlyYWebsocketMessageAllowed = (message) => {
  const bytes = toUint8Array(message);
  if (!bytes || bytes.byteLength === 0) return false;
  try {
    const decoder = decoding.createDecoder(bytes);
    const outerType = decoding.readVarUint(decoder);
    if (outerType !== Y_WEBSOCKET_MESSAGE_SYNC) return true;
    return decoding.readVarUint(decoder) === Y_SYNC_STEP_1;
  } catch {
    return false;
  }
};

export const wrapReadOnlyYWebsocketMessageListener = (listener) => {
  if (typeof listener !== 'function') return null;
  return function readOnlyYWebsocketMessageListener(message, ...args) {
    if (!isReadOnlyYWebsocketMessageAllowed(message)) return undefined;
    return listener.call(this, message, ...args);
  };
};

export const installReadOnlyYWebsocketMessageFilter = (socket, previousListeners = []) => {
  if (
    !socket
    || typeof socket.listeners !== 'function'
    || typeof socket.off !== 'function'
    || typeof socket.on !== 'function'
  ) return 0;
  const previous = previousListeners instanceof Set
    ? previousListeners
    : new Set(Array.isArray(previousListeners) ? previousListeners : []);
  const addedListeners = socket.listeners('message').filter((listener) => !previous.has(listener));
  addedListeners.forEach((listener) => {
    socket.off('message', listener);
    const wrapped = wrapReadOnlyYWebsocketMessageListener(listener);
    if (wrapped) socket.on('message', wrapped);
  });
  return addedListeners.length;
};
