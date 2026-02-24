import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui';

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
}) => {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);
  const step = steps[stepIndex] || {};
  const hasSeen = user?.id ? Boolean(hasSeenTour?.(user.id)) : false;
  const canShowTour = Boolean(user && user.role === 'student' && !hasSeen);

  useEffect(() => {
    if (!canShowTour) return;
    const timer = setTimeout(() => {
      setOpen(true);
      setStepIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [canShowTour]);

  useEffect(() => {
    if (!open) return;
    if (step.view && step.view !== view) setView(step.view);
    if (typeof window === 'undefined') return;
    if (step.menu === 'open' && window.innerWidth < 768) setMenuOpen(true);
    if (step.menu === 'close' && window.innerWidth < 768) setMenuOpen(false);
  }, [open, stepIndex, step.view, step.menu, view, setView, setMenuOpen]);

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
      let el = targetSelector ? document.querySelector(targetSelector) : null;
      if (!el && fallbackSelector) el = document.querySelector(fallbackSelector);
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
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    return () => {
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
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

  return createPortal(
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-black/40" />
      {highlightRect && (
        <div
          className="absolute rounded-3xl ring-2 ring-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
          style={{
            top: Math.max(8, highlightRect.top),
            left: Math.max(8, highlightRect.left),
            width: Math.max(0, highlightRect.width),
            height: Math.max(0, highlightRect.height),
          }}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 sm:bottom-6 flex justify-center sm:justify-end">
        <div className="surface-card modal-card w-[min(520px,calc(100%-2rem))] rounded-3xl p-4 sm:p-5 mx-4 sm:mx-0 sm:mr-6">
          <div className="flex items-start gap-3">
            <img src={mascotSrc} alt="Маскот" className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-sm" />
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400">Шаг {stepIndex + 1} из {steps.length}</p>
              <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{step.text}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button type="button" onClick={() => finishTour(true)} className="text-sm text-gray-400 hover:text-gray-600">Пропустить</button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handlePrev} disabled={stepIndex === 0}>Назад</Button>
              <Button onClick={handleNext}>{isLast ? 'Готово' : 'Дальше'}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default StudentTour;
