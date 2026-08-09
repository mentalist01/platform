import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Clock3,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const getDialogContent = (request) => {
  const kind = request?.kind || 'start';

  if (kind === 'close') {
    return {
      eyebrow: 'Таймер уже запущен',
      title: 'Выйти из пробника?',
      description: 'Ответы сохранятся, а пробник закроется. Отсчёт времени при этом не остановится.',
      primaryValue: request?.remainingLabel || 'Идёт',
      primaryLabel: request?.remainingLabel ? 'осталось на таймере' : 'таймер работает',
      secondaryValue: 'Без паузы',
      secondaryLabel: 'до конца попытки',
      note: 'Вернуться можно из раздела «Пробники» — таймер продолжает идти в фоне.',
      confirmLabel: 'Выйти из пробника',
      cancelLabel: 'Остаться',
      icon: LogOut,
      actionIcon: ArrowRight,
    };
  }

  if (kind === 'restart') {
    return {
      eyebrow: 'Новая попытка',
      title: 'Запустить новый таймер?',
      description: 'Начнётся новая попытка на 3 часа 55 минут. После запуска поставить её на паузу не получится.',
      primaryValue: '3:55:00',
      primaryLabel: 'на весь пробник',
      secondaryValue: 'Без паузы',
      secondaryLabel: 'даже после закрытия',
      note: 'Повторная таймерная попытка запускается без наград.',
      confirmLabel: 'Запустить снова',
      cancelLabel: 'Отмена',
      icon: RotateCcw,
      actionIcon: Play,
    };
  }

  return {
    eyebrow: 'Экзаменационный режим',
    title: 'Запустить таймер?',
    description: 'На весь пробник даётся 3 часа 55 минут. После запуска отсчёт нельзя поставить на паузу.',
    primaryValue: '3:55:00',
    primaryLabel: 'на весь пробник',
    secondaryValue: 'Без паузы',
    secondaryLabel: 'даже после закрытия',
    note: 'Ответы сохраняются автоматически — к пробнику можно вернуться, пока время не закончилось.',
    confirmLabel: 'Запустить таймер',
    cancelLabel: 'Пока не начинать',
    icon: Clock3,
    actionIcon: Play,
  };
};

const MockExamTimerConfirmDialog = ({ request, onConfirm, onCancel }) => {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const content = getDialogContent(request);
  const isClose = request?.kind === 'close';
  const Icon = content.icon;
  const ActionIcon = content.actionIcon;

  useEffect(() => {
    if (!request) return undefined;
    restoreFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus?.());

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      const elementToRestore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      window.requestAnimationFrame(() => elementToRestore?.focus?.());
    };
  }, [onCancel, request]);

  if (!request || typeof document === 'undefined') return null;

  const titleId = `mock-timer-confirm-title-${request.id}`;
  const descriptionId = `mock-timer-confirm-description-${request.id}`;

  return createPortal(
    <div
      className={`mock-timer-confirm ${isClose ? 'mock-timer-confirm--close' : 'mock-timer-confirm--start'}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <section
        ref={dialogRef}
        className="mock-timer-confirm__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mock-timer-confirm__ambient" aria-hidden="true" />
        <button
          type="button"
          className="mock-timer-confirm__close"
          onClick={onCancel}
          aria-label="Закрыть окно подтверждения"
        >
          <X size={18} />
        </button>

        <header className="mock-timer-confirm__header">
          <span className="mock-timer-confirm__icon" aria-hidden="true">
            <Icon size={25} strokeWidth={2.15} />
          </span>
          <div className="mock-timer-confirm__heading">
            <span className="mock-timer-confirm__eyebrow">{content.eyebrow}</span>
            <h2 id={titleId}>{content.title}</h2>
            {request.examTitle && (
              <span className="mock-timer-confirm__exam-title">{request.examTitle}</span>
            )}
          </div>
        </header>

        <p id={descriptionId} className="mock-timer-confirm__description">
          {content.description}
        </p>

        <div className="mock-timer-confirm__facts" aria-label="Условия таймера">
          <div className="mock-timer-confirm__fact mock-timer-confirm__fact--time">
            <span className="mock-timer-confirm__fact-icon" aria-hidden="true"><Clock3 size={17} /></span>
            <span>
              <strong>{content.primaryValue}</strong>
              <small>{content.primaryLabel}</small>
            </span>
          </div>
          <div className="mock-timer-confirm__fact mock-timer-confirm__fact--pause">
            <span className="mock-timer-confirm__fact-icon" aria-hidden="true"><Pause size={17} /></span>
            <span>
              <strong>{content.secondaryValue}</strong>
              <small>{content.secondaryLabel}</small>
            </span>
          </div>
        </div>

        <div className="mock-timer-confirm__note">
          <span aria-hidden="true">{isClose ? <Save size={17} /> : <ShieldCheck size={17} />}</span>
          <p>{content.note}</p>
        </div>

        <div className="mock-timer-confirm__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="mock-timer-confirm__button mock-timer-confirm__button--cancel"
            onClick={onCancel}
          >
            {content.cancelLabel}
          </button>
          <button
            type="button"
            className="mock-timer-confirm__button mock-timer-confirm__button--confirm"
            onClick={onConfirm}
          >
            <ActionIcon size={17} />
            <span>{content.confirmLabel}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
};

export default MockExamTimerConfirmDialog;
