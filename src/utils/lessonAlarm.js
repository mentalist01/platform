import { isTeacherCalendarLessonCancelled } from './teacherCalendarCancellation.js';

export const LESSON_ALARM_LEAD_MS = 5 * 60_000;
export const LESSON_ALARM_PREFS_PREFIX = 'lesson-alarm-v2:';
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const RU_DAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Match the calendar's local wall time, including recurring slots and cancellations.
export function buildLessonAlarms(entries = [], teacherId, marks = {}, now = Date.now()) {
  const grouped = new Map();
  for (const entry of entries) {
    const match = String(entry?.time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) continue;
    const weekday = WEEKDAYS.indexOf(String(entry.weekdayKey || '').toLowerCase());
    const ruDay = RU_DAYS.indexOf(String(entry.day || '').toLowerCase());
    const order = weekday >= 0 ? weekday + 1 : (ruDay >= 0 ? ruDay + 1 : Number(entry.weekdayOrder));
    for (let offset = 0; offset <= 1; offset += 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      const key = dayKey(date);
      if (entry.date ? entry.date !== key : (date.getDay() || 7) !== order) continue;
      if ((entry.excludedDates || []).includes(key) || isTeacherCalendarLessonCancelled(teacherId, entry, key, marks)) continue;
      date.setHours(Number(match[1]), Number(match[2]), 0, 0);
      const startMs = date.getTime();
      if (startMs <= now || startMs > now + 24 * 60 * 60_000) continue;
      const id = `${teacherId}:${startMs}`;
      const title = String(entry.groupName || entry.studentName || entry.subject || 'Занятие');
      const previous = grouped.get(id);
      grouped.set(id, {
        id, startMs, dueMs: startMs - LESSON_ALARM_LEAD_MS,
        title: previous && previous.title !== title ? `${previous.title}, ${title}` : title,
      });
    }
  }
  return [...grouped.values()].sort((a, b) => a.startMs - b.startMs);
}

export const getRingingLessonAlarms = (alarms = [], now = Date.now()) => (
  (Array.isArray(alarms) ? alarms : []).filter((alarm) => alarm.dueMs <= now && alarm.startMs > now)
);

// A repeating, softly enveloped chime is generated locally: no missing URL,
// network request or codec dependency can silence the default alarm.
export function createDefaultAlarmBuffer(context) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, rate * 4, rate);
  const samples = buffer.getChannelData(0);
  for (const [offset, frequency] of [[0, 523.25], [.35, 659.25], [.7, 783.99], [1.2, 659.25]]) {
    const length = .65;
    for (let index = 0; index < rate * length; index += 1) {
      const t = index / rate;
      const envelope = Math.min(1, t / .025) * Math.pow(1 - t / length, 2);
      samples[Math.floor(offset * rate) + index] += .23 * envelope * (
        Math.sin(2 * Math.PI * frequency * t) + .18 * Math.sin(4 * Math.PI * frequency * t)
      );
    }
  }
  return buffer;
}

export function createLessonAlarmPlayer({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), onState = () => {} } = {}) {
  let context;
  let buffer;
  let customBuffer;
  let disposed = false;
  const scheduled = new Map();
  const getContext = () => {
    if (disposed) return null;
    if (!context) {
      context = createContext();
      context.onstatechange = () => onState(context.state);
      buffer = createDefaultAlarmBuffer(context);
    }
    return context;
  };
  const stop = (id) => {
    const item = scheduled.get(id);
    if (!item) return;
    item.source.onended = null;
    try { item.source.stop(); } catch { /* already ended */ }
    item.source.disconnect();
    item.gain.disconnect();
    scheduled.delete(id);
  };
  const stopAll = () => { [...scheduled.keys()].forEach(stop); };
  const stopScheduled = () => { [...scheduled.keys()].filter((id) => id !== 'test').forEach(stop); };
  const unlock = () => {
    const audio = getContext();
    // resume is invoked synchronously from the trusted input event.
    return audio.resume().then(() => { onState(audio.state); return audio.state === 'running'; });
  };
  const schedule = (alarms, now = Date.now()) => {
    const audio = getContext();
    if (audio.state !== 'running') return false;
    const wanted = new Set(alarms.map((alarm) => alarm.id));
    for (const id of scheduled.keys()) if (!wanted.has('test') && !wanted.has(id) && id !== 'test') stop(id);
    for (const alarm of alarms) {
      if (alarm.startMs <= now) continue;
      const old = scheduled.get(alarm.id);
      // Detect clock jumps / sleep: the wall clock and audio clock can diverge.
      const expected = Math.max(0, (alarm.dueMs - now) / 1000);
      if (old && Math.abs(Math.max(0, old.startTime - audio.currentTime) - expected) < 2) continue;
      stop(alarm.id);
      const source = audio.createBufferSource();
      const gain = audio.createGain();
      source.buffer = customBuffer || buffer;
      source.loop = true;
      gain.gain.value = .9;
      source.connect(gain);
      gain.connect(audio.destination);
      const startTime = audio.currentTime + expected;
      const endTime = audio.currentTime + (alarm.startMs - now) / 1000;
      scheduled.set(alarm.id, { source, gain, startTime });
      source.onended = () => { if (scheduled.get(alarm.id)?.source === source) stop(alarm.id); };
      // Audio timeline, not setTimeout: the sound is queued before the tab goes idle.
      source.start(startTime);
      source.stop(endTime);
    }
    return true;
  };
  const test = async () => {
    const ready = await unlock();
    if (!ready) return false;
    const now = Date.now();
    schedule([{ id: 'test', dueMs: now, startMs: now + 4_000 }], now);
    return true;
  };
  return {
    unlock, schedule, stop, stopAll, stopScheduled, test,
    get state() { return context?.state || 'suspended'; },
    setCustomAudio: async (bytes) => {
      if (disposed || (!bytes && !customBuffer)) return;
      const audio = getContext();
      customBuffer = bytes ? await audio.decodeAudioData(bytes.slice(0)) : null;
      stopAll();
    },
    dispose: () => {
      disposed = true;
      stopAll();
      if (context) { context.onstatechange = null; void context.close().catch(() => {}); }
    },
  };
}
