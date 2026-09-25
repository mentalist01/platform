export const getRtcPeerConnectionState = (pc) => {
  const state = pc?.connectionState;
  const ice = pc?.iceConnectionState;
  if (state === 'closed' || ice === 'closed') return 'closed';
  if (state === 'failed' || ice === 'failed') return 'failed';
  if (state === 'disconnected' || ice === 'disconnected') return 'disconnected';
  // Some browsers report ICE loss before updating the aggregate state.
  if (ice === 'checking') return 'connecting';
  if (state) return state;
  if (ice === 'connected' || ice === 'completed') return 'connected';
  return 'new';
};

// A dead WebSocket can remain in the server roster until its heartbeat expires.
// Never negotiate with our own old socket or let its late messages replace a
// newer connection from the same authenticated participant.
export const reconcileRtcPeer = ({ id, peer, self, peers }) => {
  const identity = value => value?.userId && value?.role ? `${value.role}:${value.userId}` : '';
  const incoming = identity(peer);
  if (incoming && incoming === identity(self)) return { ignore: true, replace: [] };
  const replace = [];
  for (const [otherId, other] of peers) {
    if (otherId === id || !incoming || incoming !== identity(other)) continue;
    const time = Number(peer.joinedAt) || 0;
    const otherTime = Number(other.joinedAt) || 0;
    if (!time || !otherTime) continue;
    if (otherTime >= time) return { ignore: true, replace: [] };
    replace.push(otherId);
  }
  return { ignore: false, replace };
};

// Signalling can remain healthy while VPN switching breaks only the media route.
// Renegotiate fresh ICE candidates; if negotiation itself is stuck, rejoin.
export const createPeerRecovery = ({ pc, restartIce, reconnect,
  graceMs = 3000, retryMs = 10_000,
}) => {
  let timer = null;
  let attempts = 0;
  let disposed = false;
  let generation = 0;
  const clear = () => { clearTimeout(timer); timer = null; };
  const recover = () => {
    timer = null;
    if (disposed) return;
    const state = getRtcPeerConnectionState(pc);
    if (state === 'connected' || state === 'closed') return;
    if (++attempts > 2) { reconnect(); return; }
    const currentGeneration = generation;
    // Keep the watchdog running even when a browser SDP operation hangs.
    timer = setTimeout(recover, retryMs);
    Promise.resolve().then(() => {
      if (!disposed && currentGeneration === generation) return restartIce();
    }).catch(() => { /* Watchdog retries or rejoins. */ });
  };
  return {
    update() {
      if (disposed) return;
      const state = getRtcPeerConnectionState(pc);
      if (state === 'connected' || state === 'closed') {
        clear(); attempts = 0; generation++;
      } else if (!timer && state !== 'new') {
        timer = setTimeout(recover, state === 'failed' ? 0 : state === 'connecting' ? retryMs : graceMs);
      }
    },
    dispose() { disposed = true; generation++; clear(); },
  };
};
