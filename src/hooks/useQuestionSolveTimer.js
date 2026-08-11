import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActiveQuestionSolveTimer,
  QUESTION_SOLVE_TIMER_STORAGE_PREFIX,
  buildQuestionSolveTimerStorageKey,
} from '../utils/questionSolveTimer.js';

export const isQuestionSolveEnvironmentActive = ({
  documentObject = typeof document === 'undefined' ? null : document,
} = {}) => {
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
  } = {}
) => {
  if (typeof onActiveChange !== 'function') return () => {};
  const disposers = [];
  const listen = (target, eventName, handler) => {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(eventName, handler);
    disposers.push(() => target.removeEventListener?.(eventName, handler));
  };
  const reportCurrent = () => onActiveChange(
    isQuestionSolveEnvironmentActive({ documentObject })
  );
  const reportInactive = () => onActiveChange(false);

  listen(documentObject, 'visibilitychange', reportCurrent);
  listen(windowObject, 'focus', reportCurrent);
  listen(windowObject, 'blur', reportInactive);
  listen(windowObject, 'pagehide', reportInactive);
  listen(windowObject, 'pageshow', reportCurrent);

  return () => disposers.forEach((dispose) => dispose());
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
