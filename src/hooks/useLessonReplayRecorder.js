import { useCallback, useEffect, useRef } from 'react';

import { api } from '../services/api';

// A replay is background telemetry, not call signalling. Larger batches avoid
// repeatedly processing a growing lesson file on a small single-core server.
const FLUSH_INTERVAL_MS = 8000;
const MAX_QUEUED_EVENTS = 120;
const STOP_GRACE_MS = 20_000;
const MODE_SWITCH_RETRY_MS = 1500;

const normalizeRecorderMode = (value) => (value === 'telemost' ? 'telemost' : 'platform');

const createEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const getPayloadSignature = (type, payload) => {
  try {
    return JSON.stringify([type, payload]);
  } catch {
    return `${type}:${Date.now()}`;
  }
};

const useLessonReplayRecorder = ({
  active = false,
  studentId = '',
  view = '',
  viewLabel = '',
  mode = 'platform',
  occurrenceKey = '',
} = {}) => {
  const normalizedMode = normalizeRecorderMode(mode);
  const normalizedOccurrenceKey = String(occurrenceKey || '').trim();
  const sessionRef = useRef(null);
  const sessionGenerationRef = useRef(0);
  const queueRef = useRef([]);
  const flushingRef = useRef(false);
  const flushPromiseRef = useRef(null);
  const flushTimerRef = useRef(null);
  const stopTimerRef = useRef(null);
  const startRetryTimerRef = useRef(null);
  const modeSwitchRetryTimerRef = useRef(null);
  const modeSwitchInFlightRef = useRef('');
  const syncSessionModeRef = useRef(null);
  const startSessionRef = useRef(null);
  const startInFlightRef = useRef(0);
  const lastEventRef = useRef({ signature: '', at: 0 });
  const screenSnapshotDisabledSessionRef = useRef('');
  const enabledRef = useRef(Boolean(active && studentId));
  const modeRef = useRef(normalizedMode);
  const occurrenceKeyRef = useRef(normalizedOccurrenceKey);

  modeRef.current = normalizedMode;
  occurrenceKeyRef.current = normalizedOccurrenceKey;

  useEffect(() => {
    if (active && studentId) enabledRef.current = true;
    else if (!sessionRef.current?.sessionId) enabledRef.current = false;
  }, [active, studentId]);

  const flush = useCallback(async () => {
    const session = sessionRef.current;
    if (flushingRef.current) return flushPromiseRef.current;
    if (!session?.sessionId || queueRef.current.length === 0) return null;
    const events = queueRef.current.splice(0, 48);
    flushingRef.current = true;
    const operation = (async () => {
      try {
        const result = await api.appendLessonReplayEvents(session.sessionId, events);
        if (result?.ended && sessionRef.current?.sessionId === session.sessionId) {
          sessionRef.current = null;
          enabledRef.current = false;
          queueRef.current = [];
        }
      } catch (error) {
        queueRef.current = [...events, ...queueRef.current].slice(0, MAX_QUEUED_EVENTS);
        const message = String(error?.message || '');
        if (
          error?.status === 404
          || error?.status === 410
          || /заверш|истек|не найден/iu.test(message)
        ) {
          sessionRef.current = null;
          queueRef.current = [];
          const lessonEnded = /урок[^.]*заверш|запись[^.]*урок[^.]*заверш/iu.test(message);
          if (lessonEnded) enabledRef.current = false;
          else if (enabledRef.current) startSessionRef.current?.();
        }
      } finally {
        flushingRef.current = false;
        if (queueRef.current.length > 0 && sessionRef.current?.sessionId) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = window.setTimeout(() => flush(), 2500);
        }
      }
    })();
    flushPromiseRef.current = operation;
    try {
      await operation;
    } finally {
      if (flushPromiseRef.current === operation) flushPromiseRef.current = null;
    }
    return null;
  }, []);

  const scheduleFlush = useCallback((delay = FLUSH_INTERVAL_MS) => {
    if (typeof window === 'undefined') return;
    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => flush(), delay);
  }, [flush]);

  const syncSessionMode = useCallback(async () => {
    const session = sessionRef.current;
    const nextMode = modeRef.current;
    if (!session?.sessionId || session.via === nextMode) return null;
    const switchKey = `${session.sessionId}:${nextMode}`;
    if (modeSwitchInFlightRef.current === switchKey) return null;
    modeSwitchInFlightRef.current = switchKey;
    try {
      await flush();
      const result = await api.switchLessonReplaySession(session.sessionId, nextMode);
      const current = sessionRef.current;
      if (current?.sessionId === session.sessionId) {
        sessionRef.current = {
          ...current,
          via: nextMode,
          ...(result?.activity ? { activity: result.activity } : {}),
        };
      }
      return result;
    } catch {
      return null;
    } finally {
      if (modeSwitchInFlightRef.current === switchKey) modeSwitchInFlightRef.current = '';
      const current = sessionRef.current;
      if (
        enabledRef.current
        && current?.sessionId
        && current.via !== modeRef.current
        && typeof window !== 'undefined'
      ) {
        window.clearTimeout(modeSwitchRetryTimerRef.current);
        modeSwitchRetryTimerRef.current = window.setTimeout(
          () => syncSessionModeRef.current?.(),
          MODE_SWITCH_RETRY_MS
        );
      }
    }
  }, [flush]);

  syncSessionModeRef.current = syncSessionMode;

  const finishSession = useCallback(async (session, pendingEvents = null, options = {}) => {
    if (!session?.sessionId) return;
    const pending = Array.isArray(pendingEvents) ? pendingEvents : queueRef.current.splice(0);
    const finalBatchStart = Math.max(0, pending.length - 48);
    for (let index = 0; index < finalBatchStart; index += 48) {
      try {
        await api.appendLessonReplayEvents(
          session.sessionId,
          pending.slice(index, Math.min(index + 48, finalBatchStart)),
          options
        );
      } catch {
        // Never move events from a finished lesson into the next student's queue.
        return;
      }
    }
    try {
      await api.finishLessonReplaySession(session.sessionId, {
        ...options,
        events: pending.slice(finalBatchStart),
      });
    } catch {
      // Session expiry will clean up an interrupted finish on the server.
    }
  }, []);

  const recordEvent = useCallback((type, payload = {}, options = {}) => {
    if (!enabledRef.current) return false;
    const signature = getPayloadSignature(type, payload);
    const now = Date.now();
    if (
      signature === lastEventRef.current.signature
      && now - lastEventRef.current.at < (Number(options.dedupeMs) || 1500)
    ) {
      return false;
    }
    lastEventRef.current = { signature, at: now };
    queueRef.current.push({
      id: createEventId(),
      type,
      occurredAt: new Date(now).toISOString(),
      payload,
    });
    if (queueRef.current.length > MAX_QUEUED_EVENTS) {
      queueRef.current.splice(0, queueRef.current.length - MAX_QUEUED_EVENTS);
    }
    scheduleFlush(options.immediate ? 0 : FLUSH_INTERVAL_MS);
    return true;
  }, [scheduleFlush]);

  useEffect(() => {
    const normalizedStudentId = String(studentId || '').trim();
    const generation = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = generation;
    window.clearTimeout(stopTimerRef.current);
    window.clearTimeout(startRetryTimerRef.current);
    if (!active || !normalizedStudentId) {
      const previous = sessionRef.current;
      window.clearTimeout(flushTimerRef.current);
      if (previous?.sessionId) {
        stopTimerRef.current = window.setTimeout(() => {
          if (sessionRef.current?.sessionId !== previous.sessionId) return;
          sessionRef.current = null;
          enabledRef.current = false;
          const pending = queueRef.current.splice(0);
          finishSession(previous, pending);
        }, STOP_GRACE_MS);
      } else {
        queueRef.current = [];
        enabledRef.current = false;
      }
      return undefined;
    }

    const previous = sessionRef.current;
    const hasReusableSession = previous?.sessionId && previous.studentId === normalizedStudentId;
    if (hasReusableSession) {
      scheduleFlush(0);
    }
    if (previous?.sessionId && !hasReusableSession) {
      sessionRef.current = null;
      const pending = queueRef.current.splice(0);
      finishSession(previous, pending);
    }

    let cancelled = false;
    let retryDelayMs = 1500;
    const startSession = () => {
      if (
        cancelled
        || sessionGenerationRef.current !== generation
        || sessionRef.current?.sessionId
        || startInFlightRef.current === generation
      ) return;
      startInFlightRef.current = generation;
      const requestedMode = modeRef.current;
      const requestedOccurrenceKey = occurrenceKeyRef.current;
      api.startLessonReplaySession(normalizedStudentId, {
        via: requestedMode,
        occurrenceKey: requestedOccurrenceKey,
      })
        .then((session) => {
          if (cancelled || sessionGenerationRef.current !== generation) {
            if (session?.sessionId) api.finishLessonReplaySession(session.sessionId).catch(() => null);
            return;
          }
          const sessionMode = normalizeRecorderMode(
            session?.activity?.mode || session?.mode || session?.via || requestedMode
          );
          sessionRef.current = {
            ...session,
            studentId: normalizedStudentId,
            via: sessionMode,
            occurrenceKey: String(
              session?.occurrenceKey
              || session?.activity?.occurrenceKey
              || requestedOccurrenceKey
              || ''
            ).trim(),
          };
          screenSnapshotDisabledSessionRef.current = '';
          retryDelayMs = 1500;
          scheduleFlush(0);
          syncSessionModeRef.current?.();
        })
        .catch(() => {
          if (cancelled || sessionGenerationRef.current !== generation) return;
          sessionRef.current = null;
          window.clearTimeout(startRetryTimerRef.current);
          startRetryTimerRef.current = window.setTimeout(startSession, retryDelayMs);
          retryDelayMs = Math.min(15_000, Math.round(retryDelayMs * 1.7));
        })
        .finally(() => {
          if (startInFlightRef.current === generation) startInFlightRef.current = 0;
        });
    };
    startSessionRef.current = startSession;
    startSession();

    return () => {
      cancelled = true;
      window.clearTimeout(startRetryTimerRef.current);
      if (startSessionRef.current === startSession) startSessionRef.current = null;
    };
  }, [active, finishSession, scheduleFlush, studentId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(modeSwitchRetryTimerRef.current);
    }
    if (active && studentId) syncSessionMode();
  }, [active, normalizedMode, studentId, syncSessionMode]);

  useEffect(() => {
    if (!active || !studentId || !view) return;
    recordEvent('navigation', { view, label: viewLabel }, { immediate: true, dedupeMs: 5000 });
  }, [active, recordEvent, studentId, view, viewLabel]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePageHide = () => {
      const session = sessionRef.current;
      if (!session?.sessionId) return;
      const pending = queueRef.current.splice(0);
      sessionRef.current = null;
      enabledRef.current = false;
      finishSession(session, pending, { keepalive: true });
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [finishSession]);

  const finishLessonReplayNow = useCallback(async (options = {}) => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(flushTimerRef.current);
      window.clearTimeout(stopTimerRef.current);
      window.clearTimeout(startRetryTimerRef.current);
      window.clearTimeout(modeSwitchRetryTimerRef.current);
    }
    sessionGenerationRef.current += 1;
    startSessionRef.current = null;
    modeSwitchInFlightRef.current = '';
    enabledRef.current = false;
    const inFlightFlush = flushPromiseRef.current;
    if (inFlightFlush) await inFlightFlush.catch(() => null);
    const session = sessionRef.current;
    sessionRef.current = null;
    const pending = queueRef.current.splice(0);
    lastEventRef.current = { signature: '', at: 0 };
    screenSnapshotDisabledSessionRef.current = '';
    if (!session?.sessionId) return { ok: true, alreadyFinished: true };
    await finishSession(session, pending, options);
    return { ok: true };
  }, [finishSession]);

  useEffect(() => () => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(flushTimerRef.current);
      window.clearTimeout(stopTimerRef.current);
      window.clearTimeout(startRetryTimerRef.current);
      window.clearTimeout(modeSwitchRetryTimerRef.current);
    }
    const session = sessionRef.current;
    if (session?.sessionId) {
      sessionRef.current = null;
      enabledRef.current = false;
      const pending = queueRef.current.splice(0);
      finishSession(session, pending, { keepalive: true });
    }
  }, [finishSession]);

  const uploadLessonReplayScreenSnapshot = useCallback(async (blob, metadata = {}) => {
    const session = sessionRef.current;
    if (
      !enabledRef.current
      || !session?.sessionId
      || !(blob instanceof Blob)
      || blob.size <= 0
      || screenSnapshotDisabledSessionRef.current === session.sessionId
    ) return { saved: false };
    try {
      const result = await api.uploadLessonReplaySnapshot(session.sessionId, blob, metadata);
      return { saved: true, ...result };
    } catch (error) {
      const disabled = error?.status === 413 || error?.status === 507;
      if (disabled) {
        screenSnapshotDisabledSessionRef.current = session.sessionId;
      }
      if (
        (error?.status === 404 || error?.status === 410)
        && sessionRef.current?.sessionId === session.sessionId
      ) {
        sessionRef.current = null;
        if (enabledRef.current) startSessionRef.current?.();
      }
      return { saved: false, disabled, error };
    }
  }, []);

  return {
    recordLessonReplayEvent: recordEvent,
    flushLessonReplay: flush,
    finishLessonReplayNow,
    uploadLessonReplayScreenSnapshot,
  };
};

export default useLessonReplayRecorder;
