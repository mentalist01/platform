import { LESSON_ALARM_PREFS_PREFIX } from './lessonAlarm.js';

// A cutoff also covers a ringing tab whose calendar has not loaded yet. Alarm
// ids alone cannot do that. Keep the value monotonic across delayed responses.
export function createLessonAlarmDismissal({
  teacherId, storage, events, channel, now = Date.now,
  loadRemote, stopRemote, onStop = () => {}, onChange = () => {},
}) {
  const key = `${LESSON_ALARM_PREFS_PREFIX}stopped:${teacherId}`;
  let stoppedAtMs = 0;
  let disposed = false;
  const validTime = value => Number.isFinite(value) && value > 0 && value <= now() + 60_000;
  const readStored = () => {
    try { return JSON.parse(storage?.getItem(key) || 'null')?.stoppedAtMs; }
    catch { return 0; }
  };
  const stored = readStored();
  if (validTime(stored)) stoppedAtMs = stored;
  const receive = (value, persist = true) => {
    if (disposed || !validTime(value) || value <= stoppedAtMs) return false;
    stoppedAtMs = value;
    // Stop the audio nodes immediately, including a sound test. Reconciliation
    // below can retain future alarms, but must not leave the current sound on.
    onStop();
    if (persist) {
      try { storage?.setItem(key, JSON.stringify({ stoppedAtMs })); } catch { /* channel/server still work */ }
    }
    onChange();
    return true;
  };
  const onStorage = event => { if (event.key === key) receive(readStored(), false); };
  const onMessage = event => {
    if (event.data?.type !== 'dismissed') return;
    // The channel is teacher-scoped; accept legacy tabs without a timestamp.
    receive(event.data.stoppedAtMs ?? now());
  };
  events?.addEventListener('storage', onStorage);
  channel?.addEventListener('message', onMessage);
  return {
    isDismissed: alarm => alarm.dueMs <= stoppedAtMs,
    refresh: async () => {
      const state = await loadRemote?.();
      receive(state?.stoppedAtMs);
    },
    receiveEvent: event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return false; }
      if (data?.scope !== 'lesson-alarm' || data.teacherId !== teacherId) return false;
      receive(data.alarm?.stoppedAtMs);
      return true;
    },
    stop: async () => {
      const at = now();
      // Always stop locally, even for two clicks within the same millisecond.
      if (!receive(at)) onStop();
      try { channel?.postMessage({ type: 'dismissed', stoppedAtMs: at }); } catch { /* storage/server still work */ }
      const state = await stopRemote?.(at);
      receive(state?.stoppedAtMs);
    },
    dispose: () => {
      disposed = true;
      events?.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onMessage);
    },
  };
}
