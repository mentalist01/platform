export const ACHIEVEMENT_TOAST_DURATION = 6500;
export const ACHIEVEMENT_TOAST_EXIT = 260;

// One clock drives dismissal; hover, keyboard focus and visibility can overlap.
export function createAchievementToastLifetime({
  onExit, onDismiss, duration = ACHIEVEMENT_TOAST_DURATION,
  exitDuration = ACHIEVEMENT_TOAST_EXIT, now = () => performance.now(),
  schedule = setTimeout, cancel = clearTimeout,
}) {
  const pauses = new Set();
  let remaining = duration, startedAt = now(), timer, exitTimer, leaving = false, disposed = false;
  const dismiss = () => {
    if (disposed || leaving) return;
    leaving = true;
    cancel(timer);
    onExit();
    if (!disposed) exitTimer = schedule(() => { if (!disposed) onDismiss(); }, exitDuration);
  };
  const start = () => { startedAt = now(); timer = schedule(dismiss, remaining); };
  start();
  return {
    dismiss,
    pause(reason) {
      if (disposed || leaving || pauses.has(reason)) return;
      if (!pauses.size) { remaining = Math.max(0, remaining - (now() - startedAt)); cancel(timer); }
      pauses.add(reason);
    },
    resume(reason) {
      if (disposed || leaving || !pauses.delete(reason)) return;
      if (!pauses.size) start();
    },
    isPaused: () => pauses.size > 0,
    dispose() { disposed = true; cancel(timer); cancel(exitTimer); },
  };
}
