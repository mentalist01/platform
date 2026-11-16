// Focus and visibility events can arrive together or repeatedly. Keep one
// outstanding refresh and wait briefly after it settles before background reads.
export function createLessonRefreshGate({
  cooldownMs = 2000,
  now = () => performance.now(),
} = {}) {
  let active = null;
  let requested = null;
  let nextBackgroundAt = -Infinity;

  function refresh(read, { urgent = false } = {}) {
    if (active) {
      if (!urgent) return active;
      // A scheduled opening or an explicit refresh needs data read after the
      // event. Wait for the current read and combine simultaneous requests.
      requested ??= active.catch(() => {}).then(() => {
        requested = null;
        return refresh(read, { urgent: true });
      });
      return requested;
    }
    if (!urgent && now() < nextBackgroundAt) return Promise.resolve();

    active = Promise.resolve().then(read).finally(() => {
      nextBackgroundAt = now() + cooldownMs;
      active = null;
    });
    return active;
  }

  return refresh;
}
