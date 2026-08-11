import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flame,
  Play,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';

const getTaskLabel = (task) => {
  if (!task) return 'Следующее задание из домашки';
  const taskPrefix = task.isPython
    ? 'Python'
    : `Задание ${task.taskDisplay || task.taskNumber}`;
  const questionSuffix = task.questionNumber ? ` · №${task.questionNumber}` : '';
  return `${taskPrefix}${questionSuffix}`;
};

const getPraise = (count) => {
  if (count <= 1) {
    return {
      eyebrow: 'Первый шаг сделан',
      title: 'Есть! Первое готово.',
      text: 'Ты уже начал — а это обычно самая сложная часть.',
    };
  }
  if (count === 2) {
    return {
      eyebrow: 'Серия продолжается',
      title: 'Два подряд — ты поймал темп.',
      text: 'Ещё одно короткое задание, и получится настоящая серия.',
    };
  }
  if (count === 3) {
    return {
      eyebrow: 'Вот это ритм',
      title: 'Три подряд. Домашка уже заметно короче.',
      text: 'Мозг разогрелся — сейчас следующее обычно даётся легче.',
    };
  }
  return {
    eyebrow: 'Сильная серия',
    title: `${count} подряд — вот это разогнался!`,
    text: 'Ты пришёл всего на пять минут, а сделал гораздо больше.',
  };
};

const getSolvedTaskCountLabel = (count) => {
  const value = Math.max(0, Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} задание`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} задания`;
  return `${value} заданий`;
};

const HomeworkQuickStart = ({
  status = 'idle',
  availableCount = 0,
  completedCount = 0,
  currentTask = null,
  nextTask = null,
  onStart,
  onResume,
  onContinue,
  onPause,
  celebrationOnly = false,
}) => {
  const dialogRef = React.useRef(null);
  const onPauseRef = React.useRef(onPause);
  const sessionStarted = completedCount > 0 || status !== 'idle';
  const isFinished = status === 'complete' || status === 'done';
  const cardTitle = isFinished
    ? 'Все короткие задания готовы'
    : (status === 'paused' ? 'Хороший старт уже есть' : 'Одно задание из твоей домашки. Пять минут.');
  const cardText = isFinished
    ? `Ты решил ${getSolvedTaskCountLabel(completedCount)} — короткая серия закрыта.`
    : (status === 'paused'
        ? `В серии уже ${completedCount}. Можно вернуться, когда захочется.`
        : 'Без плана на весь вечер: просто реши одну маленькую задачу и посмотри, захочется ли ещё.');
  const primaryLabel = status === 'solving'
    ? 'Вернуться к заданию'
    : (status === 'paused' ? 'Продолжить серию' : 'Решить одно задание');
  const handlePrimary = status === 'idle' ? onStart : onResume;
  const praise = getPraise(completedCount);
  const showCelebration = status === 'celebrate' || status === 'complete';

  React.useEffect(() => {
    onPauseRef.current = onPause;
  }, [onPause]);

  React.useEffect(() => {
    if (!showCelebration) return undefined;
    const dialog = dialogRef.current;
    const overlay = dialog?.closest('.homework-quick-celebration') || null;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backgroundState = Array.from(document.body.children)
      .filter((node) => node !== overlay && !node.contains(overlay))
      .filter((node) => node instanceof HTMLElement)
      .map((node) => ({
        node,
        inert: node.inert,
        ariaHidden: node.getAttribute('aria-hidden'),
      }));

    backgroundState.forEach(({ node }) => {
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
    });

    const getFocusableElements = () => (
      Array.from(dialog?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []).filter((node) => node.getClientRects().length > 0)
    );
    const preferredFocus = dialog?.querySelector(
      '.homework-quick-celebration__continue, .homework-quick-celebration__pause'
    );
    (preferredFocus || getFocusableElements()[0] || dialog)?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onPauseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && (document.activeElement === firstElement || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      backgroundState.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert;
        if (ariaHidden == null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', ariaHidden);
      });
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [showCelebration]);

  const celebration = showCelebration && typeof document !== 'undefined'
    ? createPortal(
        <div className="homework-quick-celebration" role="presentation">
          <div className="homework-quick-celebration__backdrop" />
          <section
            ref={dialogRef}
            className="homework-quick-celebration__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="homework-quick-celebration-title"
            tabIndex={-1}
          >
            <button
              type="button"
              className="homework-quick-celebration__close"
              onClick={onPause}
              aria-label="Закрыть поздравление"
            >
              <X size={18} />
            </button>
            <div className="homework-quick-celebration__spark homework-quick-celebration__spark--one" aria-hidden />
            <div className="homework-quick-celebration__spark homework-quick-celebration__spark--two" aria-hidden />
            <div className="homework-quick-celebration__spark homework-quick-celebration__spark--three" aria-hidden />

            <div className="homework-quick-celebration__icon" aria-hidden>
              {isFinished ? <Trophy size={34} /> : <CheckCircle2 size={34} />}
            </div>
            <div className="homework-quick-celebration__eyebrow">
              <Sparkles size={14} />
              {isFinished ? 'Всё готово' : praise.eyebrow}
            </div>
            <h3 id="homework-quick-celebration-title">
              {isFinished ? 'Ты закрыл все короткие задания!' : praise.title}
            </h3>
            <p>
              {isFinished
                ? `Начинал с одной задачки на пять минут, а в серии получилось ${completedCount}. Отличная работа.`
                : praise.text}
            </p>

            <div className="homework-quick-celebration__streak" aria-label={`Заданий в серии: ${completedCount}`}>
              <Flame size={17} />
              <span>Серия</span>
              <strong>{completedCount}</strong>
            </div>

            {!isFinished && nextTask && (
              <div className="homework-quick-celebration__next">
                <span>Следующее — тоже короткое</span>
                <strong>{getTaskLabel(nextTask)}</strong>
                {nextTask.taskTitle && <small>{nextTask.taskTitle}</small>}
              </div>
            )}

            <div className="homework-quick-celebration__actions">
              {!isFinished && nextTask && (
                <button type="button" className="homework-quick-celebration__continue" onClick={onContinue}>
                  Давай ещё одно <ArrowRight size={17} />
                </button>
              )}
              <button
                type="button"
                className="homework-quick-celebration__pause"
                onClick={onPause}
              >
                {isFinished ? 'Отлично!' : 'На сегодня хватит'}
              </button>
            </div>
            {!isFinished && <small className="homework-quick-celebration__note">Можно остановиться — результат уже сохранён.</small>}
          </section>
        </div>,
        document.body
      )
    : null;

  if (!sessionStarted && availableCount <= 0) return null;
  if (celebrationOnly) return celebration;

  return (
    <>
      <section className={`homework-quick-start homework-quick-start--${status}`} aria-labelledby="homework-quick-start-title">
        <div className="homework-quick-start__visual" aria-hidden>
          <span className="homework-quick-start__clock"><Clock3 size={22} /></span>
          <span className="homework-quick-start__five">5</span>
          <span className="homework-quick-start__minutes">мин</span>
        </div>
        <div className="homework-quick-start__copy">
          <div className="homework-quick-start__eyebrow">
            <Sparkles size={13} />
            Лёгкий старт
          </div>
          <h4 id="homework-quick-start-title">{cardTitle}</h4>
          <p>{cardText}</p>
          {!isFinished && currentTask && (
            <div className="homework-quick-start__preview">
              <span>{status === 'paused' ? 'Следующее' : 'Сейчас'}</span>
              <strong>{getTaskLabel(currentTask)}</strong>
              {currentTask.taskTitle && <small>{currentTask.taskTitle}</small>}
            </div>
          )}
        </div>
        <div className="homework-quick-start__action-group">
          {completedCount > 0 && (
            <span className="homework-quick-start__series"><Flame size={14} /> Серия: {completedCount}</span>
          )}
          {!isFinished && (
            <button type="button" className="homework-quick-start__action" onClick={handlePrimary}>
              <Play size={16} fill="currentColor" />
              {primaryLabel}
            </button>
          )}
          {!sessionStarted && availableCount > 0 && (
            <small>{`${availableCount} ${availableCount === 1 ? 'задача ждёт' : 'задач ждут'} в домашке`}</small>
          )}
        </div>
      </section>
      {celebration}
    </>
  );
};

export default HomeworkQuickStart;
