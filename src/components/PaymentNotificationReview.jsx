import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Link2, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react';
import { getPaymentReview, resolvePaymentReview } from '../services/teacherPaymentConnection';
import './PaymentNotificationReview.css';

const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value || 0);
const date = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' });

export default function PaymentNotificationReview({ teacherId, notification, onResolved, onClose }) {
  const dialog = useRef(null);
  const saving = useRef(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('new');
  const [receiptEntryId, setReceiptEntryId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [separate, setSeparate] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(''); setPreview(null); setConfirmed(false); setSeparate(false); setReceiptEntryId('');
    try {
      const result = await getPaymentReview(teacherId, notification.id);
      if (generation.current !== current) return;
      setPreview(result); setMode(result.candidates.length ? 'link' : 'new');
    } catch (err) { if (generation.current === current) setError(err.message); }
    finally { if (generation.current === current) setLoading(false); }
  }, [teacherId, notification.id]);
  useEffect(() => {
    dialog.current?.showModal();
    void load();
    return () => { generation.current += 1; dialog.current?.close(); };
  }, [load]);
  const choose = value => { setMode(value); setConfirmed(false); setSeparate(false); };
  const submit = async event => {
    event.preventDefault();
    if (!preview || !confirmed || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const result = await resolvePaymentReview(teacherId, notification.id, {
        mode: preview.recovery?.mode || mode,
        receiptEntryId: preview.recovery?.receiptEntryId || receiptEntryId,
        previewToken: preview.previewToken, confirmed: true, confirmedSeparate: separate,
      });
      onResolved(result);
    } catch (err) {
      setError(`${err.message} Обновите проверку перед повторным действием.`);
      setPreview(null); setConfirmed(false);
    } finally { saving.current = false; setBusy(false); }
  };
  const sms = preview?.notification || notification;
  const disabled = busy || !confirmed || (!preview?.recovery && (mode === 'link' ? !receiptEntryId : preview?.candidates.length > 0 && !separate));
  return <dialog ref={dialog} className="payment-review" aria-labelledby="payment-review-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="payment-review__header"><h2 id="payment-review-title">Учесть оплату</h2>
      <button type="button" className="payment-review__close" title="Закрыть" aria-label="Закрыть проверку оплаты" onClick={onClose} disabled={busy}><X size={18} /></button></header>
    <dl className="payment-review__details"><div><dt>Ученик</dt><dd>{sms.studentName || 'Не определён'}</dd></div>
      <div><dt>Сумма</dt><dd>{money(sms.amount)}</dd></div><div><dt>Плательщик</dt><dd>{sms.senderName}</dd></div>
      <div><dt>Получено (Москва)</dt><dd>{date(sms.receivedAt || sms.createdAt)}</dd></div></dl>
    {loading && <p role="status" className="payment-review__status"><LoaderCircle size={18} className="animate-spin" />Проверяем историю...</p>}
    {error && <p role="alert" className="payment-review__error">{error}</p>}
    {!loading && !preview && <button type="button" disabled={busy} onClick={load}><RefreshCw size={16} />Обновить проверку</button>}
    {preview?.alreadyResolved ? <><p className="payment-review__status">Это уведомление уже обработано. Повторного начисления нет.</p>
      <button type="button" onClick={() => onResolved({ notification: preview.notification })}><RefreshCw size={16} />Обновить историю</button></> : preview && <form onSubmit={submit}>
      {preview.recovery ? <p className="payment-review__status">Платёж уже сохранён на балансе. Осталось восстановить статус SMS.</p> : <>
        <fieldset className="payment-review__modes" disabled={busy}><legend className="sr-only">Результат сверки</legend>
          <label><input type="radio" name="sms-review-mode" value="new" checked={mode === 'new'} onChange={() => choose('new')} /><Plus size={16} />Новый перевод</label>
          <label><input type="radio" name="sms-review-mode" value="link" checked={mode === 'link'} onChange={() => choose('link')} /><Link2 size={16} />Уже учтён</label>
        </fieldset>
        {preview.candidates.length > 0 && <p className="payment-review__warning">Рядом по дате есть {preview.candidates.length === 1 ? 'платёж' : 'платежи'} на {money(sms.amount)}.</p>}
        {mode === 'link' ? preview.candidates.length ? <label className="payment-review__select">Ранее учтённый перевод
          <select required value={receiptEntryId} disabled={busy} onChange={event => { setReceiptEntryId(event.target.value); setConfirmed(false); }}>
            <option value="">Выберите платёж</option>{preview.candidates.map(receipt => <option key={receipt.entryId} value={receipt.entryId}>
              {date(receipt.receivedAt)} · {receipt.senderName || 'Без имени'} · {receipt.source === 'bank' ? 'Банк' : 'Вручную'} · {money(receipt.amount)}
            </option>)}
          </select></label> : <p className="payment-review__status">Похожих поступлений на балансе нет. Если перевод уже учитывали, сверьте историю в «Финансы → Балансы».</p>
          : <p className="payment-review__status">На баланс {sms.studentName} поступит {money(sms.amount)}. Деньги распределятся по неоплаченным занятиям.</p>}
        {mode === 'new' && preview.candidates.length > 0 && <label className="payment-review__check"><input type="checkbox" checked={separate} disabled={busy} onChange={event => setSeparate(event.target.checked)} />Это отдельный перевод, не один из найденных.</label>}
      </>}
      <label className="payment-review__check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        {preview.recovery ? 'Подтверждаю сверку сохранённой оплаты.' : mode === 'new' ? 'Деньги получены; этот перевод ещё не учтён.' : 'Это тот же перевод. Новые деньги не начислять.'}</label>
      <footer className="payment-review__footer"><button type="button" disabled={busy} onClick={onClose}>Отмена</button>
        <button type="submit" className="payment-review__submit" disabled={disabled}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
          {busy ? 'Сохраняем...' : preview.recovery ? 'Восстановить статус' : mode === 'new' ? `Учесть ${money(sms.amount)}` : 'Связать без начисления'}</button></footer>
    </form>}
  </dialog>;
}
