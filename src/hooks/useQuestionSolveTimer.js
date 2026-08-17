import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActiveQuestionSolveTimer,
  QUESTION_SOLVE_TIMER_STORAGE_PREFIX,
  buildQuestionSolveTimerStorageKey,
} from '../utils/questionSolveTimer.js';
import {
  isQuestionPictureInPictureActive,
  subscribeQuestionPictureInPicture,
} from '../utils/questionPictureInPicture.js';

export const QUESTION_SOLVE_IDLE_TIMEOUT_MS = 20 * 60 * 1000;

const QUESTION_SOLVE_ACTIVITY_EVENTS = [
  'keydown',
  'pointerdown',
  'touchstart',
  'input',
  'change',
  'scroll',
];
const QUESTION_SOLVE_ACTIVITY_LISTENER_OPTIONS = { capture: true, passive: true };

export const isQuestionSolveEnvironmentActive = ({
  documentObject = typeof document === 'undefined' ? null : document,
} = {}) => {
  if (isQuestionPictureInPictureActive()) return true;
  if (!documentObject) return true;
  if (documentObject.visibilityState === 'hidden') return false;
  if (typeof documentObject.hasFocus !== 'function') return true;
  try {
    return documentObject.hasFocus();
  } catch {
    return true;
  }
};

export const subscribeQuestionSolveEnvironment = (
  onActiveChange,
  {
    documentObject = typeof document === 'undefined' ? null : document,
    windowObject = typeof window === 'undefined' ? null : window,
    idleTimeoutMs = QUESTION_SOLVE_IDLE_TIMEOUT_MS,
    setTimeoutFn = typeof setTimeout === 'function' ? setTimeout : null,
    clearTimeoutFn = typeof clearTimeout === 'function' ? clearTimeout : null,
  } = {}
) => {
  if (typeof onActiveChange !== 'function') return () => {};
  const disposers = [];
  let idleTimerId = null;
  let idle = false;
  const listen = (target, eventName, handler, options) => {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(eventName, handler, options);
    disposers.push(() => target.removeEventListener?.(eventName, handler, options));
  };
  const clearIdleTimer = () => {
    if (idleTimerId === null) return;
    clearTimeoutFn?.(idleTimerId);
    idleTimerId = null;
  };
  const scheduleIdleTimer = () => {
    clearIdleTimer();
    if (
      !isQuestionSolveEnvironmentActive({ documentObject })
      || typeof setTimeoutFn !== 'function'
      || !Number.isFinite(Number(idleTimeoutMs))
      || Number(idleTimeoutMs) <= 0
    ) return;
    idleTimerId = setTimeoutFn(() => {
      idleTimerId = null;
      idle = true;
      onActiveChange(false);
    }, Number(idleTimeoutMs));
  };
  const reportCurrent = () => {
    const environmentActive = isQuestionSolveEnvironmentActive({ documentObject });
    if (!environmentActive) {
      clearIdleTimer();
      onActiveChange(false);
      return;
    }
    idle = false;
    onActiveChange(true);
    scheduleIdleTimer();
  };
  const reportInactive = () => {
    if (isQuestionPictureInPictureActive()) {
      onActiveChange(true);
      if (!idle && idleTimerId === null) scheduleIdleTimer();
      return;
    }
    clearIdleTimer();
    onActiveChange(false);
  };
  const reportActivity = () => {
    if (!isQuestionSolveEnvironmentActive({ documentObject })) return;
    idle = false;
    onActiveChange(true);
    scheduleIdleTimer();
  };

  listen(documentObject, 'visibilitychange', reportCurrent);
  listen(windowObject, 'focus', reportCurrent);
  listen(windowObject, 'blur', reportInactive);
  listen(windowObject, 'pagehide', reportInactive);
  listen(windowObject, 'pageshow', reportCurrent);
  QUESTION_SOLVE_ACTIVITY_EVENTS.forEach((eventName) => {
    listen(documentObject, eventName, reportActivity, QUESTION_SOLVE_ACTIVITY_LISTENER_OPTIONS);
  });
  const unsubscribePictureInPicture = subscribeQuestionPictureInPicture(({ active, type }) => {
    if (!active) {
      reportCurrent();
      return;
    }
    if (type === 'activity' || type === 'open') reportActivity();
  });
  disposers.push(unsubscribePictureInPicture);

  if (!idle) scheduleIdleTimer();

  return () => {
    clearIdleTimer();
    disposers.forEach((dispose) => dispose());
  };
};

const getFallbackTimerKey = (questionKey) => {
  const normalized = String(questionKey || '').trim();
  return normalized
    ? `${QUESTION_SOLVE_TIMER_STORAGE_PREFIX}:key:${encodeURIComponent(normalized)}`
    : '';
};

const useQuestionSolveTimer = ({
  questionKey,
  studentId,
  taskNumber,
  levelId,
  questionId,
  initialDurationMs = 0,
  baselineReady = true,
  enabled = true,
} = {}) => {
  const timerRef = useRef(null);
  const baselineReadyByKeyRef = useRef(new Map());
  if (timerRef.current === null) timerRef.current = new ActiveQuestionSolveTimer();

  const hasActiveQuestionKey = Boolean(String(questionKey || '').trim());
  const identityKey = hasActiveQuestionKey
    ? buildQuestionSolveTimerStorageKey({
        studentId,
        taskNumber,
        levelId,
        questionId,
      })
    : '';
  const timerKey = identityKey || getFallbackTimerKey(questionKey);
  const isBaselineReady = baselineReady !== false;

  useEffect(() => {
    const timer = timerRef.current;
    timer.setEnvironmentActive(isQuestionSolveEnvironmentActive());
    if (!timerKey) {
      timer.activate('');
      return () => timer.checkpoint();
    }
    if (!enabled) {
      timer.clear(timerKey);
      baselineReadyByKeyRef.current.delete(timerKey);
      return () => {};
    }

    const previousBaselineReady = baselineReadyByKeyRef.current.get(timerKey);
    timer.activate(timerKey, isBaselineReady ? initialDurationMs : 0, {
      baselineMode: isBaselineReady && previousBaselineReady === false ? 'late' : 'max',
    });
    baselineReadyByKeyRef.current.set(timerKey, isBaselineReady);
    return () => timer.checkpoint();
  }, [timerKey, initialDurationMs, isBaselineReady, enabled]);

  useEffect(() => subscribeQuestionSolveEnvironment((active) => {
    timerRef.current?.setEnvironmentActive(active);
  }), []);

  const getElapsedMs = useCallback(
    () => timerRef.current?.getElapsedMs(timerKey) || 0,
    [timerKey]
  );
  const pause = useCallback(() => timerRef.current?.pause(), []);
  const resume = useCallback(() => timerRef.current?.resume(), []);
  const clear = useCallback(() => timerRef.current?.clear(timerKey), [timerKey]);
  const acknowledge = useCallback(
    (durationMs = getElapsedMs()) => timerRef.current?.acknowledgeBaseline(durationMs, timerKey),
    [getElapsedMs, timerKey]
  );

  return useMemo(() => ({
    getElapsedMs,
    pause,
    resume,
    clear,
    acknowledge,
    storageKey: timerKey,
  }), [getElapsedMs, pause, resume, clear, acknowledge, timerKey]);
};

export default useQuestionSolveTimer;
