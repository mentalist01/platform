import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, CreditCard, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { getStudentPaymentReminderItems } from '../utils/studentPaymentReminder';

const DAY_MS = 24 * 60 * 60 * 1000;

const formatLessonDate = (item) => {
  const date = new Date(item?.endMs || 0);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).replace(' г.', '');
};

const formatElapsedDays = (item) => {
  const days = Math.max(2, Math.floor((Date.now() - Number(item?.endMs || 0)) / DAY_MS));
  const lastTwo = days % 100;
  const last = days % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${days} дней назад`;
  if (last === 1) return `${days} день назад`;
  if (last >= 2 && last <= 4) return `${days} дня назад`;
  return `${days} дней назад`;
};

const formatLessonCount = (count) => {
  const value = Math.max(1, Number(count) || 1);
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} уроков`;
  if (last === 1) return `${value} урок`;
  if (last >= 2 && last <= 4) return `${value} урока`;
  return `${value} уроков`;
};

const StudentPaymentReminder = ({ enabled, studentId, onOpenSchedule }) => {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef(null);
  const requestIdRef = useRef(0);
  const dismissedRef = useRef(false);
  const studentIdRef = useRef('');

  const closeReminder = useCallback(() => {
    dismissedRef.current = true;
    setOpen(false);
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!studentId) return undefined;
    const normalizedStudentId = String(studentId);
    if (studentIdRef.current !== normalizedStudentId) {
      studentIdRef.current = normalizedStudentId;
      dismissedRef.current = false;
    }
    let cancelled = false;
    api.getStudentSchedule()
      .then((schedule) => {
        if (cancelled || requestIdRef.current !== requestId) return;
        const nextItems = getStudentPaymentReminderItems(schedule);
        setItems(nextItems);
        setOpen(nextItems.length > 0 && !dismissedRef.current);
      })
      .catch(() => {
        if (cancelled || requestIdRef.current !== requestId) return;
        setItems([]);
        setOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (!enabled || !open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frameId = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeReminder();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeReminder, enabled, open]);

  if (!enabled || !open || items.length === 0 || typeof document === 'undefined') return null;

  const visibleItems = items.slice(0, 4);
  const hiddenCount = Math.max(items.length - visibleItems.length, 0);

  return createPortal(
    <div
      className="student-payment-reminder"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeReminder();
      }}
    >
      <section
        className="student-payment-reminder__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-payment-reminder-title"
        aria-describedby="student-payment-reminder-description"
      >
        <div className="student-payment-reminder__accent" aria-hidden="true" />
        <button
          ref={closeButtonRef}
          type="button"
          className="student-payment-reminder__close"
          onClick={closeReminder}
          aria-label="Закрыть напоминание об оплате"
        >
          <X size={17} />
        </button>

        <header className="student-payment-reminder__header">
          <span className="student-payment-reminder__icon" aria-hidden="true"><CreditCard size={23} /></span>
          <div>
            <span className="student-payment-reminder__eyebrow">Напоминание об оплате</span>
            <h2 id="student-payment-reminder-title">
              {items.length === 1 ? 'Урок пока не оплачен' : `Не оплачено ${formatLessonCount(items.length)}`}
            </h2>
            <p id="student-payment-reminder-description">
              С занятия прошло не меньше двух дней. Проверьте оплату или свяжитесь с преподавателем.
            </p>
          </div>
        </header>

        <div className="student-payment-reminder__list">
          {visibleItems.map((item) => (
            <article key={item.id} className="student-payment-reminder__item">
              <span className="student-payment-reminder__item-date" aria-hidden="true">
                <CalendarDays size={17} />
              </span>
              <div className="student-payment-reminder__item-copy">
                <strong>{item.subject}</strong>
                <span>{`${formatLessonDate(item)}${item.time ? ` · ${item.time}` : ''}`}</span>
              </div>
              <span className="student-payment-reminder__elapsed">
                <Clock3 size={12} /> {formatElapsedDays(item)}
              </span>
            </article>
          ))}
          {hiddenCount > 0 ? (
            <div className="student-payment-reminder__more">Ещё неоплаченных уроков: {hiddenCount}</div>
          ) : null}
        </div>

        <footer className="student-payment-reminder__actions">
          <button type="button" className="student-payment-reminder__later" onClick={closeReminder}>
            Напомнить позже
          </button>
          <button
            type="button"
            className="student-payment-reminder__schedule"
            onClick={() => {
              closeReminder();
              onOpenSchedule?.();
            }}
          >
            Открыть расписание <ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
};

export default StudentPaymentReminder;
