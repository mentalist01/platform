import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Copy, CreditCard, LockKeyhole, X } from 'lucide-react';
import { useFullscreenPortalTarget } from '../hooks/useFullscreenPortalTarget.js';
import './TeacherSubscriptionGate.css';

const money = value => `${new Intl.NumberFormat('ru-RU').format(Math.max(0, Number(value) || 0))} ₽`;
const monthName = value => /^\d{4}-\d{2}$/.test(String(value))
  ? new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(`${value}-02T12:00:00Z`)) : 'текущий месяц';
const deadline = value => value
  ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00Z`)) : '15 числа';
const PHONE = '89518568835';

export function SubscriptionPaymentCard({ subscription, blocked = false, onClose, onLogin }) {
  const [copied, setCopied] = useState(false);
  const amount = subscription?.remaining || subscription?.monthlyFee;
  return <section className="teacher-payment-card" role="dialog" aria-modal="true" aria-labelledby="teacher-payment-title">
    {onClose && <button className="teacher-payment-close" type="button" onClick={onClose} aria-label="Закрыть напоминание"><X size={20}/></button>}
    <div className={`teacher-payment-icon ${blocked ? 'is-blocked' : ''}`}>{blocked ? <LockKeyhole size={28}/> : <CreditCard size={28}/>}</div>
    <p className="teacher-payment-eyebrow">Доступ к платформе · {monthName(subscription?.month)}</p>
    <h1 id="teacher-payment-title">{blocked ? 'Пора продлить доступ' : 'Оплата платформы'}</h1>
    <p className="teacher-payment-intro">{blocked
      ? 'Оплата пока не подтверждена. После её подтверждения вы сможете снова войти по своему коду.'
      : `Оплатите до ${deadline(subscription?.graceUntil)} включительно. До этого дня платформа работает как обычно.`}</p>
    <div className="teacher-payment-details">
      <div className="teacher-payment-amount"><span>К оплате за {monthName(subscription?.month)}</span><strong>{money(amount)}</strong></div>
      <div className="teacher-payment-bank"><span className="teacher-payment-bank-logo">Т</span><div><strong>Т-Банк</strong><span>Перевод по номеру телефона</span></div></div>
      <button className="teacher-payment-phone" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(PHONE); setCopied(true); } catch { setCopied(false); }
      }} aria-label="Скопировать номер 8 951 856-88-35"><strong>8 951 856-88-35</strong>{copied ? <Check size={18}/> : <Copy size={18}/>}</button>
      {copied && <small className="teacher-payment-copied" role="status">Номер скопирован</small>}
    </div>
    {subscription?.outstanding?.length > 1 && <p className="teacher-payment-note">Всего за неоплаченные месяцы: <strong>{money(subscription.totalRemaining)}</strong>. Сначала погашается самый ранний месяц.</p>}
    <p className="teacher-payment-note">После перевода сообщите Ивану, чтобы он подтвердил оплату.{subscription?.autoPaymentEnabled ? ' Платёж с вашим настроенным именем плательщика также может подтвердиться автоматически.' : ''}</p>
    <button type="button" className="teacher-payment-primary" onClick={blocked ? onLogin : onClose}>{blocked ? 'Вернуться ко входу' : 'Продолжить работу'}<ArrowRight size={18}/></button>
    {!blocked && <p className="teacher-payment-footer">С {deadline(subscription?.blockDate)} без оплаты доступ будет приостановлен.</p>}
  </section>;
}

export const TeacherSubscriptionReminder = ({ subscription, teacherId, dailyOnly = false }) => {
  const [open, setOpen] = useState(false);
  const portalTarget = useFullscreenPortalTarget();
  const unpaid = subscription && !['disabled', 'paid'].includes(subscription.status);
  useEffect(() => {
    if (!dailyOnly || !teacherId || !unpaid) { setOpen(false); return; }
    const key = `teacher-platform-payment-seen:${teacherId}`;
    const today = subscription.today;
    if (!today) return;
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch { /* Reminder still works when storage is unavailable. */ }
    setOpen(true);
  }, [teacherId, unpaid, subscription?.today, dailyOnly]);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (!unpaid) return null;
  return <>
    {!dailyOnly && <button type="button" className="teacher-payment-reminder" onClick={() => setOpen(true)}><CreditCard size={20}/><span><strong>Оплата платформы · {money(subscription.remaining)}</strong><small>До {deadline(subscription.graceUntil)} включительно</small></span><ArrowRight size={18}/></button>}
    {open && createPortal(<div className="teacher-payment-overlay"><SubscriptionPaymentCard subscription={subscription} onClose={() => setOpen(false)}/></div>, portalTarget || document.body)}
  </>;
};

export default function TeacherSubscriptionGate({ subscription, onLogout }) {
  return <main className="teacher-payment-gate"><SubscriptionPaymentCard subscription={subscription} blocked onLogin={onLogout}/></main>;
}
