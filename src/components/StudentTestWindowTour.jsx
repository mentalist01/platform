import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const STUDENT_TEST_WINDOW_TOUR_KEY = 'student-test-window-tour-v3';
const TOUR_TARGET_PADDING = 8;
const TOUR_VIEWPORT_MARGIN = 12;
const TOUR_CARD_GAP = 16;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

const readTourStatus = () => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STUDENT_TEST_WINDOW_TOUR_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const hasSeenTour = (studentKey) => Boolean(readTourStatus()[studentKey]);

const markTourSeen = (studentKey) => {
  if (typeof window === 'undefined') return;
  try {
    const current = readTourStatus();
    window.localStorage.setItem(
      STUDENT_TEST_WINDOW_TOUR_KEY,
      JSON.stringify({ ...current, [studentKey]: true })
    );
  } catch {
    // The tour may repeat when storage is unavailable, but should never block the test.
  }
};

const findVisibleElement = (selector, fallbackSelector) => {
  if (typeof document === 'undefined') return null;
  const find = (value) => {
    if (!value) return null;
    return Array.from(document.querySelectorAll(value)).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || null;
  };
  return find(selector) || find(fallbackSelector);
};

const getScrollBlock = (element) => {
  if (!element || typeof window === 'undefined') return 'center';
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  if (viewportHeight > 0 && rect.height >= viewportHeight * 0.48) return 'center';
  if (rect.top < viewportHeight * 0.18) return 'start';
  if (rect.bottom > viewportHeight * 0.78) return 'end';
  return 'center';
};

const getHighlightRect = (element) => {
  if (!element || typeof window === 'undefined') return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const left = clamp(rect.left - TOUR_TARGET_PADDING, TOUR_VIEWPORT_MARGIN, viewportWidth - TOUR_VIEWPORT_MARGIN);
  const top = clamp(rect.top - TOUR_TARGET_PADDING, TOUR_VIEWPORT_MARGIN, viewportHeight - TOUR_VIEWPORT_MARGIN);
  const right = clamp(rect.right + TOUR_TARGET_PADDING, TOUR_VIEWPORT_MARGIN, viewportWidth - TOUR_VIEWPORT_MARGIN);
  const bottom = clamp(rect.bottom + TOUR_TARGET_PADDING, TOUR_VIEWPORT_MARGIN, viewportHeight - TOUR_VIEWPORT_MARGIN);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    right,
    bottom,
  };
};

const getCardPlacement = (highlightRect, cardSize) => {
  if (typeof window === 'undefined') {
    return { placement: 'center', top: 24, left: 24 };
  }
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const width = Math.min(cardSize.width || 390, Math.max(280, viewportWidth - TOUR_VIEWPORT_MARGIN * 2));
  const height = Math.min(cardSize.height || 250, Math.max(180, viewportHeight - TOUR_VIEWPORT_MARGIN * 2));

  if (!highlightRect) {
    return {
      placement: 'center',
      top: clamp((viewportHeight - height) / 2, TOUR_VIEWPORT_MARGIN, viewportHeight - height - TOUR_VIEWPORT_MARGIN),
      left: clamp((viewportWidth - width) / 2, TOUR_VIEWPORT_MARGIN, viewportWidth - width - TOUR_VIEWPORT_MARGIN),
    };
  }

  if (viewportWidth < 720) {
    const placeAtTop = highlightRect.top + highlightRect.height / 2 > viewportHeight * 0.52;
    return {
      placement: placeAtTop ? 'mobile-top' : 'mobile',
      top: placeAtTop
        ? TOUR_VIEWPORT_MARGIN
        : viewportHeight - height - TOUR_VIEWPORT_MARGIN,
      left: clamp((viewportWidth - width) / 2, TOUR_VIEWPORT_MARGIN, viewportWidth - width - TOUR_VIEWPORT_MARGIN),
    };
  }

  const spaces = {
    right: viewportWidth - highlightRect.right - TOUR_CARD_GAP - TOUR_VIEWPORT_MARGIN,
    left: highlightRect.left - TOUR_CARD_GAP - TOUR_VIEWPORT_MARGIN,
    below: viewportHeight - highlightRect.bottom - TOUR_CARD_GAP - TOUR_VIEWPORT_MARGIN,
    above: highlightRect.top - TOUR_CARD_GAP - TOUR_VIEWPORT_MARGIN,
  };
  const isWideTarget = highlightRect.width >= viewportWidth * 0.5;
  const order = isWideTarget
    ? ['below', 'above', 'right', 'left']
    : ['right', 'left', 'below', 'above'];
  const needed = { right: width, left: width, below: height, above: height };
  const placement = order.find((candidate) => spaces[candidate] >= needed[candidate])
    || order.reduce((best, candidate) => (spaces[candidate] > spaces[best] ? candidate : best), order[0]);

  if (placement === 'right' || placement === 'left') {
    return {
      placement,
      top: clamp(
        highlightRect.top + (highlightRect.height - height) / 2,
        TOUR_VIEWPORT_MARGIN,
        viewportHeight - height - TOUR_VIEWPORT_MARGIN
      ),
      left: placement === 'right'
        ? clamp(highlightRect.right + TOUR_CARD_GAP, TOUR_VIEWPORT_MARGIN, viewportWidth - width - TOUR_VIEWPORT_MARGIN)
        : clamp(highlightRect.left - width - TOUR_CARD_GAP, TOUR_VIEWPORT_MARGIN, viewportWidth - width - TOUR_VIEWPORT_MARGIN),
    };
  }

  return {
    placement,
    top: placement === 'below'
      ? clamp(highlightRect.bottom + TOUR_CARD_GAP, TOUR_VIEWPORT_MARGIN, viewportHeight - height - TOUR_VIEWPORT_MARGIN)
      : clamp(highlightRect.top - height - TOUR_CARD_GAP, TOUR_VIEWPORT_MARGIN, viewportHeight - height - TOUR_VIEWPORT_MARGIN),
    left: clamp(
      highlightRect.left + (highlightRect.width - width) / 2,
      TOUR_VIEWPORT_MARGIN,
      viewportWidth - width - TOUR_VIEWPORT_MARGIN
    ),
  };
};

const StudentTestWindowTour = ({
  studentId,
  enabled,
  steps,
  restartToken = 0,
}) => {
  const studentKey = String(studentId || 'student');
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [seen, setSeen] = useState(() => hasSeenTour(studentKey));
  const [highlightRect, setHighlightRect] = useState(null);
  const [cardSize, setCardSize] = useState({ width: 390, height: 250 });
  const cardRef = useRef(null);
  const targetRef = useRef(null);
  const returnFocusRef = useRef(null);
  const previousRestartTokenRef = useRef(restartToken);
  const activeStep = steps[stepIndex] || {};
  const isLastStep = stepIndex >= steps.length - 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSeen(hasSeenTour(studentKey));
      setOpen(false);
      setStepIndex(0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [studentKey]);

  useEffect(() => {
    if (!enabled || seen || !steps.length) return undefined;
    const timer = window.setTimeout(() => {
      returnFocusRef.current = document.activeElement;
      setStepIndex(0);
      setOpen(true);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [enabled, seen, steps.length]);

  useEffect(() => {
    if (restartToken === previousRestartTokenRef.current) return;
    previousRestartTokenRef.current = restartToken;
    if (!enabled || !steps.length) return;
    returnFocusRef.current = document.activeElement;
    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, restartToken, steps.length]);

  useEffect(() => {
    if (enabled || !open) return;
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, open]);

  const resolveTarget = useCallback(() => (
    findVisibleElement(activeStep.target, activeStep.fallback)
  ), [activeStep.fallback, activeStep.target]);

  const updateHighlight = useCallback(() => {
    const target = resolveTarget();
    targetRef.current = target;
    setHighlightRect(getHighlightRect(target));
  }, [resolveTarget]);

  useEffect(() => {
    if (!open) return undefined;
    const target = resolveTarget();
    targetRef.current = target;
    if (target) {
      target.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: getScrollBlock(target),
        inline: 'nearest',
      });
    }

    const timers = [0, 120, 300, 620].map((delay) => window.setTimeout(updateHighlight, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activeStep.target, open, resolveTarget, stepIndex, updateHighlight]);

  useEffect(() => {
    if (!open) return undefined;
    let frameId = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateHighlight);
    };
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);

    const targetObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(schedule)
      : null;
    if (targetRef.current) targetObserver?.observe(targetRef.current);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      targetObserver?.disconnect();
    };
  }, [open, updateHighlight]);

  useEffect(() => {
    if (!open || !cardRef.current) return undefined;
    const measureCard = () => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect?.height) return;
      setCardSize((current) => (
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height }
      ));
    };
    const timers = [0, 60, 180].map((delay) => window.setTimeout(measureCard, delay));
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measureCard)
      : null;
    observer?.observe(cardRef.current);
    window.addEventListener('resize', measureCard);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      observer?.disconnect();
      window.removeEventListener('resize', measureCard);
    };
  }, [activeStep.text, activeStep.title, open, stepIndex]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      cardRef.current?.querySelector('[data-student-test-tour-next]')?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, stepIndex]);

  const finishTour = useCallback(() => {
    markTourSeen(studentKey);
    setSeen(true);
    setOpen(false);
    window.requestAnimationFrame(() => {
      const replayButton = document.querySelector('[data-student-test-tour="replay"]');
      (replayButton || returnFocusRef.current)?.focus?.({ preventScroll: true });
    });
  }, [studentKey]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      finishTour();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [finishTour, isLastStep, steps.length]);

  const handlePrevious = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishTour();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePrevious();
      } else if (event.key === 'Tab') {
        const controls = Array.from(cardRef.current?.querySelectorAll('button:not(:disabled)') || []);
        if (!controls.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishTour, handleNext, handlePrevious, open]);

  const placement = useMemo(
    () => getCardPlacement(highlightRect, cardSize),
    [cardSize, highlightRect]
  );

  if (!open || !enabled || !steps.length || typeof document === 'undefined') return null;

  return createPortal(
    <div className="student-test-window-tour" role="presentation">
      {!highlightRect && <div className="student-test-window-tour__backdrop" />}
      {highlightRect && (
        <div
          className="student-test-window-tour__spotlight"
          aria-hidden="true"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            '--student-test-tour-accent': activeStep.accent || '#8b5cf6',
          }}
        />
      )}

      <section
        ref={cardRef}
        className="student-test-window-tour__card"
        data-placement={placement.placement}
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        aria-labelledby="student-test-window-tour-title"
        style={{
          top: placement.top,
          left: placement.left,
          '--student-test-tour-accent': activeStep.accent || '#8b5cf6',
        }}
      >
        <div className="student-test-window-tour__accent" aria-hidden="true" />
        <header className="student-test-window-tour__header">
          <span className="student-test-window-tour__icon" aria-hidden="true">
            <GraduationCap size={20} />
          </span>
          <span className="student-test-window-tour__eyebrow">
            Обучение · {stepIndex + 1} из {steps.length}
          </span>
          <button
            type="button"
            className="student-test-window-tour__close"
            onClick={finishTour}
            aria-label="Пропустить обучение"
            title="Пропустить"
          >
            <X size={17} />
          </button>
        </header>

        <div className="student-test-window-tour__copy">
          <h3 id="student-test-window-tour-title">{activeStep.title}</h3>
          <p>{activeStep.text}</p>
        </div>

        <div className="student-test-window-tour__progress" aria-hidden="true">
          {steps.map((step, index) => (
            <span
              key={`${step.title}-${index}`}
              className={index === stepIndex ? 'is-current' : (index < stepIndex ? 'is-complete' : '')}
            />
          ))}
        </div>

        <footer className="student-test-window-tour__footer">
          <button type="button" className="student-test-window-tour__skip" onClick={finishTour}>
            Пропустить
          </button>
          <span className="student-test-window-tour__keys" aria-hidden="true">← →</span>
          <div className="student-test-window-tour__actions">
            <button
              type="button"
              className="student-test-window-tour__previous"
              onClick={handlePrevious}
              disabled={stepIndex === 0}
            >
              <ChevronLeft size={16} />
              Назад
            </button>
            <button
              type="button"
              className="student-test-window-tour__next"
              onClick={handleNext}
              data-student-test-tour-next
            >
              {isLastStep ? 'Готово' : 'Далее'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
};

export default StudentTestWindowTour;
