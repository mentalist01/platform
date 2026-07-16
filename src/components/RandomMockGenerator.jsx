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

const DEFAULT_STAGES = [
  { progress: 12, delay: 180, label: 'Смотрим историю решений' },
  { progress: 34, delay: 540, label: 'Выбираем нерешённые задания' },
  { progress: 57, delay: 940, label: 'Собираем базовый уровень' },
  { progress: 76, delay: 1360, label: 'Проверяем каждый номер' },
  { progress: 92, delay: 1780, label: 'Готовим пробник к старту' },
];

const READY_STAGE = { progress: 100, label: 'Пробник готов' };
const PROGRESS_CELL_COUNT = 12;

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
 * - onGenerate({ signal }): Promise<result> — creates a personal mock exam.
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
  minLoadingMs = 2100,
  completionDelayMs = 320,
  eyebrow = 'Новый вариант',
  title = 'Собрать персональный пробник',
  description = 'По одному заданию каждого типа из базового уровня',
  buttonLabel = 'Собрать пробник',
}) => {
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
  const stageTimersRef = useRef([]);
  const reducedMotion = usePrefersReducedMotion();
  const instanceId = useId().replace(/:/g, '');
  const titleId = `random-mock-generator-title-${instanceId}`;
  const descriptionId = `random-mock-generator-description-${instanceId}`;
  const builderTitleId = `random-mock-builder-title-${instanceId}`;

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
    abortControllerRef.current?.abort();
    clearStageTimers();
  }, [clearStageTimers]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const focusTimer = window.setTimeout(() => {
      if (view === 'loading' || isStarting) dialogRef.current?.focus();
      else closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (view !== 'loading' && !isStarting) closeModal('escape');
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
  }, [closeModal, isOpen, isStarting, view]);

  const startGeneration = useCallback(async () => {
    if (disabled || typeof onGenerate !== 'function') return;

    clearStageTimers();
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setResult(null);
    setErrorMessage('');
    setStartError('');
    setProgress(reducedMotion ? 18 : 6);
    setStageIndex(0);
    setView('loading');

    DEFAULT_STAGES.forEach((stage, index) => {
      const timerId = window.setTimeout(() => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setStageIndex(index);
        setProgress((current) => Math.max(current, stage.progress));
      }, stage.delay);
      stageTimersRef.current.push(timerId);
    });

    try {
      const generationPromise = Promise.resolve(onGenerate({ signal: controller.signal }));
      const loadingFloor = reducedMotion ? Promise.resolve() : wait(minLoadingMs);
      const [generated] = await Promise.all([generationPromise, loadingFloor]);
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;

      clearStageTimers();
      setResult(generated);
      setStageIndex(DEFAULT_STAGES.length);
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
  ]);

  const openGenerator = useCallback(() => {
    if (disabled || typeof onGenerate !== 'function') return;
    setIsOpen(true);
    onOpen?.();
    window.requestAnimationFrame(() => {
      startGeneration();
    });
  }, [disabled, onGenerate, onOpen, startGeneration]);

  const handleStart = useCallback(async () => {
    if (!onStart) {
      closeModal('done');
      return;
    }
    setIsStarting(true);
    setStartError('');
    try {
      await onStart(result);
      closeModal('start');
    } catch (error) {
      setStartError(getErrorMessage(error));
      onError?.(error, { phase: 'start' });
    } finally {
      setIsStarting(false);
    }
  }, [closeModal, onError, onStart, result]);

  const summary = useMemo(() => {
    try {
      return getSummary?.(result) || {};
    } catch {
      return getDefaultSummary(result);
    }
  }, [getSummary, result]);

  const currentStage = stageIndex >= DEFAULT_STAGES.length
    ? READY_STAGE
    : DEFAULT_STAGES[stageIndex];
  const safeTaskCount = toSafeCount(taskCount);
  const displaySummary = {
    ...summary,
    totalCount: summary.totalCount ?? safeTaskCount,
  };
  const hasSummary = [displaySummary.newCount, displaySummary.repeatCount, displaySummary.totalCount]
    .some((value) => value !== null && value !== undefined);
  const activeProgressCells = Math.round((progress / 100) * PROGRESS_CELL_COUNT);
  const cannotGenerate = disabled || typeof onGenerate !== 'function';

  const modal = isOpen && typeof document !== 'undefined'
    ? createPortal((
        <div
          className="mock-random-generation fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-md sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && view !== 'loading' && !isStarting) closeModal('backdrop');
          }}
        >
          <div className="mock-random-generation__field" aria-hidden="true">
            <span className="mock-random-generation__halo" />
            <span className="mock-random-generation__ray mock-random-generation__ray--one" />
            <span className="mock-random-generation__ray mock-random-generation__ray--two" />
          </div>

          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            aria-busy={view === 'loading'}
            tabIndex={-1}
            className={joinClasses(
              'mock-random-generation__card relative isolate my-auto w-full max-w-[36rem] overflow-hidden rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:p-6',
              `mock-random-generation__card--${view}`
            )}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mock-random-generation__card-glow" aria-hidden="true" />
            <div className="mock-random-generation__card-sheen" aria-hidden="true" />

            {view !== 'loading' && (
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => closeModal('close-button')}
                disabled={isStarting}
                className="mock-random-generation__close absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-wait disabled:opacity-45 sm:right-4 sm:top-4"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            )}

            <div className="relative z-10">
              <div className="mock-random-generation__eyebrow inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
                <Sparkles size={13} />
                Персональная подборка
              </div>

              {view === 'success' ? (
                <div className="mock-random-generation__result mt-5">
                  <div className="mock-random-generation__success-icon flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={28} />
                  </div>
                  <h2 id={titleId} className="mt-4 text-2xl font-black leading-tight text-slate-950 sm:text-[1.7rem]">
                    Пробник собран
                  </h2>

                  {hasSummary && <div id={descriptionId} className="mock-random-generation__summary mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {displaySummary.newCount !== null && displaySummary.newCount !== undefined && (
                      <div className="mock-random-generation__summary-item mock-random-generation__summary-item--new rounded-2xl border border-sky-200/70 bg-sky-50/80 p-3 text-sky-700">
                        <Sparkles size={16} />
                        <strong>{displaySummary.newCount}</strong>
                        <span>{getRussianCountLabel(displaySummary.newCount, ['новое', 'новых', 'новых'])}</span>
                      </div>
                    )}
                    {displaySummary.repeatCount !== null && displaySummary.repeatCount !== undefined && (
                      <div className="mock-random-generation__summary-item mock-random-generation__summary-item--repeat rounded-2xl border border-violet-200/70 bg-violet-50/80 p-3 text-violet-700">
                        <RefreshCw size={16} />
                        <strong>{displaySummary.repeatCount}</strong>
                        <span>{displaySummary.repeatCount === 0 ? 'без повторов' : 'на повторение'}</span>
                      </div>
                    )}
                    {displaySummary.totalCount !== null && displaySummary.totalCount !== undefined && (
                      <div className="mock-random-generation__summary-item mock-random-generation__summary-item--total col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700 sm:col-span-1">
                        <ListChecks size={16} />
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
                <div className="mock-random-generation__result mt-5">
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
                  <div className="mock-random-generation__loading-head flex items-start gap-3.5">
                    <div className="mock-random-generation__loading-icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700" aria-hidden="true">
                      <span className="mock-random-generation__loading-ring" />
                      <BookOpen size={24} />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <h2 id={titleId} className="text-2xl font-black leading-tight text-slate-950 sm:text-[1.7rem]">
                        Собираем ваш пробник
                      </h2>
                      <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-slate-500">
                        Сначала берём задания, которые вы ещё не решали. Повторы добавим только там, где новых не осталось.
                      </p>
                    </div>
                  </div>

                  <div className="mock-random-generation__selection mt-6 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mock-random-generation__cells grid grid-cols-6 gap-1.5 sm:grid-cols-12" aria-hidden="true">
                      {Array.from({ length: PROGRESS_CELL_COUNT }, (_, index) => (
                        <span
                          key={index}
                          className={joinClasses(
                            'mock-random-generation__cell h-2 rounded-full bg-slate-200',
                            index < activeProgressCells && 'is-active bg-gradient-to-r from-sky-400 to-violet-500'
                          )}
                          style={{ '--random-cell-index': index }}
                        />
                      ))}
                    </div>

                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div
                        key={`${stageIndex}-${currentStage.label}`}
                        className="mock-random-generation__status min-w-0 text-sm font-bold text-slate-700"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {currentStage.label}
                      </div>
                      <div className="mock-random-generation__percent shrink-0 text-sm font-black tabular-nums text-sky-700">
                        {`${Math.round(progress)}%`}
                      </div>
                    </div>

                    <div
                      className="mock-random-generation__progress mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-label={currentStage.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress)}
                    >
                      <span
                        className="mock-random-generation__progress-fill relative block h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-violet-600"
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                      />
                    </div>
                  </div>

                  <p className="mock-random-generation__loading-note mt-3 text-center text-[11px] font-semibold text-slate-400">
                    Обычно это занимает всего несколько секунд
                  </p>
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
      >
        <div className="mock-random-builder__aurora" aria-hidden="true" />
        <div className="mock-random-builder__grid relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="mock-random-builder__icon relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-200/70 bg-sky-50 text-sky-700" aria-hidden="true">
            <span className="mock-random-builder__icon-glow" />
            <Sparkles className="relative z-10" size={22} />
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
            <div className="mock-random-builder__meta mt-3 flex flex-wrap items-center gap-1.5">
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

          <button
            ref={triggerRef}
            type="button"
            onClick={openGenerator}
            disabled={cannotGenerate}
            aria-haspopup="dialog"
            className="mock-random-builder__button group inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            <span className="mock-random-builder__button-sheen" aria-hidden="true" />
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
