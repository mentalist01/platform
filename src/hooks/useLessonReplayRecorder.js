import { useCallback, useEffect, useRef } from 'react';

import { api } from '../services/api';

// A replay is background telemetry, not call signalling. Larger batches avoid
// repeatedly processing a growing lesson file on a small single-core server.
const FLUSH_INTERVAL_MS = 8000;
const MAX_QUEUED_EVENTS = 120;
const STOP_GRACE_MS = 20_000;
const MODE_SWITCH_RETRY_MS = 1500;
const AUDIO_UPLOAD_RETRY_DELAYS_MS = [0, 750, 1800];
const AUDIO_UPLOAD_REQUEST_TIMEOUT_MS = 12_000;
const AUDIO_UPLOAD_DRAIN_TIMEOUT_MS = 20_000;
const MAX_PENDING_AUDIO_SEGMENTS = 8;

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

const waitForAudioUploadRetry = (delayMs) => new Promise((resolve) => {
  window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
});

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

const waitForAudioUploadsToDrain = (promise, timeoutMs = AUDIO_UPLOAD_DRAIN_TIMEOUT_MS) => (
  new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timerId);
      resolve();
    };
    const timerId = window.setTimeout(finish, Math.max(0, Number(timeoutMs) || 0));
    Promise.resolve(promise).catch(() => null).then(finish);
  })
);

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
  const audioUploadDisabledSessionRef = useRef('');
  const audioUploadQueuesRef = useRef(new Map());
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
    const queuedEvents = queueRef.current.splice(0, 48);
    const events = applySessionClockToEvents(queuedEvents, session);
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
        queueRef.current = [...queuedEvents, ...queueRef.current].slice(0, MAX_QUEUED_EVENTS);
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

  const drainAudioUploads = useCallback(async (sessionId) => {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) return;
    const queue = audioUploadQueuesRef.current.get(normalizedSessionId);
    if (queue?.tail) await waitForAudioUploadsToDrain(queue.tail);
  }, []);

  const finishSession = useCallback(async (session, pendingEvents = null, options = {}) => {
    if (!session?.sessionId) return;
    await drainAudioUploads(session.sessionId);
    const pending = Array.isArray(pendingEvents) ? pendingEvents : queueRef.current.splice(0);
    const finalBatchStart = Math.max(0, pending.length - 48);
    for (let index = 0; index < finalBatchStart; index += 48) {
      try {
        await api.appendLessonReplayEvents(
          session.sessionId,
          applySessionClockToEvents(
            pending.slice(index, Math.min(index + 48, finalBatchStart)),
            session
          ),
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
        events: applySessionClockToEvents(pending.slice(finalBatchStart), session),
      });
    } catch {
      // Session expiry will clean up an interrupted finish on the server.
    }
  }, [drainAudioUploads]);

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
      const requestStartedAtMs = Date.now();
      api.startLessonReplaySession(normalizedStudentId, {
        via: requestedMode,
        occurrenceKey: requestedOccurrenceKey,
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
            via: sessionMode,
            clockOffsetMs,
            occurrenceKey: String(
              session?.occurrenceKey
              || session?.activity?.occurrenceKey
              || requestedOccurrenceKey
              || ''
            ).trim(),
          };
          screenSnapshotDisabledSessionRef.current = '';
          audioUploadDisabledSessionRef.current = '';
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
    audioUploadDisabledSessionRef.current = '';
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
      const result = await api.uploadLessonReplaySnapshot(session.sessionId, blob, {
        ...metadata,
        occurredAt: getAdjustedOccurredAt(metadata?.occurredAt, session.clockOffsetMs),
      });
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
    recordLessonReplayEvent: recordEvent,
    flushLessonReplay: flush,
    finishLessonReplayNow,
    uploadLessonReplayScreenSnapshot,
    uploadLessonReplayAudioSegment,
  };
};

export default useLessonReplayRecorder;
