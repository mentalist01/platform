import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ListChecks,
  PlayCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';

const DEFAULT_LEVEL_OPTIONS = [
  { id: 'basic', label: 'Базовый' },
  { id: 'advanced', label: 'Продвинутый' },
];

const getGenerationStages = (levelId) => [
  { progress: 11, delay: 180, label: 'Смотрим историю решений' },
  { progress: 32, delay: 600, label: 'Выбираем нерешённые задания' },
  {
    progress: 56,
    delay: 1080,
    label: levelId === 'advanced'
      ? 'Собираем продвинутый уровень'
      : 'Собираем базовый уровень',
  },
  { progress: 78, delay: 1580, label: 'Проверяем каждый номер' },
  { progress: 94, delay: 2020, label: 'Готовим пробник к старту' },
];

const READY_STAGE = { progress: 100, label: 'Пробник готов' };
const MOCK_TASK_COUNT = 27;
const SUCCESS_SPARK_COUNT = 10;
const BUILDER_PARTICLE_COUNT = 5;

const joinClasses = (...values) => values.filter(Boolean).join(' ');

const wait = (duration) => new Promise((resolve) => {
  window.setTimeout(resolve, Math.max(0, duration));
});

const getErrorMessage = (error) => {
  const message = String(error?.message || error || '').trim();
  return message || 'Не удалось собрать пробник. Попробуйте ещё раз.';
};

const toSafeCount = (value) => {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
};

const getRussianCountLabel = (count, [one, few, many]) => {
  const absolute = Math.abs(Number(count) || 0) % 100;
  const lastDigit = absolute % 10;
  if (absolute > 10 && absolute < 20) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
};

const getDefaultSummary = (result) => {
  const source = result?.summary || result?.selection || result?.stats || result || {};
  const inferredExamTaskCount = result?.exam?.tasks && typeof result.exam.tasks === 'object'
    ? Object.keys(result.exam.tasks).length
    : null;
  return {
    newCount: toSafeCount(
      source.newCount
      ?? source.unseenCount
      ?? source.unsolvedCount
      ?? source.freshCount
    ),
    repeatCount: toSafeCount(
      source.repeatCount
      ?? source.repeatedCount
      ?? source.solvedFallbackCount
      ?? source.reviewCount
    ),
    totalCount: toSafeCount(
      source.totalCount
      ?? source.taskCount
      ?? source.questionsCount
      ?? result?.exam?.taskCount
      ?? inferredExamTaskCount
    ),
  };
};

const usePrefersReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReducedMotion(media.matches);
    handleChange();
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  return reducedMotion;
};

/**
 * Props:
 * - onGenerate({ signal, levelId }): Promise<result> — creates a personal mock exam.
 * - onGenerated(result): optional notification after successful generation.
 * - onStart(result): optional callback for opening the generated exam.
 * - getSummary(result): optional mapper to { newCount, repeatCount, totalCount }.
 * - onError(error), onOpen(), onClose(reason): optional lifecycle callbacks.
 * - disabled, className, taskCount, minLoadingMs, completionDelayMs: UI options.
 */
const RandomMockGenerator = ({
  onGenerate,
  onGenerated,
  onStart,
  getSummary = getDefaultSummary,
  onError,
  onOpen,
  onClose,
  disabled = false,
  className = '',
  taskCount = null,
  minLoadingMs = 2400,
  completionDelayMs = 760,
  eyebrow = 'Новый вариант',
  title = 'Собрать персональный пробник',
  description = 'По одному заданию каждого типа выбранного уровня',
  buttonLabel = 'Собрать пробник',
}) => {
  const [selectedLevelId, setSelectedLevelId] = useState('basic');
  const [generationLevelId, setGenerationLevelId] = useState('basic');
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [startError, setStartError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const startRunIdRef = useRef(0);
  const stageTimersRef = useRef([]);
  const reducedMotion = usePrefersReducedMotion();
  const instanceId = useId().replace(/:/g, '');
  const titleId = `random-mock-generator-title-${instanceId}`;
  const descriptionId = `random-mock-generator-description-${instanceId}`;
  const builderTitleId = `random-mock-builder-title-${instanceId}`;
  const levelGroupName = `random-mock-level-${instanceId}`;

  const selectedLevel = DEFAULT_LEVEL_OPTIONS.find((option) => option.id === selectedLevelId)
    || DEFAULT_LEVEL_OPTIONS[0];
  const generationLevel = DEFAULT_LEVEL_OPTIONS.find((option) => option.id === generationLevelId)
    || DEFAULT_LEVEL_OPTIONS[0];
  const generationStages = useMemo(
    () => getGenerationStages(generationLevel.id),
    [generationLevel.id]
  );

  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    stageTimersRef.current = [];
  }, []);

  const resetState = useCallback(() => {
    clearStageTimers();
    setView('idle');
    setProgress(0);
    setStageIndex(0);
    setResult(null);
    setErrorMessage('');
    setStartError('');
    setIsStarting(false);
  }, [clearStageTimers]);

  const closeModal = useCallback((reason = 'close') => {
    requestIdRef.current += 1;
    startRunIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsOpen(false);
    resetState();
    onClose?.(reason);
    if (reason !== 'start') {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [onClose, resetState]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    startRunIdRef.current += 1;
    abortControllerRef.current?.abort();
    clearStageTimers();
  }, [clearStageTimers]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const appRoot = document.getElementById('root');
    const previousRootInert = appRoot?.inert || false;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
    if (appRoot) appRoot.inert = true;
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      if (appRoot) appRoot.inert = previousRootInert;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const focusTimer = window.setTimeout(() => {
      if (!dialogRef.current?.contains(document.activeElement)) closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(view === 'loading' ? 'cancel-loading' : 'escape');
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeModal, isOpen, view]);

  const startGeneration = useCallback(async () => {
    if (disabled || typeof onGenerate !== 'function') return;
    const levelId = selectedLevel.id;

    clearStageTimers();
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setResult(null);
    setErrorMessage('');
    setStartError('');
    setGenerationLevelId(levelId);
    setProgress(reducedMotion ? 18 : 6);
    setStageIndex(0);
    setView('loading');

    const stages = getGenerationStages(levelId);
    stages.forEach((stage, index) => {
      const timerId = window.setTimeout(() => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setStageIndex(index);
        setProgress((current) => Math.max(current, stage.progress));
      }, stage.delay);
      stageTimersRef.current.push(timerId);
    });

    try {
      const generationPromise = Promise.resolve(onGenerate({
        signal: controller.signal,
        levelId,
      }));
      const loadingFloor = reducedMotion ? Promise.resolve() : wait(minLoadingMs);
      const [generated] = await Promise.all([generationPromise, loadingFloor]);
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;

      clearStageTimers();
      setResult(generated);
      setStageIndex(stages.length);
      setProgress(READY_STAGE.progress);
      if (!reducedMotion) await wait(completionDelayMs);
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;

      setView('success');
      try {
        onGenerated?.(generated);
      } catch (callbackError) {
        onError?.(callbackError, { phase: 'onGenerated' });
      }
    } catch (error) {
      if (requestIdRef.current !== requestId || controller.signal.aborted || error?.name === 'AbortError') return;
      clearStageTimers();
      setErrorMessage(getErrorMessage(error));
      setView('error');
      onError?.(error, { phase: 'generate' });
    } finally {
      if (requestIdRef.current === requestId) abortControllerRef.current = null;
    }
  }, [
    clearStageTimers,
    completionDelayMs,
    disabled,
    minLoadingMs,
    onError,
    onGenerate,
    onGenerated,
    reducedMotion,
    selectedLevel.id,
  ]);

  const openGenerator = useCallback(() => {
    if (disabled || typeof onGenerate !== 'function') return;
    setIsOpen(true);
    onOpen?.();
    startGeneration();
  }, [disabled, onGenerate, onOpen, startGeneration]);

  const handleStart = useCallback(async () => {
    if (!onStart) {
      closeModal('done');
      return;
    }
    const startRunId = startRunIdRef.current + 1;
    startRunIdRef.current = startRunId;
    setIsStarting(true);
    setStartError('');
    try {
      await onStart(result);
      if (startRunIdRef.current !== startRunId) return;
      closeModal('start');
    } catch (error) {
      if (startRunIdRef.current !== startRunId) return;
      setStartError(getErrorMessage(error));
      onError?.(error, { phase: 'start' });
    } finally {
      if (startRunIdRef.current === startRunId) setIsStarting(false);
    }
  }, [closeModal, onError, onStart, result]);

  const summary = useMemo(() => {
    try {
      return getSummary?.(result) || {};
    } catch {
      return getDefaultSummary(result);
    }
  }, [getSummary, result]);

  const currentStage = stageIndex >= generationStages.length
    ? READY_STAGE
    : generationStages[stageIndex];
  const accessibleStageIndex = stageIndex >= generationStages.length - 1
    ? generationStages.length - 1
    : (stageIndex >= 2 ? 2 : 0);
  const accessibleStageLabel = generationStages[accessibleStageIndex]?.label || currentStage.label;
  const safeTaskCount = toSafeCount(taskCount);
  const displaySummary = {
    ...summary,
    totalCount: summary.totalCount ?? safeTaskCount,
  };
  const hasSummary = [displaySummary.newCount, displaySummary.repeatCount, displaySummary.totalCount]
    .some((value) => value !== null && value !== undefined);
  const activeTaskNodes = Math.round((progress / 100) * MOCK_TASK_COUNT);
  const cannotGenerate = disabled || typeof onGenerate !== 'function';

  const modal = isOpen && typeof document !== 'undefined'
    ? createPortal((
        <div
          className="mock-random-generation fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-md sm:items-center sm:p-4"
          data-level={generationLevel.id}
          data-view={view}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && view !== 'loading') closeModal('backdrop');
          }}
        >
          <div className="mock-random-generation__field" aria-hidden="true">
            <span className="mock-random-generation__field-grid" />
            <span className="mock-random-generation__halo mock-random-generation__halo--outer" />
            <span className="mock-random-generation__halo mock-random-generation__halo--inner" />
            <span className="mock-random-generation__ray mock-random-generation__ray--one" />
            <span className="mock-random-generation__ray mock-random-generation__ray--two" />
            <span className="mock-random-generation__ray mock-random-generation__ray--three" />
            <span className="mock-random-generation__field-orbit mock-random-generation__field-orbit--one" />
            <span className="mock-random-generation__field-orbit mock-random-generation__field-orbit--two" />
          </div>

          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-busy={view === 'loading'}
            tabIndex={-1}
            className={joinClasses(
              'mock-random-generation__card relative isolate my-auto w-full max-w-[36rem] overflow-hidden rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:p-6',
              `mock-random-generation__card--${view}`
            )}
            data-level={generationLevel.id}
            data-stage={stageIndex}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mock-random-generation__card-glow" aria-hidden="true" />
            <div className="mock-random-generation__card-sheen" aria-hidden="true" />
            <div className="mock-random-generation__card-scan" aria-hidden="true" />

            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => closeModal(view === 'loading' ? 'cancel-loading' : 'close-button')}
              className="mock-random-generation__close absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-wait disabled:opacity-45 sm:right-4 sm:top-4"
              aria-label={view === 'loading' ? 'Отменить сборку' : (isStarting ? 'Закрыть, не дожидаясь открытия' : 'Закрыть')}
            >
              <X size={18} />
            </button>

            <div className="relative z-10">
              <div className="mock-random-generation__eyebrow-row flex flex-wrap items-center gap-2">
                <div className="mock-random-generation__eyebrow inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
                  <Sparkles size={13} />
                  Персональная подборка
                </div>
                <span
                  className="mock-random-generation__level-pill inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black"
                  data-level={generationLevel.id}
                >
                  {generationLevel.label}
                </span>
              </div>

              {view === 'success' ? (
                <div className="mock-random-generation__result mt-5">
                  <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                    Пробник готов. Можно начинать.
                  </span>
                  <div className="mock-random-generation__success-stage" aria-hidden="true">
                    <span className="mock-random-generation__success-wave mock-random-generation__success-wave--one" />
                    <span className="mock-random-generation__success-wave mock-random-generation__success-wave--two" />
                    <span className="mock-random-generation__success-orbit" />
                    {Array.from({ length: SUCCESS_SPARK_COUNT }, (_, index) => (
                      <span
                        key={index}
                        className="mock-random-generation__success-spark"
                        style={{ '--success-spark-index': index }}
                      />
                    ))}
                    <div className="mock-random-generation__success-icon flex h-16 w-16 items-center justify-center rounded-full text-emerald-600">
                      <CheckCircle2 size={32} strokeWidth={2.4} />
                    </div>
                  </div>
                  <h2 id={titleId} className="mock-random-generation__success-title mt-5 text-2xl font-black leading-tight text-slate-950 sm:text-[1.7rem]">
                    Пробник собран
                  </h2>

                  {hasSummary && <div id={descriptionId} className="mock-random-generation__summary mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {displaySummary.newCount !== null && displaySummary.newCount !== undefined && (
                      <div className="mock-random-generation__summary-item mock-random-generation__summary-item--new rounded-2xl border border-sky-200/70 bg-sky-50/80 p-3 text-sky-700" style={{ '--summary-index': 0 }}>
                        <span className="mock-random-generation__summary-icon"><Sparkles size={16} /></span>
                        <strong>{displaySummary.newCount}</strong>
                        <span>{getRussianCountLabel(displaySummary.newCount, ['новое', 'новых', 'новых'])}</span>
                      </div>
                    )}
                    {displaySummary.repeatCount !== null && displaySummary.repeatCount !== undefined && (
                      <div className="mock-random-generation__summary-item mock-random-generation__summary-item--repeat rounded-2xl border border-violet-200/70 bg-violet-50/80 p-3 text-violet-700" style={{ '--summary-index': 1 }}>
                        <span className="mock-random-generation__summary-icon"><RefreshCw size={16} /></span>
                        <strong>{displaySummary.repeatCount}</strong>
                        <span>{displaySummary.repeatCount === 0 ? 'без повторов' : 'на повторение'}</span>
                      </div>
                    )}
                    {displaySummary.totalCount !== null && displaySummary.totalCount !== undefined && (
                      <div className="mock-random-generation__summary-item mock-random-generation__summary-item--total col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700 sm:col-span-1" style={{ '--summary-index': 2 }}>
                        <span className="mock-random-generation__summary-icon"><ListChecks size={16} /></span>
                        <strong>{displaySummary.totalCount}</strong>
                        <span>{getRussianCountLabel(displaySummary.totalCount, ['задание', 'задания', 'заданий'])}</span>
                      </div>
                    )}
                  </div>}

                  {startError && (
                    <div className="mock-random-generation__start-error mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm" role="alert">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} />
                      <span>{startError}</span>
                    </div>
                  )}

                  <div className="mock-random-generation__actions mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => closeModal('stay')}
                      disabled={isStarting}
                      className="mock-random-generation__secondary-button min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-60"
                    >
                      Остаться здесь
                    </button>
                    <button
                      type="button"
                      onClick={handleStart}
                      disabled={isStarting}
                      className="mock-random-generation__primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-75"
                    >
                      {isStarting ? <RefreshCw className={reducedMotion ? '' : 'animate-spin'} size={17} /> : <PlayCircle size={17} />}
                      {onStart ? (isStarting ? 'Открываем…' : 'Начать пробник') : 'Готово'}
                      {!isStarting && <ArrowRight size={16} />}
                    </button>
                  </div>
                </div>
              ) : view === 'error' ? (
                <div className="mock-random-generation__result mock-random-generation__result--error mt-5">
                  <div className="mock-random-generation__error-icon flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600">
                    <AlertCircle size={28} />
                  </div>
                  <h2 id={titleId} className="mt-4 text-2xl font-black leading-tight text-slate-950 sm:text-[1.7rem]">
                    Не удалось собрать пробник
                  </h2>
                  <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-slate-500" role="alert">
                    {errorMessage}
                  </p>
                  <div className="mock-random-generation__actions mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => closeModal('cancel-error')}
                      className="mock-random-generation__secondary-button min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      Закрыть
                    </button>
                    <button
                      type="button"
                      onClick={startGeneration}
                      className="mock-random-generation__primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
                    >
                      <RefreshCw size={17} />
                      Попробовать ещё раз
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mock-random-generation__loading mt-5">
                  <div className="mock-random-generation__loading-layout">
                    <div className="mock-random-generation__engine" aria-hidden="true">
                      <span className="mock-random-generation__engine-aura" />
                      <span className="mock-random-generation__engine-scan" />
                      <span className="mock-random-generation__engine-ring mock-random-generation__engine-ring--outer" />
                      <span className="mock-random-generation__engine-ring mock-random-generation__engine-ring--inner" />
                      <div className="mock-random-generation__task-orbit">
                        {Array.from({ length: MOCK_TASK_COUNT }, (_, index) => (
                          <span
                            key={index}
                            className={joinClasses(
                              'mock-random-generation__task-node',
                              index < activeTaskNodes && 'is-active'
                            )}
                            style={{
                              '--task-node-angle': `${index * (360 / MOCK_TASK_COUNT)}deg`,
                              '--task-node-index': index,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mock-random-generation__engine-core">
                        <span className="mock-random-generation__engine-core-pulse" />
                        <BookOpen size={25} />
                        <strong>{`${Math.round(progress)}%`}</strong>
                      </div>
                    </div>

                    <div className="mock-random-generation__loading-copy min-w-0">
                      <h2 id={titleId} className="text-2xl font-black leading-tight text-slate-950 sm:text-[1.7rem]">
                        Собираем ваш пробник
                      </h2>
                      <div className="mock-random-generation__stage-counter mt-3" aria-hidden="true">
                        {generationStages.map((stage, index) => (
                          <span
                            key={stage.label}
                            className={joinClasses(
                              'mock-random-generation__stage-dot',
                              index <= stageIndex && 'is-active',
                              index === stageIndex && 'is-current'
                            )}
                          />
                        ))}
                      </div>
                      <div
                        key={`${stageIndex}-${currentStage.label}`}
                        className="mock-random-generation__status mt-4 min-w-0 text-sm font-bold text-slate-700"
                        aria-hidden="true"
                      >
                        {currentStage.label}
                      </div>
                      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                        {accessibleStageLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mock-random-generation__selection mt-6 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mock-random-generation__progress-head flex items-center justify-between gap-3">
                      <span>Сборка варианта</span>
                      <strong>{`${activeTaskNodes} / ${MOCK_TASK_COUNT}`}</strong>
                    </div>
                    <div
                      className="mock-random-generation__progress mt-3 h-2 rounded-full bg-slate-200"
                      role="progressbar"
                      aria-label={currentStage.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress)}
                      aria-valuetext={`${currentStage.label}: ${Math.round(progress)}%`}
                      style={{ '--progress-position': `${Math.max(0, Math.min(100, progress))}%` }}
                    >
                      <span className="mock-random-generation__progress-clip" aria-hidden="true">
                        <span
                          className="mock-random-generation__progress-fill relative block h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-violet-600"
                          style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }}
                        />
                      </span>
                      <span className="mock-random-generation__progress-energy" aria-hidden="true" />
                    </div>
                  </div>

                </div>
              )}
            </div>
          </section>
        </div>
      ), document.body)
    : null;

  return (
    <>
      <section
        className={joinClasses(
          'mock-random-builder relative isolate overflow-hidden rounded-[22px] border border-sky-200/70 bg-white/90 p-4 shadow-sm sm:p-5',
          cannotGenerate && 'mock-random-builder--disabled',
          className
        )}
        aria-labelledby={builderTitleId}
        data-level={selectedLevel.id}
      >
        <div className="mock-random-builder__visual-field" aria-hidden="true">
          <span className="mock-random-builder__aurora mock-random-builder__aurora--primary" />
          <span className="mock-random-builder__aurora mock-random-builder__aurora--secondary" />
          <span className="mock-random-builder__spectrum" />
          <span className="mock-random-builder__scan" />
          <span className="mock-random-builder__blueprint">
            {Array.from({ length: MOCK_TASK_COUNT }, (_, index) => (
              <i key={index} style={{ '--builder-node-index': index }} />
            ))}
          </span>
          {Array.from({ length: BUILDER_PARTICLE_COUNT }, (_, index) => (
            <span
              key={index}
              className="mock-random-builder__particle"
              style={{ '--builder-particle-index': index }}
            />
          ))}
        </div>
        <div className="mock-random-builder__grid relative z-10 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="mock-random-builder__icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-sky-700" aria-hidden="true">
            <span className="mock-random-builder__icon-glow" />
            <span className="mock-random-builder__icon-orbit mock-random-builder__icon-orbit--one" />
            <span className="mock-random-builder__icon-orbit mock-random-builder__icon-orbit--two" />
            <span className="mock-random-builder__icon-core">
              <span className="mock-random-builder__icon-symbol" data-active={selectedLevel.id === 'basic' ? 'true' : 'false'}>
                <BookOpen size={21} />
              </span>
              <span className="mock-random-builder__icon-symbol" data-active={selectedLevel.id === 'advanced' ? 'true' : 'false'}>
                <Sparkles size={22} />
              </span>
            </span>
          </div>

          <div className="mock-random-builder__content min-w-0 flex-1">
            <div className="mock-random-builder__eyebrow text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
              {eyebrow}
            </div>
            <h3 id={builderTitleId} className="mock-random-builder__title mt-1 text-lg font-black leading-tight text-slate-950 sm:text-xl">
              {title}
            </h3>
            <p className="mock-random-builder__description mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
              {description}
            </p>
            <div className="mock-random-builder__tools mt-3 flex flex-wrap items-center gap-2.5">
              <fieldset className="mock-random-builder__level-field min-w-0">
                <legend className="sr-only">Уровень пробника</legend>
                <div className="mock-random-builder__level-switch" data-level={selectedLevel.id}>
                  <span className="mock-random-builder__level-indicator" aria-hidden="true">
                    <span className="mock-random-builder__level-indicator-glow" />
                  </span>
                  {DEFAULT_LEVEL_OPTIONS.map((option) => {
                    const isAdvanced = option.id === 'advanced';
                    return (
                      <label
                        key={option.id}
                        className="mock-random-builder__level-label"
                        data-level={option.id}
                        data-selected={option.id === selectedLevel.id ? 'true' : 'false'}
                        data-disabled={cannotGenerate ? 'true' : 'false'}
                      >
                        <input
                          type="radio"
                          name={levelGroupName}
                          value={option.id}
                          checked={option.id === selectedLevel.id}
                          onChange={() => setSelectedLevelId(option.id)}
                          disabled={cannotGenerate}
                          className="mock-random-builder__level-input sr-only"
                        />
                        <span className="mock-random-builder__level-option">
                          <span className="mock-random-builder__level-icon">
                            {isAdvanced ? <Sparkles size={13} /> : <BookOpen size={13} />}
                          </span>
                          <span>{option.label}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="mock-random-builder__meta flex flex-wrap items-center gap-1.5">
                <span className="mock-random-builder__chip mock-random-builder__chip--priority inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                  <ListChecks size={13} />
                  Нерешённые — в приоритете
                </span>
                {safeTaskCount !== null && (
                  <span className="mock-random-builder__chip inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    <BookOpen size={13} />
                    {`${safeTaskCount} ${getRussianCountLabel(safeTaskCount, ['задание', 'задания', 'заданий'])}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            ref={triggerRef}
            type="button"
            onClick={openGenerator}
            disabled={cannotGenerate}
            aria-haspopup="dialog"
            className="mock-random-builder__button group inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 md:w-auto"
          >
            <span className="mock-random-builder__button-glow" aria-hidden="true" />
            <span className="mock-random-builder__button-sheen" aria-hidden="true" />
            <span className="mock-random-builder__button-orbit" aria-hidden="true" />
            <Sparkles className="relative z-10" size={17} />
            <span className="relative z-10">{buttonLabel}</span>
            <ArrowRight className="mock-random-builder__button-arrow relative z-10" size={16} />
          </button>
        </div>
      </section>
      {modal}
    </>
  );
};

export default RandomMockGenerator;
