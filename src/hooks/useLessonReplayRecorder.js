import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../services/api';
import {
  createLessonReplayBoardRecordingState,
  evaluateLessonReplayBoardPayload,
} from '../utils/lessonReplayBoardRecording';

// A replay is background telemetry, not call signalling. Larger batches avoid
// repeatedly processing a growing lesson file on a small single-core server.
const FLUSH_INTERVAL_MS = 8000;
// A soft limit for navigation telemetry. Board/code/action events must survive
// a long outage: dropping even one board delta can corrupt all later frames.
const MAX_QUEUED_EVENTS = 6000;
const STOP_GRACE_MS = 20_000;
const MODE_SWITCH_RETRY_MS = 1500;
const EVENT_WRITE_RETRY_DELAYS_MS = [0, 800, 2400];
const AUDIO_UPLOAD_RETRY_DELAYS_MS = [0, 750, 1800];
const AUDIO_UPLOAD_REQUEST_TIMEOUT_MS = 12_000;
const MAX_PENDING_AUDIO_SEGMENTS = 8;
const SCREEN_UPLOAD_RETRY_DELAYS_MS = [0, 1000, 3000];

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

const getAdjustedOccurredAt = (occurredAt, clockOffsetMs = 0) => {
  const parsed = Date.parse(String(occurredAt || '').trim());
  if (!Number.isFinite(parsed)) return occurredAt;
  return new Date(parsed + (Number(clockOffsetMs) || 0)).toISOString();
};

const applySessionClockToEvents = (events, session) => (
  (Array.isArray(events) ? events : []).map((event) => ({
    ...event,
    occurredAt: getAdjustedOccurredAt(event?.occurredAt, session?.clockOffsetMs),
  }))
);

const isRetryableAudioUploadError = (error) => {
  const status = Number(error?.status) || 0;
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
};

const isRetryableScreenUploadError = (error) => {
  const status = Number(error?.status) || 0;
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
};

const waitForAudioUploadRetry = (delayMs) => new Promise((resolve) => {
  window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
});

const waitForEventWriteRetry = (delayMs) => new Promise((resolve) => {
  window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
});

const isRetryableEventWriteError = (error) => {
  const status = Number(error?.status) || 0;
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
};

const trimLessonReplayQueue = (events, maxEvents = MAX_QUEUED_EVENTS) => {
  const result = Array.isArray(events) ? [...events] : [];
  if (result.length <= maxEvents) return result;
  for (let index = 0; index < result.length && result.length > maxEvents;) {
    if (result[index]?.type === 'viewport') result.splice(index, 1);
    else index += 1;
  }
  for (let index = 0; index < result.length && result.length > maxEvents;) {
    if (result[index]?.type === 'navigation') result.splice(index, 1);
    else index += 1;
  }
  return result;
};

const runEventWriteWithRetry = async (request) => {
  let lastError = null;
  for (let attempt = 0; attempt < EVENT_WRITE_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await waitForEventWriteRetry(EVENT_WRITE_RETRY_DELAYS_MS[attempt]);
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (!isRetryableEventWriteError(error)) break;
    }
  }
  throw lastError || new Error('Lesson replay write failed');
};

const runAudioUploadRequest = (request) => new Promise((resolve, reject) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let settled = false;
  const settle = (callback, value) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timerId);
    callback(value);
  };
  const timerId = window.setTimeout(() => {
    const error = new Error('Audio upload timed out');
    error.status = 408;
    settle(reject, error);
    controller?.abort();
  }, AUDIO_UPLOAD_REQUEST_TIMEOUT_MS);
  Promise.resolve()
    .then(() => request(controller?.signal))
    .then((value) => settle(resolve, value))
    .catch((error) => settle(reject, error));
});

const runAudioUploadStage = (stage, request) => (
  runAudioUploadRequest(request).catch((error) => {
    if (error && typeof error === 'object') error.stage = stage;
    throw error;
  })
);

const useLessonReplayRecorder = ({
  active = false,
  studentId = '',
  view = '',
  viewLabel = '',
  mode = 'platform',
  occurrenceKey = '',
  learningLessonId = '',
} = {}) => {
  const normalizedMode = normalizeRecorderMode(mode);
  const normalizedOccurrenceKey = String(occurrenceKey || '').trim();
  const normalizedLearningLessonId = String(learningLessonId || '').trim();
  const recorderTargetKey = normalizedLearningLessonId
    ? `learning-group:${normalizedLearningLessonId}`
    : `student:${String(studentId || '').trim()}`;
  const hasRecorderTarget = Boolean(normalizedLearningLessonId || studentId);
  const [lessonReplayError, setLessonReplayError] = useState('');
  const sessionRef = useRef(null);
  const queueSessionRef = useRef(null);
  const failedFinishesRef = useRef(new Map());
  const inFlightEventsRef = useRef(null);
  const capacityBlockedSessionRef = useRef('');
  const sessionGenerationRef = useRef(0);
  const queueRef = useRef([]);
  const flushingRef = useRef(false);
  const flushPromiseRef = useRef(null);
  const finishSessionRef = useRef(null);
  const flushTimerRef = useRef(null);
  const flushDeadlineRef = useRef(0);
  const stopTimerRef = useRef(null);
  const startRetryTimerRef = useRef(null);
  const modeSwitchRetryTimerRef = useRef(null);
  const modeSwitchInFlightRef = useRef('');
  const syncSessionModeRef = useRef(null);
  const startSessionRef = useRef(null);
  const startInFlightRef = useRef(0);
  const lastEventRef = useRef({ signature: '', at: 0 });
  const boardRecordingStateRef = useRef(createLessonReplayBoardRecordingState());
  const screenSnapshotDisabledSessionRef = useRef('');
  const audioUploadDisabledSessionRef = useRef('');
  const audioUploadQueuesRef = useRef(new Map());
  const enabledRef = useRef(Boolean(active && hasRecorderTarget));
  const modeRef = useRef(normalizedMode);
  const occurrenceKeyRef = useRef(normalizedOccurrenceKey);

  modeRef.current = normalizedMode;
  occurrenceKeyRef.current = normalizedOccurrenceKey;

  useEffect(() => {
    if (active && hasRecorderTarget) enabledRef.current = true;
    else if (!sessionRef.current?.sessionId) enabledRef.current = false;
  }, [active, hasRecorderTarget]);

  const flush = useCallback(async () => {
    const session = sessionRef.current;
    if (flushingRef.current) return flushPromiseRef.current;
    if (!session?.sessionId || queueRef.current.length === 0) return null;
    if (capacityBlockedSessionRef.current === session.sessionId) return null;
    const queuedEvents = queueRef.current.splice(0, 48);
    const events = applySessionClockToEvents(queuedEvents, session);
    const inFlight = { session, events: queuedEvents };
    inFlightEventsRef.current = inFlight;
    flushingRef.current = true;
    const operation = (async () => {
      try {
        const result = await api.appendLessonReplayEvents(session.sessionId, events);
        if (sessionRef.current?.sessionId === session.sessionId && queueRef.current.length === 0 && failedFinishesRef.current.size === 0) {
          setLessonReplayError('');
        }
        if (result?.ended && sessionRef.current?.sessionId === session.sessionId) {
          sessionRef.current = null;
          enabledRef.current = false;
          if (queueRef.current.length > 0) {
            setLessonReplayError('Урок завершён, но часть изменений ещё ожидает сохранения. Скачайте резервную копию.');
          }
          boardRecordingStateRef.current = createLessonReplayBoardRecordingState();
        }
      } catch (error) {
        const stillCurrentSession = sessionRef.current?.sessionId === session.sessionId;
        if (stillCurrentSession) {
          queueRef.current = trimLessonReplayQueue([...queuedEvents, ...queueRef.current]);
          if (error?.status === 413) capacityBlockedSessionRef.current = session.sessionId;
          setLessonReplayError(error?.status === 413
            ? (error.message || 'Не удалось сохранить запись: превышен допустимый размер.')
            : 'Запись урока ожидает сохранения. Не закрывайте страницу до восстановления связи.');
        }
        const message = String(error?.message || '');
        const sessionUnavailable = (
          error?.status === 404
          || error?.status === 410
          || /заверш|истек|не найден/iu.test(message)
        );
        if (sessionUnavailable) {
          if (stillCurrentSession) {
            sessionRef.current = null;
            boardRecordingStateRef.current = createLessonReplayBoardRecordingState();
          }
          const lessonEnded = /урок[^.]*заверш|запись[^.]*урок[^.]*заверш/iu.test(message);
          if (lessonEnded && stillCurrentSession) enabledRef.current = false;
          else if (stillCurrentSession && enabledRef.current) startSessionRef.current?.();
        }
        if (!stillCurrentSession) {
          // The target changed while this request was in flight.  Retry the
          // detached batch against its original session instead of mixing it
          // into the next lesson's queue.
          void finishSessionRef.current?.(session, queuedEvents);
        }
      } finally {
        if (inFlightEventsRef.current === inFlight) inFlightEventsRef.current = null;
        flushingRef.current = false;
        if (queueRef.current.length > 0 && sessionRef.current?.sessionId
          && capacityBlockedSessionRef.current !== sessionRef.current.sessionId) {
          window.clearTimeout(flushTimerRef.current);
          flushDeadlineRef.current = Date.now() + 2500;
          flushTimerRef.current = window.setTimeout(() => {
            flushTimerRef.current = null;
            void flush();
          }, 2500);
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
    const deadline = Date.now() + Math.max(0, Number(delay) || 0);
    // Continuous typing/drawing must not push the write back indefinitely.
    if (flushTimerRef.current !== null && flushDeadlineRef.current <= deadline) return;
    window.clearTimeout(flushTimerRef.current);
    flushDeadlineRef.current = deadline;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flush();
    }, Math.max(0, deadline - Date.now()));
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

  const drainAudioUploads = useCallback(async (sessionId) => {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) return;
    const queue = audioUploadQueuesRef.current.get(normalizedSessionId);
    // Every upload request has its own timeout and bounded retries. Closing
    // the session after an unrelated 20s timeout loses queued final segments.
    if (queue?.tail) await queue.tail;
  }, []);

  const finishSession = useCallback(async (session, pendingEvents = null, options = {}) => {
    if (!session) return { ok: true, alreadyFinished: true };
    await drainAudioUploads(session.sessionId);
    const pending = Array.isArray(pendingEvents) ? pendingEvents : queueRef.current.splice(0);
    const failureKey = session.pendingKey || session.sessionId;
    const previousFailure = failedFinishesRef.current.get(failureKey);
    const rememberFailure = (error, unsavedStart) => {
      const previous = failedFinishesRef.current.get(failureKey);
      const eventsById = new Map([
        ...(previous?.events || []), ...pending.slice(unsavedStart),
      ].map((event) => [event.id, event]));
      const entry = { session, events: Array.from(eventsById.values()), options };
      failedFinishesRef.current.set(failureKey, entry);
      setLessonReplayError('Последние изменения урока ещё не сохранены. Повторите сохранение или скачайте резервную копию.');
      return { ok: false, error, unsavedEvents: entry.events.length };
    };
    if (!session.sessionId) {
      if (pending.length === 0) return { ok: true, alreadyFinished: true };
      const requestStartedAtMs = Date.now();
      try {
        const started = await api.startLessonReplaySession(session.studentId, {
          via: session.via,
          occurrenceKey: session.occurrenceKey,
          learningLessonId: session.learningLessonId,
        });
        const serverNowMs = Number(started?.serverNowMs) || Date.parse(started?.serverNow || '');
        session = {
          ...session,
          ...started,
          clockOffsetMs: Number.isFinite(serverNowMs)
            ? Math.round(serverNowMs - (requestStartedAtMs + Date.now()) / 2) : 0,
        };
      } catch (error) {
        return rememberFailure(error, 0);
      }
    }
    const finalBatchStart = Math.max(0, pending.length - 48);
    for (let index = 0; index < finalBatchStart; index += 48) {
      try {
        const batch = applySessionClockToEvents(
          pending.slice(index, Math.min(index + 48, finalBatchStart)),
          session
        );
        await runEventWriteWithRetry(() => (
          api.appendLessonReplayEvents(session.sessionId, batch, options)
        ));
      } catch (error) {
        // Never move events from a finished lesson into the next student's queue.
        return rememberFailure(error, index);
      }
    }
    try {
      await runEventWriteWithRetry(() => (
        api.finishLessonReplaySession(session.sessionId, {
          ...options,
          events: applySessionClockToEvents(pending.slice(finalBatchStart), session),
        })
      ));
      if (failedFinishesRef.current.get(failureKey) === previousFailure) {
        failedFinishesRef.current.delete(failureKey);
      }
      if (failedFinishesRef.current.size === 0 && queueRef.current.length === 0) setLessonReplayError('');
      return { ok: true };
    } catch (error) {
      return rememberFailure(error, finalBatchStart);
    }
  }, [drainAudioUploads]);

  finishSessionRef.current = finishSession;

  const retryLessonReplaySave = useCallback(async () => {
    capacityBlockedSessionRef.current = '';
    if (!sessionRef.current && queueRef.current.length > 0) {
      if (enabledRef.current) startSessionRef.current?.();
      else if (queueSessionRef.current) {
        await finishSession(queueSessionRef.current, queueRef.current.splice(0));
      }
    }
    await flush();
    for (const entry of Array.from(failedFinishesRef.current.values())) {
      await finishSession(entry.session, entry.events, { ...entry.options, keepalive: false });
    }
  }, [finishSession, flush]);

  const downloadLessonReplayBackup = useCallback(() => {
    const sessions = new Map();
    const add = (session, events) => {
      if (!session) return;
      const key = session.sessionId || session.pendingKey || session.targetKey;
      if (!sessions.has(key)) sessions.set(key, { session, events: new Map() });
      const entry = sessions.get(key);
      for (const event of events || []) entry.events.set(event.id, event);
    };
    add(inFlightEventsRef.current?.session, inFlightEventsRef.current?.events);
    add(sessionRef.current || queueSessionRef.current, queueRef.current);
    failedFinishesRef.current.forEach((entry) => add(entry.session, entry.events));
    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      sessions: Array.from(sessions.values(), ({ session, events }) => ({
        sessionId: session.sessionId,
        studentId: session.studentId,
        learningLessonId: session.learningLessonId,
        occurrenceKey: session.occurrenceKey,
        events: applySessionClockToEvents(Array.from(events.values()), session),
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lesson-replay-backup-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  useEffect(() => {
    const handleOnline = () => { void retryLessonReplaySave(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [retryLessonReplaySave]);

  const recordEvent = useCallback((type, payload = {}, options = {}) => {
    if (!enabledRef.current) return false;
    const boardEvaluation = type === 'board'
      ? evaluateLessonReplayBoardPayload(boardRecordingStateRef.current, payload)
      : null;
    if (boardEvaluation && !boardEvaluation.accepted) return false;
    const signature = getPayloadSignature(type, payload);
    const now = Date.now();
    if (
      signature === lastEventRef.current.signature
      && now - lastEventRef.current.at < (Number(options.dedupeMs) || 1500)
    ) {
      return false;
    }
    lastEventRef.current = { signature, at: now };
    if (boardEvaluation) boardRecordingStateRef.current = boardEvaluation.state;
    queueRef.current.push({
      id: createEventId(),
      type,
      occurredAt: new Date(now).toISOString(),
      payload,
    });
    if (queueRef.current.length > MAX_QUEUED_EVENTS) {
      queueRef.current = trimLessonReplayQueue(queueRef.current);
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
    if (!active || !hasRecorderTarget) {
      lastEventRef.current = { signature: '', at: 0 };
      const previous = sessionRef.current;
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      if (previous?.sessionId) {
        stopTimerRef.current = window.setTimeout(() => {
          if (sessionRef.current?.sessionId !== previous.sessionId) return;
          sessionRef.current = null;
          enabledRef.current = false;
          const pending = queueRef.current.splice(0);
          boardRecordingStateRef.current = createLessonReplayBoardRecordingState();
          finishSession(previous, pending);
        }, STOP_GRACE_MS);
      } else {
        enabledRef.current = false;
        boardRecordingStateRef.current = createLessonReplayBoardRecordingState();
      }
      return undefined;
    }

    const previous = sessionRef.current || (queueRef.current.length > 0 ? queueSessionRef.current : null);
    const hasReusableSession = Boolean(
      previous?.sessionId
      && previous.targetKey === recorderTargetKey
      && (
        !normalizedOccurrenceKey
        || previous.occurrenceKey === normalizedOccurrenceKey
      )
    );
    if (hasReusableSession) {
      scheduleFlush(0);
    }
    const hasSameTarget = previous?.targetKey === recorderTargetKey && (
      !normalizedOccurrenceKey || previous.occurrenceKey === normalizedOccurrenceKey
    );
    if (previous && !hasReusableSession && !hasSameTarget) {
      sessionRef.current = null;
      const pending = queueRef.current.splice(0);
      finishSession(previous, pending);
    }
    if (queueRef.current.length === 0 && !sessionRef.current) {
      queueSessionRef.current = {
        pendingKey: createEventId(),
        studentId: normalizedStudentId,
        learningLessonId: normalizedLearningLessonId,
        targetKey: recorderTargetKey,
        occurrenceKey: normalizedOccurrenceKey,
        via: modeRef.current,
      };
    }
    if (!hasReusableSession) {
      lastEventRef.current = { signature: '', at: 0 };
      boardRecordingStateRef.current = createLessonReplayBoardRecordingState();
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
      const queuedSession = queueSessionRef.current;
      const requestedOccurrenceKey = occurrenceKeyRef.current || (
        queuedSession?.targetKey === recorderTargetKey && queueRef.current.length > 0
          ? queuedSession.occurrenceKey : ''
      );
      const requestStartedAtMs = Date.now();
      api.startLessonReplaySession(normalizedStudentId, {
        via: requestedMode,
        occurrenceKey: requestedOccurrenceKey,
        learningLessonId: normalizedLearningLessonId,
      })
        .then((session) => {
          const responseReceivedAtMs = Date.now();
          if (cancelled || sessionGenerationRef.current !== generation) {
            if (session?.sessionId) api.finishLessonReplaySession(session.sessionId).catch(() => null);
            return;
          }
          const sessionMode = normalizeRecorderMode(
            session?.activity?.mode || session?.mode || session?.via || requestedMode
          );
          const serverNowMs = Number(session?.serverNowMs)
            || Date.parse(String(session?.serverNow || '').trim());
          const serverRequestReceivedAtMs = Number(session?.serverRequestReceivedAtMs);
          const clockOffsetMs = Number.isFinite(serverNowMs)
            ? Math.round(Number.isFinite(serverRequestReceivedAtMs)
              ? (
                (serverRequestReceivedAtMs - requestStartedAtMs)
                + (serverNowMs - responseReceivedAtMs)
              ) / 2
              : serverNowMs - ((requestStartedAtMs + responseReceivedAtMs) / 2))
            : 0;
          sessionRef.current = {
            ...session,
            studentId: normalizedStudentId,
            learningLessonId: normalizedLearningLessonId,
            targetKey: recorderTargetKey,
            via: sessionMode,
            clockOffsetMs,
            occurrenceKey: String(
              session?.occurrenceKey
              || session?.activity?.occurrenceKey
              || requestedOccurrenceKey
              || ''
            ).trim(),
          };
          queueSessionRef.current = sessionRef.current;
          lastEventRef.current = { signature: '', at: 0 };
          screenSnapshotDisabledSessionRef.current = '';
          audioUploadDisabledSessionRef.current = '';
          retryDelayMs = 1500;
          scheduleFlush(0);
          syncSessionModeRef.current?.();
        })
        .catch(() => {
          if (cancelled || sessionGenerationRef.current !== generation) return;
          sessionRef.current = null;
          if (queueRef.current.length > 0) {
            setLessonReplayError('Запись урока ожидает сохранения. Не закрывайте страницу до восстановления связи.');
          }
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
  }, [
    active,
    finishSession,
    hasRecorderTarget,
    normalizedLearningLessonId,
    normalizedOccurrenceKey,
    recorderTargetKey,
    scheduleFlush,
    studentId,
  ]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(modeSwitchRetryTimerRef.current);
    }
    if (active && hasRecorderTarget) syncSessionMode();
  }, [active, hasRecorderTarget, normalizedMode, syncSessionMode]);

  useEffect(() => {
    if (!active || !hasRecorderTarget || !view) return;
    recordEvent('navigation', { view, label: viewLabel }, { immediate: true, dedupeMs: 5000 });
  }, [active, hasRecorderTarget, recordEvent, view, viewLabel]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePageHide = () => {
      const session = sessionRef.current || queueSessionRef.current;
      if (!session || (!session.sessionId && queueRef.current.length === 0)) return;
      const pending = queueRef.current.splice(0);
      sessionRef.current = null;
      enabledRef.current = false;
      boardRecordingStateRef.current = createLessonReplayBoardRecordingState();
      finishSession(session, pending, { keepalive: true });
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [finishSession]);

  const finishLessonReplayNow = useCallback(async (options = {}) => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
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
    const session = sessionRef.current || queueSessionRef.current;
    sessionRef.current = null;
    const pending = queueRef.current.splice(0);
    lastEventRef.current = { signature: '', at: 0 };
    boardRecordingStateRef.current = createLessonReplayBoardRecordingState();
    screenSnapshotDisabledSessionRef.current = '';
    audioUploadDisabledSessionRef.current = '';
    if (!session || (!session.sessionId && pending.length === 0)) return { ok: true, alreadyFinished: true };
    const result = await finishSession(session, pending, options);
    if (result?.ok === false) {
      const error = result.error instanceof Error
        ? result.error
        : new Error('Не удалось сохранить последние действия урока');
      error.unsavedEvents = result.unsavedEvents;
      throw error;
    }
    return result || { ok: true };
  }, [finishSession]);

  useEffect(() => () => {
    if (typeof window !== 'undefined') {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      window.clearTimeout(stopTimerRef.current);
      window.clearTimeout(startRetryTimerRef.current);
      window.clearTimeout(modeSwitchRetryTimerRef.current);
    }
    const session = sessionRef.current || queueSessionRef.current;
    if (session?.sessionId || (session && queueRef.current.length > 0)) {
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
    const requestMetadata = {
      ...metadata,
      occurredAt: getAdjustedOccurredAt(metadata?.occurredAt, session.clockOffsetMs),
    };
    let lastError = null;
    for (let attempt = 0; attempt < SCREEN_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => window.setTimeout(
          resolve,
          SCREEN_UPLOAD_RETRY_DELAYS_MS[attempt]
        ));
      }
      if (sessionRef.current?.sessionId !== session.sessionId) {
        return { saved: false };
      }
      try {
        const result = await api.uploadLessonReplaySnapshot(session.sessionId, blob, requestMetadata);
        return { saved: true, ...result };
      } catch (error) {
        lastError = error;
        const status = Number(error?.status) || 0;
        if (status === 413 || status === 507 || !isRetryableScreenUploadError(error)) break;
      }
    }

    const error = lastError;
    const disabled = error?.status === 413 || error?.status === 507;
    if (disabled) screenSnapshotDisabledSessionRef.current = session.sessionId;
    if (
      (error?.status === 404 || error?.status === 410)
      && sessionRef.current?.sessionId === session.sessionId
    ) {
      sessionRef.current = null;
      if (enabledRef.current) startSessionRef.current?.();
    }
    return { saved: false, disabled, error };
  }, []);

  const uploadLessonReplayAudioSegment = useCallback((blob, metadata = {}) => {
    const session = sessionRef.current;
    if (
      !enabledRef.current
      || !session?.sessionId
      || !(blob instanceof Blob)
      || blob.size <= 0
      || audioUploadDisabledSessionRef.current === session.sessionId
    ) return Promise.resolve({ saved: false });

    let queue = audioUploadQueuesRef.current.get(session.sessionId);
    if (!queue) {
      queue = { tail: Promise.resolve(), pending: 0 };
      audioUploadQueuesRef.current.set(session.sessionId, queue);
    }
    if (queue.pending >= MAX_PENDING_AUDIO_SEGMENTS) {
      const error = new Error('Audio upload queue is full');
      error.code = 'AUDIO_UPLOAD_QUEUE_FULL';
      audioUploadDisabledSessionRef.current = session.sessionId;
      return Promise.resolve({ saved: false, disabled: true, error });
    }
    queue.pending += 1;

    const operation = queue.tail.catch(() => null).then(async () => {
      let prepared = null;
      let uploaded = false;
      let lastError = null;
      const normalizedMetadata = {
        ...metadata,
        occurredAt: getAdjustedOccurredAt(metadata?.occurredAt, session.clockOffsetMs),
        mimeType: blob.type || metadata?.mimeType,
        sizeBytes: blob.size,
      };

      for (let attempt = 0; attempt < AUDIO_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
        if (attempt > 0) await waitForAudioUploadRetry(AUDIO_UPLOAD_RETRY_DELAYS_MS[attempt]);
        try {
          if (!prepared) {
            prepared = await runAudioUploadStage('prepare', (signal) => (
              api.prepareLessonReplayAudioSegment(session.sessionId, normalizedMetadata, { signal })
            ));
          }
          if (!uploaded) {
            if (prepared.storage === 'local') {
              await runAudioUploadStage('upload', (signal) => (
                api.uploadPreparedLessonReplayAudioSegment(prepared.audioId, blob, {
                  mimeType: normalizedMetadata.mimeType,
                }, { signal })
              ));
            } else {
              const uploadResponse = await runAudioUploadStage('upload', (signal) => fetch(prepared.uploadUrl, {
                method: 'PUT',
                headers: prepared.headers || { 'Content-Type': normalizedMetadata.mimeType || 'audio/webm;codecs=opus' },
                body: blob,
                signal,
              }));
              if (!uploadResponse.ok) {
                const uploadError = new Error(`Audio upload failed (${uploadResponse.status})`);
                uploadError.status = uploadResponse.status;
                uploadError.stage = 'upload';
                throw uploadError;
              }
            }
            uploaded = true;
          }
          const result = await runAudioUploadStage('complete', (signal) => (
            api.completeLessonReplayAudioSegment(prepared.audioId, { signal })
          ));
          return { saved: true, ...result };
        } catch (error) {
          lastError = error;
          if (!isRetryableAudioUploadError(error)) break;
        }
      }

      const error = lastError;
      const sessionExpired = error?.stage === 'prepare'
        && (error?.status === 404 || error?.status === 410);
      // Never continue producing a replay with silent holes after all retries
      // are exhausted. Session expiry is the only recoverable case: it starts
      // a replacement session, while every other persistent failure stops the
      // capture and leaves the already-saved recording intact.
      const disabled = !sessionExpired;
      if (disabled) audioUploadDisabledSessionRef.current = session.sessionId;
      if (
        sessionExpired
        && sessionRef.current?.sessionId === session.sessionId
      ) {
        sessionRef.current = null;
        if (enabledRef.current) startSessionRef.current?.();
      }
      return { saved: false, disabled, error };
    });
    queue.tail = operation.catch(() => null);
    const settledTail = queue.tail;
    void settledTail.then(() => {
      queue.pending = Math.max(0, queue.pending - 1);
      if (
        queue.pending === 0
        && queue.tail === settledTail
        && audioUploadQueuesRef.current.get(session.sessionId) === queue
      ) audioUploadQueuesRef.current.delete(session.sessionId);
    });
    return operation;
  }, []);

  return {
    lessonReplayError,
    retryLessonReplaySave,
    downloadLessonReplayBackup,
    recordLessonReplayEvent: recordEvent,
    flushLessonReplay: flush,
    finishLessonReplayNow,
    uploadLessonReplayScreenSnapshot,
    uploadLessonReplayAudioSegment,
  };
};

export default useLessonReplayRecorder;
