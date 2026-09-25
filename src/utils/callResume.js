export const CALL_RESUME_KEY = 'ege_call_reload_v1';
const MAX_AGE_MS = 2 * 60_000;

export const clearCallResume = (storage = globalThis.sessionStorage) => {
  try { storage?.removeItem(CALL_RESUME_KEY); } catch { /* Storage may be disabled. */ }
};

export const saveCallResume = (call, storage = globalThis.sessionStorage, now = Date.now()) => {
  try { storage?.setItem(CALL_RESUME_KEY, JSON.stringify({ ...call, savedAt: now })); } catch { /* Optional recovery hint. */ }
};

// Session storage scopes recovery to this tab. Only a reload may rejoin:
// a newly opened/copied tab or tomorrow's visit must not activate a microphone.
export const readCallResume = (user, {
  storage = globalThis.sessionStorage,
  navigationType = globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type,
  now = Date.now(),
} = {}) => {
  try {
    const call = JSON.parse(storage?.getItem(CALL_RESUME_KEY) || 'null');
    if (navigationType !== 'reload' || !call || call.userId !== user?.id || call.role !== user?.role) return null;
    if (!['teacher', 'student'].includes(call.role)) return null;
    if (!Number.isFinite(call.savedAt) || now - call.savedAt < 0 || now - call.savedAt > MAX_AGE_MS) return null;
    if (call.role === 'teacher' && call.teacherId !== user.id) return null;
    if (call.role === 'student' && (call.studentId !== user.id || call.teacherId !== user.teacherId)) return null;
    if (!call.teacherId || !call.studentId || call.lessonId) return null;
    if (call.roomId !== `rtc:${call.teacherId}:${call.studentId}`) return null;
    return call;
  } catch { return null; }
};
