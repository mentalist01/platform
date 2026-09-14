import React from 'react';
import { CheckCircle2, CreditCard, LockKeyhole, LogOut, RefreshCcw } from 'lucide-react';

const formatMoney = (value) => `${new Intl.NumberFormat('ru-RU').format(Math.max(0, Number(value) || 0))} ₽`;

const formatMonth = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(value || 'текущий месяц');
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
};

export const TeacherSubscriptionReminder = ({ subscription }) => {
  if (!subscription || subscription.status === 'disabled' || subscription.status === 'paid') return null;
  const overdue = subscription.status === 'overdue';
  return (
    <div className={`mb-3 rounded-2xl border px-4 py-3 ${overdue
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <div className="flex items-start gap-3">
        <CreditCard size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="font-bold">{overdue ? 'Доступ приостановлен' : 'Напоминание об оплате платформы'}</p>
          <p className="mt-1 leading-relaxed">
            {overdue
              ? `Оплата за ${formatMonth(subscription.month)} не подтверждена. Осталось ${formatMoney(subscription.remaining)}. После оплаты попросите администратора подтвердить платёж.`
              : `До ${subscription.effectiveDueDay || subscription.dueDay} числа нужно оплатить ${formatMoney(subscription.remaining)} за ${formatMonth(subscription.month)}.`}
          </p>
        </div>
      </div>
    </div>
  );
};

const TeacherSubscriptionGate = ({ subscription, onRefresh, onLogout }) => (
  <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 px-4 py-10">
    <section className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-xl shadow-rose-100/60 sm:p-8">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-100 text-rose-700">
        <LockKeyhole size={30} />
      </span>
      <h1 className="mt-5 text-2xl font-black text-slate-900">Доступ к платформе закрыт</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Не подтверждена ежемесячная оплата платформы за {formatMonth(subscription?.month)}.
        Осталось оплатить <strong className="text-slate-900">{formatMoney(subscription?.remaining)}</strong>.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        После оплаты напишите администратору. Он отметит платёж, и доступ восстановится автоматически.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCcw size={16} /> Проверить оплату
        </button>
        <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          <LogOut size={16} /> Выйти
        </button>
      </div>
      {subscription?.paidAmount > 0 && subscription?.remaining > 0 && (
        <p className="mt-4 flex items-center justify-center gap-1 text-xs text-amber-700">
          <CheckCircle2 size={14} /> Учтено: {formatMoney(subscription.paidAmount)}
        </p>
      )}
    </section>
  </main>
);

export default TeacherSubscriptionGate;
