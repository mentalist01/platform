// Browser clocks may differ by minutes. Commands use the authenticated API's
// HTTP Date and a monotonic clock, so device time cannot reject a live summon.
export function createBoardCommandClock({ wallNow = Date.now, monotonicNow = () => performance.now() } = {}) {
  let anchor = null;
  return {
    synchronize(dateHeader) {
      const serverDate = Date.parse(dateHeader || '');
      if (!Number.isFinite(serverDate)) return false;
      // HTTP Date has second precision. Use the middle of that second.
      anchor = { serverDate: serverDate + 500, monotonic: monotonicNow() };
      return true;
    },
    now() { return anchor ? anchor.serverDate + Math.max(0, monotonicNow() - anchor.monotonic) : wallNow(); },
  };
}
const clock = createBoardCommandClock();
export const synchronizeBoardCommandClock = value => clock.synchronize(value);
export const boardCommandNow = () => clock.now();

export function createBoardCommandFreshness(monotonicNow = () => performance.now()) {
  const received = new Map();
  return {
    observeLive(command) {
      if (typeof command?.id !== 'string' || !command.id || !Number.isFinite(command.ts)) return;
      const now = monotonicNow();
      // Repeated notifications never renew an old command's lifetime.
      if (!received.has(command.id)) received.set(command.id, now);
      if (received.size > 128) received.delete(received.keys().next().value);
    },
    isFresh(command, wallNow) {
      const at = received.get(command?.id);
      if (at !== undefined) return monotonicNow() - at <= 15000;
      return Number.isFinite(command?.ts) && wallNow - command.ts <= 15000 && command.ts <= wallNow + 5000;
    },
  };
}
const freshness = createBoardCommandFreshness();
export const observeLiveBoardCommand = command => freshness.observeLive(command);
export const isFreshBoardCommand = (command, now) => freshness.isFresh(command, now);
