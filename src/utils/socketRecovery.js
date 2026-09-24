// A dead TCP connection can stay CLOSING for minutes after a VPN switch.
// Retire it locally before reconnecting; late events must not affect its replacement.
export const retireWebSocket = (socket, reason = 'Connection timeout') => {
  if (!socket) return;
  const onClose = socket.onclose;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  try {
    // Browsers only allow 1000 or application codes 3000–4999 here.
    socket.close(4000, reason);
  } catch { /* Recovery must not depend on the closing handshake. */ }
  onClose?.();
};

// NetworkInformation.change is only a hint (it also fires on speed changes).
// Probe first, so a healthy call is never restarted just because of that event.
export const subscribeNetworkRecovery = (listener, {
  target = globalThis.window,
  connection = globalThis.navigator?.connection,
} = {}) => {
  target?.addEventListener?.('online', listener);
  connection?.addEventListener?.('change', listener);
  return () => {
    target?.removeEventListener?.('online', listener);
    connection?.removeEventListener?.('change', listener);
  };
};

export const probeWebSocket = (socket, {
  timeoutMs = 4000,
  onTimeout = () => retireWebSocket(socket, 'Network changed'),
} = {}) => {
  if (!socket || socket.readyState !== 1) return () => {};
  let timer;
  const stop = () => {
    clearTimeout(timer);
    socket.removeEventListener('message', onMessage);
    socket.removeEventListener('close', stop);
  };
  const onMessage = (event) => {
    try {
      if (JSON.parse(event.data)?.type === 'pong') stop();
    } catch { /* Other messages are handled by the caller. */ }
  };
  socket.addEventListener('message', onMessage);
  socket.addEventListener('close', stop);
  timer = setTimeout(() => { stop(); onTimeout(); }, timeoutMs);
  try { socket.send(JSON.stringify({ type: 'ping' })); } catch {
    stop();
    onTimeout();
  }
  return stop;
};
