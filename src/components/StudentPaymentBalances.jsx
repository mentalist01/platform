import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, Plus, RefreshCw, Search, Wallet } from 'lucide-react';
import { addStudentReceipt, confirmStudentReceipt, enableStudentBalances, getStudentBalances, releaseStudentPayment } from '../services/studentPaymentBalances';
import './StudentPaymentBalances.css';

const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value || 0);
const date = value => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : '';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
const emptyDraft = () => ({ amount: '', receivedAt: today(), senderName: '', note: '', confirmed: false, confirmedSeparate: false });
const types = { opening: 'Исходная сумма', migration: 'Переход на баланс', receipt: 'Поступление', reserve: 'Оплата занятия', release: 'Возврат на баланс', move: 'Перенос занятия', 'receipt-link': 'Подтверждение перевода' };

export default function StudentPaymentBalances({ teacherId, studentId = '', onChanged }) {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(studentId);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmMigration, setConfirmMigration] = useState(false);
  const [releaseKey, setReleaseKey] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const receiptKey = useRef(null);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setData(await getStudentBalances(teacherId)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [teacherId]);
  useEffect(() => { setData(null); setSelectedId(studentId); setDraft(emptyDraft()); receiptKey.current = null; void load(); }, [load, studentId]);
  const selectStudent = id => { setSelectedId(id); setDraft(emptyDraft()); receiptKey.current = null; setReleaseKey(''); setError(''); };
  const change = (field, value) => { receiptKey.current = null; setDraft(previous => ({ ...previous, [field]: value })); };
  const run = async action => {
    setBusy(true); setError('');
    try { const result = await action(); setData(result); onChanged?.(); return true; }
    catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  };
  const add = async event => {
    event.preventDefault();
    if (!draft.confirmed || busy) return;
    if (!receiptKey.current) receiptKey.current = crypto.randomUUID();
    const ok = await run(() => addStudentReceipt(teacherId, selectedId, {
      ...draft, amount: Number(draft.amount), receivedAt: `${draft.receivedAt}T12:00:00+03:00`, idempotencyKey: receiptKey.current,
    }));
    if (ok) { receiptKey.current = null; setDraft(emptyDraft()); }
  };
  const selected = data?.students.find(row => row.studentId === selectedId);
  const conflicts = studentId ? data?.conflicts.filter(row => row.studentId === studentId) : data?.conflicts;
  const totals = (data?.students || []).reduce((sum, row) => ({ received: sum.received + row.received, allocated: sum.allocated + row.allocated, available: sum.available + row.available }), { received: 0, allocated: 0, available: 0 });
  return <section className={`student-balances${studentId ? ' student-balances--compact' : ''}`} aria-label="Балансы учеников">
    <header className="student-balances__heading"><h2><Wallet size={20} />{studentId ? 'Баланс ученика' : 'Балансы учеников'}</h2><button type="button" className="student-balances__icon" title="Обновить балансы" aria-label="Обновить балансы" onClick={load} disabled={busy}>{busy ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}</button></header>
    {error && <p role="alert" className="student-balances__error">{error}</p>}
    {!data && !error && <p role="status">Загрузка балансов...</p>}
    {data && !data.enabled && <div className="student-balances__migration">
      <h3>Предварительная сверка</h3>
      <dl className="student-balances__totals"><div><dt>Учтено ранее</dt><dd>{money(totals.received)}</dd></div><div><dt>На занятиях</dt><dd>{money(totals.allocated)}</dd></div><div><dt>Свободный остаток</dt><dd>{money(totals.available)}</dd></div></dl>
      {!studentId ? <><label className="student-balances__check"><input type="checkbox" checked={confirmMigration} onChange={event => setConfirmMigration(event.target.checked)} disabled={busy} />Подтверждаю переход на балансы. Подключаемых учеников: {data.students.length}. Новые деньги не начисляются.</label><button type="button" disabled={busy || !confirmMigration || !data.students.length} onClick={() => run(() => enableStudentBalances(teacherId, data.previewToken))}><Check size={17} />Перейти на балансы</button></> : <p>Балансы ещё не подключены. Предварительная сверка: Финансы → Балансы.</p>}
    </div>}
    {conflicts?.length > 0 && <details className="student-balances__warning"><summary>Прежний учёт: {conflicts.length}</summary>{conflicts.map(row => <p key={row.studentId}><strong>{row.studentName}</strong>: {row.reason}</p>)}</details>}
    {data && !selected && !studentId && <>
      <label className="student-balances__search"><Search size={17} /><input aria-label="Найти ученика по имени" value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти ученика" /></label>
      <div className="student-balances__table-wrap"><table><thead><tr><th>Ученик</th><th>Получено всего</th><th>На занятиях</th><th>Свободно</th><th>Проверка</th></tr></thead><tbody>{data.students.filter(row => row.studentName.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU'))).map(row => <tr key={row.studentId}><td><button type="button" disabled={busy} className="student-balances__name" onClick={() => selectStudent(row.studentId)}>{row.studentName}{row.deleted ? ' (архив)' : ''}</button></td><td>{money(row.received)}</td><td>{money(row.allocated)}</td><td className="student-balances__available">{money(row.available)}</td><td>{row.paused ? 'Приостановлен' : (row.pending.length + row.issues.length || '')}</td></tr>)}</tbody></table></div>
    </>}
    {selected && <>
      {!studentId && <button type="button" disabled={busy} className="student-balances__back" onClick={() => selectStudent('')}><ArrowLeft size={17} />Все ученики</button>}
      {!studentId && <h3>{selected.studentName}</h3>}
      <dl className="student-balances__totals"><div><dt>Получено всего</dt><dd>{money(selected.received)}</dd></div><div><dt>На занятиях ({selected.paidLessons})</dt><dd>{money(selected.allocated)}</dd></div><div><dt>Свободный баланс</dt><dd className="student-balances__available">{money(selected.available)}</dd></div></dl>
      {selected.paused && <p className="student-balances__warning">Распределение приостановлено: тариф за месяц, мини-группа или абонемент. Старые деньги сохранены.</p>}
      {data.enabled && selected.pending.map(pending => <div key={pending.id} className="student-balances__review"><h4>Возможный повтор: {money(pending.amount)}</h4><p>{pending.senderName} · {date(pending.at)}</p>{pending.manualReceiptIds.map(id => { const entry = selected.entries.find(e => e.id === id); return <button key={id} type="button" disabled={busy || selected.paused} onClick={() => run(() => confirmStudentReceipt(teacherId, selectedId, pending.id, id))}><Check size={16} />Тот же перевод от {date(entry?.at)}</button>; })}<button type="button" className="student-balances__secondary" disabled={busy || selected.paused} onClick={() => { if (window.confirm('Подтверждаете отдельный перевод? На баланс будет начислена ещё одна сумма.')) void run(() => confirmStudentReceipt(teacherId, selectedId, pending.id, '')); }}>Это отдельный перевод</button></div>)}
      {selected.issues.map((issue, index) => <div className="student-balances__warning" key={issue.markKey || index}><p>{issue.dayKey} {issue.time} {issue.amount ? money(issue.amount) : ''}: {issue.reason}</p>{data.enabled && issue.markKey && <>{releaseKey !== issue.markKey ? <button type="button" className="student-balances__secondary" disabled={busy} onClick={() => setReleaseKey(issue.markKey)}>Подтвердить отмену</button> : <><p>Оплата вернётся на баланс и может покрыть следующее неоплаченное занятие.</p><button type="button" disabled={busy} onClick={async () => { if (await run(() => releaseStudentPayment(teacherId, selectedId, issue.markKey))) setReleaseKey(''); }}>Вернуть на баланс</button><button type="button" className="student-balances__secondary" disabled={busy} onClick={() => setReleaseKey('')}>Оставить как есть</button></>}</>}</div>)}
      {data.enabled && !selected.paused && !selected.deleted && <form onSubmit={add} className="student-balances__receipt">
        <h3>Полученный платёж</h3><div className="student-balances__fields">
          <label>Сумма, ₽<input required type="number" min="0.01" max="1000000000" step="0.01" value={draft.amount} onChange={event => change('amount', event.target.value)} disabled={busy} /></label>
          <label>Дата получения<input required type="date" max={today()} value={draft.receivedAt} onChange={event => change('receivedAt', event.target.value)} disabled={busy} /></label>
          <label>Отправитель<input value={draft.senderName} onChange={event => change('senderName', event.target.value)} maxLength={200} disabled={busy} /></label>
          <label>Комментарий<input value={draft.note} onChange={event => change('note', event.target.value)} maxLength={500} disabled={busy} /></label>
        </div><label className="student-balances__check"><input type="checkbox" checked={draft.confirmed} onChange={event => change('confirmed', event.target.checked)} disabled={busy} />Деньги получены; этот перевод ещё не учтён.</label>
        <label className="student-balances__check"><input type="checkbox" checked={draft.confirmedSeparate} onChange={event => change('confirmedSeparate', event.target.checked)} disabled={busy} />При совпадении суммы и даты это отдельный перевод.</label>
        <button type="submit" disabled={busy || !draft.confirmed || !draft.amount}><Plus size={17} />Внести платёж</button>
      </form>}
      <details className="student-balances__history" open={!studentId}><summary>История операций ({selected.entries.length})</summary><div className="student-balances__table-wrap"><table><thead><tr><th>Записано</th><th>Операция</th><th>Сумма</th><th>Остаток после</th></tr></thead><tbody>{selected.entries.map(entry => <tr key={entry.id}><td>{date(entry.recordedAt || entry.at)}</td><td><strong>{types[entry.type] || entry.type}</strong><span>{entry.source === 'bank' ? 'Банк · ' : entry.source === 'manual' ? 'Вручную · ' : ''}{entry.senderName || entry.note}{entry.type === 'receipt' ? ` · получено ${date(entry.at)}` : ''}{entry.dayKey ? ` · ${entry.dayKey} ${entry.time || ''}` : ''}{entry.type === 'opening' ? ` · ${entry.month}` : ''}</span></td><td>{entry.type === 'reserve' ? '-' : ['receipt', 'release', 'opening'].includes(entry.type) ? '+' : ''}{money(entry.amount)}</td><td>{money(entry.balance)}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
