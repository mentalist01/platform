// A click must survive a temporary page-channel reconnect. Keep only the latest
// requested position and never send it to a different board after navigation.
export function createBoardSummonDelivery({ isReady, send, onState, now = Date.now }) {
  let pending = null;
  let current = null;
  let disposed = false;
  const report = (phase, extra = {}) => {
    if (!disposed) onState({ phase, id: current?.command.id || pending?.command.id || '', ...extra });
  };
  const flush = () => {
    if (disposed || !pending) return false;
    if (now() - pending.requestedAt > 30_000) {
      pending = null;
      report('expired');
      return false;
    }
    if (!isReady()) return false;
    current = { ...pending, command: { ...pending.command, ts: now() }, sentAt: now(), acknowledged: new Set() };
    pending = null;
    // The sender may synchronously trigger Yjs observers; establish current first.
    try {
      send(current.command);
    } catch {
      pending = { command: current.command, targetIds: current.targetIds, requestedAt: current.requestedAt };
      current = null;
      report('queued');
      return false;
    }
    report(current.targetIds.length ? 'waiting' : 'sent', { remaining: current.targetIds.length });
    return true;
  };
  return {
    request(command, targetIds = []) {
      if (disposed) return;
      current = null;
      pending = { command, targetIds: [...new Set(targetIds.filter(Boolean))], requestedAt: now() };
      report('queued');
      flush();
    },
    flush,
    acknowledge(userId, commandId) {
      if (disposed || !current || commandId !== current.command.id || !current.targetIds.includes(userId)) return;
      if (current.acknowledged.has(userId)) return;
      current.acknowledged.add(userId);
      const remaining = current.targetIds.length - current.acknowledged.size;
      report(remaining ? 'waiting' : 'confirmed', { remaining, elapsedMs: Math.max(0, now() - current.sentAt) });
    },
    timeout() {
      if (pending) {
        pending = null;
        report('expired');
      } else if (current && current.acknowledged.size < current.targetIds.length) {
        report('unconfirmed');
      }
    },
    cancel() { pending = null; current = null; report('idle'); },
    dispose() { disposed = true; pending = null; current = null; },
  };
}
