import React, { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Wallet, X } from 'lucide-react';
import { getLessonPaymentQuote, setLessonPayment } from '../services/lessonPayments.js';

const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value || 0);
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());

export default function LessonPaymentPanel({ teacherId, occurrence, onSaved, onClose }) {
  const [quote, setQuote] = useState(null);
  const [source, setSource] = useState('receipt');
  const [amount, setAmount] = useState('');
  const [receivedDate, setReceivedDate] = useState(today);
  const [separate, setSeparate] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const saving = useRef(false);
  useEffect(() => {
    let cancelled = false;
    getLessonPaymentQuote(teacherId, occurrence).then(result => {
      if (cancelled) return;
      setQuote(result); setAmount(String(result.amount));
      setSource(result.usesBalance && result.available >= result.amount ? 'balance' : 'receipt');
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [teacherId, occurrence]);
  const change = callback => { requestId.current = crypto.randomUUID(); callback(); };
  const submit = async event => {
    event.preventDefault();
    if (!quote || saving.current || quote.paid) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const receivedAt = receivedDate === today() ? new Date().toISOString() : `${receivedDate}T12:00:00+03:00`;
      const result = await setLessonPayment(teacherId, occurrence, true, {
        paymentSource: source,
        ...(source === 'receipt' ? { receipt: { amount: Number(amount), receivedAt,
          idempotencyKey: requestId.current, confirmed: true, confirmedSeparate: separate,
          note: `Оплата занятия ${occurrence.dayKey} ${occurrence.time}` } } : {}),
      });
      onSaved(result);
    } catch (err) { setError(err.message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="mt-3 border-t border-slate-200 pt-3" aria-label="Учесть оплату занятия">
    <header className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Оплата занятия</h3>
      <button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть оплату" title="Закрыть оплату" className="p-1 text-slate-500"><X size={16} /></button></header>
    {!quote && !error && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle size={16} className="animate-spin" />Проверяем оплату...</p>}
    {error && <p role="alert" className="mb-3 text-sm text-rose-600">{error}</p>}
    {quote && <form onSubmit={submit}>
      <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><div><dt className="text-slate-500">Стоимость занятия</dt><dd className="font-semibold">{money(quote.amount)}</dd></div>
        {quote.usesBalance ? <div><dt className="text-slate-500">Свободный баланс</dt><dd className="font-semibold">{money(quote.available)}</dd></div> : <div><dt className="text-slate-500">Учёт</dt><dd>Поурочный, без баланса</dd></div>}</dl>
      {quote.paid ? <p className="text-sm text-emerald-700">Занятие уже оплачено.</p> : <>
        {quote.usesBalance && <div role="group" aria-label="Источник оплаты" className="mb-3 flex flex-wrap gap-1">
          {[['balance', 'Из баланса'], ['receipt', 'Получен перевод']].map(([value, label]) => <button type="button" key={value} aria-pressed={source === value}
            disabled={busy || (value === 'balance' && quote.available < quote.amount)} onClick={() => change(() => setSource(value))}
            className={`rounded-md border px-3 py-2 text-sm disabled:opacity-40 ${source === value ? 'border-cyan-600 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div>}
        {source === 'receipt' && <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">Получено, ₽<input type="number" required min={quote.amount} max="1000000000" step="0.01" value={amount}
            readOnly={!quote.usesBalance} disabled={busy} onChange={event => change(() => setAmount(event.target.value))}
            className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-600">Дата перевода<input type="date" required max={today()} value={receivedDate} disabled={busy}
            onChange={event => change(() => setReceivedDate(event.target.value))} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" /></label>
          {quote.usesBalance && <label className="col-span-full flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={separate} disabled={busy}
            onChange={event => change(() => setSeparate(event.target.checked))} />Это отдельный перевод, даже если рядом есть такая же сумма.</label>}
        </div>}
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : source === 'balance' ? <Wallet size={16} /> : <Check size={16} />}
          {busy ? 'Сохраняем...' : source === 'balance' ? `Оплатить из баланса ${money(quote.amount)}` : `Учесть полученные ${money(Number(amount))}`}
        </button>
      </>}
    </form>}
  </section>;
}
