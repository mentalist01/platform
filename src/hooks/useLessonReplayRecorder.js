import { useCallback, useEffect, useRef } from 'react';

import { api } from '../services/api';

const FLUSH_INTERVAL_MS = 2400;
const MAX_QUEUED_EVENTS = 120;
const STOP_GRACE_MS = 20_000;

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
} = {}) => {
  const sessionRef = useRef(null);
  const sessionGenerationRef = useRef(0);
  const queueRef = useRef([]);
  const flushingRef = useRef(false);
  const flushTimerRef = useRef(null);
  const stopTimerRef = useRef(null);
  const startRetryTimerRef = useRef(null);
  const startSessionRef = useRef(null);
  const startInFlightRef = useRef(0);
  const lastEventRef = useRef({ signature: '', at: 0 });
  const enabledRef = useRef(Boolean(active && studentId));

  useEffect(() => {
    if (active && studentId) enabledRef.current = true;
    else if (!sessionRef.current?.sessionId) enabledRef.current = false;
  }, [active, studentId]);

  const flush = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.sessionId || flushingRef.current || queueRef.current.length === 0) return;
    const events = queueRef.current.splice(0, 48);
    flushingRef.current = true;
    try {
      await api.appendLessonReplayEvents(session.sessionId, events);
    } catch (error) {
      queueRef.current = [...events, ...queueRef.current].slice(0, MAX_QUEUED_EVENTS);
      const message = String(error?.message || '');
      if (/завершена|истек|не найдена/i.test(message)) {
        sessionRef.current = null;
        startSessionRef.current?.();
      }
    } finally {
      flushingRef.current = false;
      if (queueRef.current.length > 0 && sessionRef.current?.sessionId) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = window.setTimeout(() => flush(), 800);
      }
    }
  }, []);

  const scheduleFlush = useCallback((delay = FLUSH_INTERVAL_MS) => {
    if (typeof window === 'undefined') return;
    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => flush(), delay);
  }, [flush]);

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
      api.startLessonReplaySession(normalizedStudentId)
        .then((session) => {
          if (cancelled || sessionGenerationRef.current !== generation) {
            if (session?.sessionId) api.finishLessonReplaySession(session.sessionId).catch(() => null);
            return;
          }
          sessionRef.current = { ...session, studentId: normalizedStudentId };
          retryDelayMs = 1500;
          scheduleFlush(0);
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

  useEffect(() => () => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(flushTimerRef.current);
      window.clearTimeout(stopTimerRef.current);
      window.clearTimeout(startRetryTimerRef.current);
    }
    const session = sessionRef.current;
    if (session?.sessionId) {
      sessionRef.current = null;
      enabledRef.current = false;
      const pending = queueRef.current.splice(0);
      finishSession(session, pending, { keepalive: true });
    }
  }, [finishSession]);

  return {
    recordLessonReplayEvent: recordEvent,
    flushLessonReplay: flush,
  };
};

export default useLessonReplayRecorder;
