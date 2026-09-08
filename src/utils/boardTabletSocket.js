export const connectBoardTablet = ({ url, credentials, onMessage, onState }) => {
  let socket;
  let retry;
  let stopped = false;
  let ready = false;
  let lastMessageAt = Date.now();
  const send = (message) => {
    if (!ready || socket?.readyState !== 1 || socket.bufferedAmount > 1_500_000) return false;
    socket.send(JSON.stringify(message));
    return true;
  };
  const connect = () => {
    if (stopped) return;
    onState('connecting');
    socket = new WebSocket(url);
    socket.onopen = () => {
      lastMessageAt = Date.now();
      socket.send(JSON.stringify({ type: 'join', ...credentials }));
    };
    socket.onmessage = (event) => {
      lastMessageAt = Date.now();
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'ended') {
        stopped = true;
        ready = false;
        onState('ended');
      }
      if (message.type === 'ready') { ready = true; onState('connected'); }
      onMessage(message);
    };
    socket.onclose = (event) => {
      ready = false;
      if (event.code === 1008 || event.code === 4001) { stopped = true; onState('ended'); }
      if (!stopped) { onState('connecting'); retry = setTimeout(connect, 1500); }
    };
    socket.onerror = () => {}; // onclose owns retry, including failed handshakes.
  };
  connect();
  const heartbeat = setInterval(() => {
    if (ready && Date.now() - lastMessageAt > 25_000) socket.close();
    else send({ type: 'ping' });
  }, 8000);
  return { send, close: () => { stopped = true; clearTimeout(retry); clearInterval(heartbeat); socket?.close(); } };
};
