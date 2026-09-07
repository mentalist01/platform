import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { resolveApiUrl } from '../utils/runtimeUrls';
import { buildLessonAlarms, createLessonAlarmPlayer, LESSON_ALARM_PREFS_PREFIX } from '../utils/lessonAlarm';
import { accessAlarmMelody } from '../utils/lessonAlarmMelodyStore';

function readPreferences(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${LESSON_ALARM_PREFS_PREFIX}${userId}`) || 'null');
    const legacy = JSON.parse(localStorage.getItem('teacher_calendar_browser_alarm_prefs_v1') || 'null');
    return { teacherId: userId, enabled: saved?.enabled !== false, url: String(saved?.url ?? legacy?.customMelodyUrl ?? '') };
  } catch { return { teacherId: userId, enabled: true, url: '' }; }
}

export function useLessonAlarm(teacherId) {
  const [preferences, setPreferences] = useState(() => readPreferences(teacherId));
  const [audioState, setAudioState] = useState('suspended');
  const [ringing, setRinging] = useState(null);
  const [next, setNext] = useState(null);
  const [error, setError] = useState('');
  const [soundNote, setSoundNote] = useState('');
  const [fileName, setFileName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [soundRevision, setSoundRevision] = useState(0);
  const engine = useRef(null);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  useEffect(() => {
    if (!teacherId) return undefined;
    let disposed = false;
    let entries = [];
    let marks = {};
    let loading = false;
    let refreshAgain = false;
    let ownsLock = false;
    let lockPending = false;
    let releaseLock;
    const dismissedKey = `${LESSON_ALARM_PREFS_PREFIX}dismissed:${teacherId}`;
    const dismissed = new Set();
    const readDismissed = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
        if (Array.isArray(stored)) stored.forEach((id) => dismissed.add(String(id)));
      } catch { /* in-memory dismissal still works */ }
    };
    readDismissed();
    const player = createLessonAlarmPlayer({ onState: (state) => {
      if (!disposed) { setAudioState(state); sync(); }
    } });
    const release = () => { ownsLock = false; releaseLock?.(); releaseLock = null; player.stopScheduled(); };
    function claim() {
      if (ownsLock || lockPending || player.state !== 'running') return;
      if (!navigator.locks?.request) { ownsLock = true; return; }
      lockPending = true;
      void navigator.locks.request(`ivan100-lesson-alarm:${teacherId}`, { ifAvailable: true }, async (lock) => {
        lockPending = false;
        if (!lock || disposed || !preferencesRef.current.enabled) return;
        ownsLock = true;
        sync();
        await new Promise((resolve) => { releaseLock = resolve; });
        ownsLock = false;
      }).catch(() => { lockPending = false; if (!disposed) setError('Не удалось включить будильник в этой вкладке. Обновите страницу.'); });
    }
    function sync() {
      if (disposed) return;
      if (!preferencesRef.current.enabled) { release(); setRinging(null); setNext(null); return; }
      readDismissed();
      const now = Date.now();
      const alarms = buildLessonAlarms(entries, teacherId, marks, now).filter((alarm) => !dismissed.has(alarm.id));
      const nextAlarm = alarms[0] || null;
      setNext((previous) => previous?.id === nextAlarm?.id && previous?.title === nextAlarm?.title ? previous : nextAlarm);
      claim();
      if (!ownsLock) { player.stopScheduled(); setRinging(null); return; }
      player.schedule(alarms, now);
      const currentAlarm = player.state === 'running' ? alarms.find((alarm) => alarm.dueMs <= now && alarm.startMs > now) || null : null;
      setRinging((previous) => previous?.id === currentAlarm?.id && previous?.title === currentAlarm?.title ? previous : currentAlarm);
    }
    const refresh = async () => {
      if (loading) { refreshAgain = true; return; }
      loading = true;
      try {
        const [schedule, response] = await Promise.all([api.getTeacherSchedule(teacherId), api.getTeacherCalendarMarks(teacherId)]);
        if (disposed) return;
        entries = Array.isArray(schedule) ? schedule : [];
        marks = response?.marks || {};
        setLoaded(true);
        setError('');
        sync();
      } catch {
        if (!disposed) setError('Расписание будильника не обновилось. Используем последние загруженные занятия.');
      } finally {
        loading = false;
        if (refreshAgain && !disposed) { refreshAgain = false; void refresh(); }
      }
    };
    const unlock = () => {
      if (!preferencesRef.current.enabled) return;
      try { void player.unlock().then(() => { if (!disposed) sync(); }).catch(() => {}); } catch { setAudioState('unavailable'); }
    };
    const restore = () => { if (document.visibilityState !== 'hidden') { unlock(); void refresh(); } };
    const onStorage = (event) => {
      if (event.key === dismissedKey) sync();
      if (event.key === `${LESSON_ALARM_PREFS_PREFIX}${teacherId}`) setPreferences(readPreferences(teacherId));
    };
    engine.current = {
      player, sync, unlock, refresh,
      stop: () => {
        const now = Date.now();
        buildLessonAlarms(entries, teacherId, marks, now).filter((alarm) => alarm.dueMs <= now).forEach((alarm) => dismissed.add(alarm.id));
        try { localStorage.setItem(dismissedKey, JSON.stringify([...dismissed].filter((id) => Number(id.split(':').at(-1)) > now - 86_400_000))); } catch { /* private browsing */ }
        player.stop('test');
        sync();
      },
    };
    preferencesRef.current = readPreferences(teacherId);
    setPreferences(preferencesRef.current);
    setAudioState('suspended');
    setRinging(null);
    setNext(null);
    setError('');
    setLoaded(false);
    void refresh();
    unlock();
    const tick = window.setInterval(sync, 5_000);
    const poll = window.setInterval(() => void refresh(), 60_000);
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', restore);
    window.addEventListener('focus', restore);
    window.addEventListener('online', restore);
    window.addEventListener('storage', onStorage);
    const stream = typeof EventSource === 'function' ? new EventSource(resolveApiUrl('/api/schedule-sync/stream'), { withCredentials: true }) : null;
    stream?.addEventListener('schedule-sync', refresh);
    return () => {
      disposed = true;
      release();
      engine.current = null;
      player.dispose();
      clearInterval(tick); clearInterval(poll);
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', restore);
      window.removeEventListener('focus', restore);
      window.removeEventListener('online', restore);
      window.removeEventListener('storage', onStorage);
      stream?.close();
    };
  }, [teacherId]);

  useEffect(() => {
    if (!teacherId || preferences.teacherId !== teacherId) return;
    try { localStorage.setItem(`${LESSON_ALARM_PREFS_PREFIX}${teacherId}`, JSON.stringify(preferences)); } catch { /* session preference remains available */ }
    engine.current?.sync();
  }, [teacherId, preferences]);

  useEffect(() => {
    if (!teacherId || preferences.teacherId !== teacherId || !engine.current) return undefined;
    let disposed = false;
    const player = engine.current.player;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    (async () => {
      let file = null;
      try { file = await accessAlarmMelody(teacherId); } catch { /* default chime needs no storage */ }
      try {
        if (disposed) return;
        setFileName(file?.name || '');
        let bytes = file ? await file.arrayBuffer() : null;
        if (!bytes && preferences.url.trim()) {
          const response = await fetch(preferences.url.trim(), { signal: controller.signal });
          if (!response.ok) throw new Error('Melody unavailable');
          bytes = await response.arrayBuffer();
        }
        if (disposed) return;
        await player.setCustomAudio(bytes);
        if (!disposed) { setSoundNote(''); engine.current?.sync(); }
      } catch {
        if (!disposed) {
          await player.setCustomAudio(null);
          setSoundNote('Своя мелодия недоступна — прозвучит встроенный сигнал.');
          engine.current?.sync();
        }
      } finally { clearTimeout(timer); }
    })();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [teacherId, preferences.teacherId, preferences.url, soundRevision]);

  const test = useCallback(() => {
    const player = engine.current?.player;
    if (!player) return;
    void player.test().catch(() => setAudioState('suspended'));
  }, []);
  const setEnabled = (enabled) => {
    preferencesRef.current = { ...preferencesRef.current, enabled };
    setPreferences(preferencesRef.current);
    if (enabled) engine.current?.unlock();
    else engine.current?.sync();
  };
  const setFile = async (file) => {
    if (file && file.size > 5 * 1024 * 1024) { setSoundNote('Выберите аудиофайл до 5 МБ.'); return; }
    try { await accessAlarmMelody(teacherId, file); setSoundRevision((value) => value + 1); }
    catch { setSoundNote('Не удалось сохранить мелодию. Встроенный сигнал остаётся доступен.'); }
  };
  return {
    ...preferences, audioState, ringing, next, error, soundNote, fileName, loaded,
    setEnabled, test, setFile,
    setUrl: (url) => setPreferences((value) => ({ ...value, url })),
    stop: () => engine.current?.stop(),
  };
}
