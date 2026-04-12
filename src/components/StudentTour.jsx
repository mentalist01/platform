import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const findVisibleTourElement = (selector) => {
  if (!selector || typeof document === 'undefined') return null;
  const matches = Array.from(document.querySelectorAll(selector));
  return matches.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return Boolean(rect.width && rect.height);
  }) || null;
};

const getTourTargetElement = (targetSelector, fallbackSelector) => (
  findVisibleTourElement(targetSelector) || findVisibleTourElement(fallbackSelector)
);

const getTourScrollBlock = (element) => {
  if (!element || typeof window === 'undefined') return 'center';
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document?.documentElement?.clientHeight || 0;
  if (viewportHeight > 0 && rect.height >= viewportHeight * 0.55) return 'start';
  return 'center';
};

const getDialogPlacement = (highlightRect) => {
  if (typeof window === 'undefined') {
    return {
      anchorClass: 'left-3 right-3 bottom-3 sm:left-8 sm:right-auto sm:bottom-6',
      rowClass: 'flex-row',
      mascotClass: 'w-24 h-32 sm:w-48 sm:h-56',
    };
  }

  const viewportWidth = window.innerWidth || document?.documentElement?.clientWidth || 0;
  const viewportHeight = window.innerHeight || document?.documentElement?.clientHeight || 0;
  const centerX = highlightRect ? highlightRect.left + highlightRect.width / 2 : viewportWidth / 2;
  const centerY = highlightRect ? highlightRect.top + highlightRect.height / 2 : viewportHeight / 2;
  const placeTop = highlightRect && viewportHeight > 0 && centerY > viewportHeight * 0.52;
  const placeRight = highlightRect && viewportWidth >= 768 && centerX < viewportWidth * 0.5;

  if (viewportWidth < 640) {
    return {
      anchorClass: `left-3 right-3 ${placeTop ? 'top-3' : 'bottom-3'}`,
      rowClass: 'flex-row',
      mascotClass: 'w-24 h-32',
    };
  }

  return {
    anchorClass: `${placeTop ? 'top-6' : 'bottom-6'} ${placeRight ? 'right-8' : 'left-8'}`,
    rowClass: placeRight ? 'flex-row-reverse' : 'flex-row',
    mascotClass: 'w-44 h-52 lg:w-52 lg:h-60',
  };
};

const getDefaultDialogPlacement = () => getDialogPlacement(null);

const StudentTour = ({
  user,
  view,
  setView,
  menuOpen,
  setMenuOpen,
  onFinish,
  steps = [],
  hasSeenTour,
  markSeenTour,
  mascotImages = {},
  defaultMascot,
  enabled = true,
  onActiveChange,
}) => {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);
  const step = steps[stepIndex] || {};
  const hasSeen = user?.id ? Boolean(hasSeenTour?.(user.id)) : false;
  const canShowTour = Boolean(enabled && user && user.role === 'student' && !hasSeen);

  useEffect(() => {
    if (!canShowTour) return;
    const timer = setTimeout(() => {
      setOpen(true);
      setStepIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [canShowTour]);

  useEffect(() => {
    if (enabled) return undefined;
    const timer = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    onActiveChange?.(canShowTour);
    return () => onActiveChange?.(false);
  }, [canShowTour, onActiveChange]);

  useEffect(() => {
    if (!open) return;
    if (step.view && step.view !== view) setView(step.view);
    if (typeof window === 'undefined') return;
    if (step.menu === 'open' && window.innerWidth < 768) setMenuOpen(true);
    if (step.menu === 'close' && window.innerWidth < 768) setMenuOpen(false);
  }, [open, stepIndex, step.view, step.menu, view, setView, setMenuOpen]);

  useEffect(() => {
    if (!open || typeof window === 'undefined' || typeof document === 'undefined') return;
    const targetSelector = step.target;
    const fallbackSelector = step.fallback;
    const scrollToTarget = () => {
      const el = getTourTargetElement(targetSelector, fallbackSelector);
      if (!el) return;
      el.scrollIntoView({
        block: getTourScrollBlock(el),
        inline: 'nearest',
        behavior: 'smooth',
      });
    };
    const timeouts = [80, 240, 520].map((delay) => window.setTimeout(scrollToTarget, delay));
    return () => {
      timeouts.forEach((timer) => window.clearTimeout(timer));
    };
  }, [open, stepIndex, step.target, step.fallback, view, menuOpen]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const targetSelector = step.target;
    const fallbackSelector = step.fallback;
    let rafId = 0;
    const update = () => {
      if (!targetSelector && !fallbackSelector) {
        setHighlightRect(null);
        return;
      }
      const el = getTourTargetElement(targetSelector, fallbackSelector);
      if (!el) {
        setHighlightRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setHighlightRect(null);
        return;
      }
      const pad = 10;
      setHighlightRect({
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    schedule();
    const delayedUpdates = [160, 360, 700].map((delay) => setTimeout(schedule, delay));
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    return () => {
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      delayedUpdates.forEach((timer) => clearTimeout(timer));
      cancelAnimationFrame(rafId);
    };
  }, [open, stepIndex, view, menuOpen, step.target, step.fallback]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        markSeenTour?.(user?.id);
        onFinish?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, user?.id, onFinish, markSeenTour]);

  const finishTour = (markDone = true) => {
    setOpen(false);
    if (markDone) markSeenTour?.(user?.id);
    onFinish?.();
  };

  const handleNext = () => {
    if (stepIndex >= steps.length - 1) {
      finishTour(true);
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handlePrev = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  if (!steps.length) return null;
  if (!open || !canShowTour || !user || user.role !== 'student') return null;
  if (typeof document === 'undefined') return null;

  const mascotSrc = mascotImages[step.emotion] || defaultMascot;
  const isLast = stepIndex === steps.length - 1;
  const dialogPlacement = getDefaultDialogPlacement();
  const dialogSurfaceStyle = {
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.96))',
    color: '#f8fafc',
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000] pointer-events-none">
      {!highlightRect && <div className="absolute inset-0 bg-slate-950/70" />}
      {highlightRect && (
        <div
          className="absolute rounded-3xl ring-2 ring-white/95 pointer-events-none"
          style={{
            top: Math.max(8, highlightRect.top),
            left: Math.max(8, highlightRect.left),
            width: Math.max(0, highlightRect.width),
            height: Math.max(0, highlightRect.height),
            border: '1px solid rgba(255, 255, 255, 0.92)',
            outline: '2px solid rgba(250, 204, 21, 0.64)',
            outlineOffset: '4px',
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.76), 0 0 42px rgba(250, 204, 21, 0.45)',
          }}
        />
      )}
      <div className={`absolute z-10 pointer-events-auto ${dialogPlacement.anchorClass} sm:w-[min(920px,calc(100%-4rem))]`}>
        <div className={`flex ${dialogPlacement.rowClass} items-end gap-0 sm:gap-4`}>
          <div className={`relative shrink-0 ${dialogPlacement.mascotClass} -mb-3 sm:-mb-4`}>
            <img
              src={mascotSrc}
              alt="Маскот"
              className="absolute inset-x-0 bottom-0 h-full w-full object-contain drop-shadow-[0_22px_24px_rgba(0,0,0,0.45)]"
            />
          </div>
          <section
            role="dialog"
            aria-modal="true"
            aria-live="polite"
            className="relative min-w-0 flex-1 rounded-lg border-2 border-amber-300/90 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:px-6 sm:py-5"
            style={dialogSurfaceStyle}
          >
            <div className="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-amber-300" />
            <div className="pointer-events-none absolute right-3 top-3 h-5 w-5 border-r-2 border-t-2 border-amber-300" />
            <div className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-amber-300" />
            <div className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-amber-300" />

            <div className="relative z-10">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase text-amber-200/90">
                <span>Шаг {stepIndex + 1} из {steps.length}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span>Обучение</span>
              </div>
              <h3 className="text-xl font-extrabold leading-tight text-white sm:text-2xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-200 sm:text-base">{step.text}</p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => finishTour(true)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  Пропустить
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={stepIndex === 0}
                    className="rounded-lg border border-slate-500/80 bg-slate-900/60 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="rounded-lg border border-amber-300/80 bg-amber-400 px-5 py-2 text-sm font-extrabold text-slate-950 shadow-[0_8px_0_rgba(146,64,14,0.45)] transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 active:translate-y-[1px] active:shadow-none"
                  >
                    {isLast ? 'Готово' : 'Дальше'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default StudentTour;
