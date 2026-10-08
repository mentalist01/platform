import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, Plus, RefreshCw, Search, Wallet } from 'lucide-react';
import { addStudentReceipt, adjustStudentBalance, confirmStudentReceipt, enableStudentBalances, getStudentBalances, releaseStudentPayment } from '../services/studentPaymentBalances';
import './StudentPaymentBalances.css';

const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value || 0);
const date = value => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : '';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
const emptyDraft = () => ({ amount: '', receivedAt: today(), senderName: '', note: '', confirmed: false, confirmedSeparate: false });
const emptyAdjustment = () => ({ mode: 'add', amount: '', reason: '' });
const types = { opening: 'Исходная сумма', migration: 'Переход на баланс', receipt: 'Поступление', adjustment: 'Корректировка баланса', reserve: 'Оплата занятия', release: 'Возврат на баланс', move: 'Перенос занятия', 'receipt-link': 'Подтверждение перевода' };

export default function StudentPaymentBalances({ teacherId, studentId = '', onChanged }) {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(studentId);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmMigration, setConfirmMigration] = useState(false);
  const [releaseKey, setReleaseKey] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [operation, setOperation] = useState('receipt');
  const [adjustment, setAdjustment] = useState(emptyAdjustment);
  const receiptKey = useRef(null);
  const adjustmentKey = useRef(null);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setData(await getStudentBalances(teacherId)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [teacherId]);
  useEffect(() => { setData(null); setSelectedId(studentId); setDraft(emptyDraft()); setAdjustment(emptyAdjustment()); setOperation('receipt'); receiptKey.current = null; adjustmentKey.current = null; void load(); }, [load, studentId]);
  const selectStudent = id => { setSelectedId(id); setDraft(emptyDraft()); setAdjustment(emptyAdjustment()); setOperation('receipt'); receiptKey.current = null; adjustmentKey.current = null; setReleaseKey(''); setError(''); };
  const change = (field, value) => { receiptKey.current = null; setDraft(previous => ({ ...previous, [field]: value })); };
  const changeAdjustment = (field, value) => { adjustmentKey.current = null; setAdjustment(previous => ({ ...previous, [field]: value })); };
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
  const totals = (studentId ? (selected ? [selected] : []) : (data?.students || [])).reduce((sum, row) => ({ received: sum.received + row.received, allocated: sum.allocated + row.allocated, available: sum.available + row.available }), { received: 0, allocated: 0, available: 0 });
  const adjustmentCents = Math.round(Number(adjustment.amount) * 100);
  const beforeCents = Math.round((selected?.available || 0) * 100);
  const afterCents = adjustment.mode === 'set' ? adjustmentCents : beforeCents + (adjustment.mode === 'subtract' ? -adjustmentCents : adjustmentCents);
  const adjustmentValid = adjustment.amount !== '' && Number.isSafeInteger(adjustmentCents) && adjustmentCents <= 100_000_000_000
    && (adjustment.mode === 'set' ? adjustmentCents >= 0 : adjustmentCents > 0) && Number.isSafeInteger(afterCents) && afterCents >= 0;
  const correctBalance = async event => {
    event.preventDefault();
    if (!selected || busy || !adjustmentValid || !adjustment.reason.trim()) return;
    if (!adjustmentKey.current) adjustmentKey.current = crypto.randomUUID();
    const ok = await run(() => adjustStudentBalance(teacherId, selectedId, {
      ...adjustment, amount: Number(adjustment.amount), reason: adjustment.reason.trim(), expectedAvailable: selected.available, idempotencyKey: adjustmentKey.current,
    }));
    if (ok) { adjustmentKey.current = null; setAdjustment(emptyAdjustment()); }
  };
  return <section className={`student-balances${studentId ? ' student-balances--compact' : ''}`} aria-label="Балансы учеников">
    <header className="student-balances__heading"><h2><Wallet size={20} />{studentId ? 'Баланс ученика' : 'Балансы учеников'}</h2><button type="button" className="student-balances__icon" title="Обновить балансы" aria-label="Обновить балансы" onClick={load} disabled={busy}>{busy ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}</button></header>
    {error && <p role="alert" className="student-balances__error">{error}</p>}
    {!data && !error && <p role="status">Загрузка балансов...</p>}
    {data && !data.enabled && <div className="student-balances__migration">
      <h3>Предварительная сверка</h3>
      {(!studentId || selected) && <dl className="student-balances__totals"><div><dt>Учтено ранее</dt><dd>{money(totals.received)}</dd></div><div><dt>На занятиях</dt><dd>{money(totals.allocated)}</dd></div><div><dt>Свободный остаток</dt><dd>{money(totals.available)}</dd></div></dl>}
      {studentId && !selected && <p>{conflicts?.find(row => row.studentId === studentId)?.reason || 'Для этого ученика пока нет подключённого баланса.'}</p>}
      {!studentId ? <><label className="student-balances__check"><input type="checkbox" checked={confirmMigration} onChange={event => setConfirmMigration(event.target.checked)} disabled={busy} />Подтверждаю переход на балансы. Подключаемых учеников: {data.students.length}. Новые деньги не начисляются.</label><button type="button" disabled={busy || !confirmMigration || !data.students.length} onClick={() => run(() => enableStudentBalances(teacherId, data.previewToken))}><Check size={17} />Перейти на балансы</button></> : <p>Балансы ещё не подключены. Предварительная сверка: Финансы → Балансы.</p>}
    </div>}
    {conflicts?.length > 0 && <details className="student-balances__warning"><summary>Прежний учёт: {conflicts.length}</summary>{conflicts.map(row => <p key={row.studentId}><strong>{row.studentName}</strong>: {row.reason}</p>)}</details>}
    {data?.enabled && studentId && !selected && <p>{conflicts?.find(row => row.studentId === studentId)?.reason || 'Для этого ученика пока нет подключённого баланса.'}</p>}
    {data && !selected && !studentId && <>
      <label className="student-balances__search"><Search size={17} /><input aria-label="Найти ученика по имени" value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти ученика" /></label>
      <div className="student-balances__table-wrap"><table><thead><tr><th>Ученик</th><th>Получено всего</th><th>На занятиях</th><th>Свободно</th><th>Проверка</th></tr></thead><tbody>{data.students.filter(row => row.studentName.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU'))).map(row => <tr key={row.studentId}><td><button type="button" disabled={busy} className="student-balances__name" onClick={() => selectStudent(row.studentId)}>{row.studentName}{row.deleted ? ' (архив)' : ''}</button></td><td>{money(row.received)}</td><td>{money(row.allocated)}</td><td className="student-balances__available">{money(row.available)}</td><td>{row.paused ? 'Приостановлен' : (row.pending.length + row.issues.length || '')}</td></tr>)}</tbody></table></div>
    </>}
    {selected && <>
      {!studentId && <button type="button" disabled={busy} className="student-balances__back" onClick={() => selectStudent('')}><ArrowLeft size={17} />Все ученики</button>}
      {!studentId && <h3>{selected.studentName}</h3>}
      {data.enabled && <dl className="student-balances__totals"><div><dt>Получено всего</dt><dd>{money(selected.received)}</dd></div>{selected.adjusted !== 0 && selected.adjusted != null && <div><dt>Корректировки</dt><dd>{money(selected.adjusted)}</dd></div>}<div><dt>На занятиях ({selected.paidLessons})</dt><dd>{money(selected.allocated)}</dd></div><div><dt>Свободный баланс</dt><dd className="student-balances__available">{money(selected.available)}</dd></div></dl>}
      {selected.paused && <p className="student-balances__warning">Распределение приостановлено: тариф за месяц или абонемент. Старые деньги сохранены.</p>}
      {data.enabled && selected.pending.map(pending => <div key={pending.id} className="student-balances__review"><h4>Возможный повтор: {money(pending.amount)}</h4><p>{pending.senderName} · {date(pending.at)}</p>{pending.manualReceiptIds.map(id => { const entry = selected.entries.find(e => e.id === id); return <button key={id} type="button" disabled={busy || selected.paused} onClick={() => run(() => confirmStudentReceipt(teacherId, selectedId, pending.id, id))}><Check size={16} />Тот же перевод от {date(entry?.at)}</button>; })}<button type="button" className="student-balances__secondary" disabled={busy || selected.paused} onClick={() => { if (window.confirm('Подтверждаете отдельный перевод? На баланс будет начислена ещё одна сумма.')) void run(() => confirmStudentReceipt(teacherId, selectedId, pending.id, '')); }}>Это отдельный перевод</button></div>)}
      {selected.issues.map((issue, index) => <div className="student-balances__warning" key={issue.markKey || index}><p>{issue.dayKey} {issue.time} {issue.amount ? money(issue.amount) : ''}: {issue.reason}</p>{data.enabled && issue.markKey && <>{releaseKey !== issue.markKey ? <button type="button" className="student-balances__secondary" disabled={busy} onClick={() => setReleaseKey(issue.markKey)}>Подтвердить отмену</button> : <><p>Оплата вернётся на баланс и может покрыть следующее неоплаченное занятие.</p><button type="button" disabled={busy} onClick={async () => { if (await run(() => releaseStudentPayment(teacherId, selectedId, issue.markKey))) setReleaseKey(''); }}>Вернуть на баланс</button><button type="button" className="student-balances__secondary" disabled={busy} onClick={() => setReleaseKey('')}>Оставить как есть</button></>}</>}</div>)}
      {data.enabled && !selected.paused && !selected.deleted && <>
        <div className="student-balances__operations" role="group" aria-label="Изменение баланса"><button type="button" aria-pressed={operation === 'receipt'} className={operation === 'receipt' ? '' : 'student-balances__secondary'} disabled={busy} onClick={() => setOperation('receipt')}><Plus size={16} />Пополнить баланс</button><button type="button" aria-pressed={operation === 'adjustment'} className={operation === 'adjustment' ? '' : 'student-balances__secondary'} disabled={busy} onClick={() => setOperation('adjustment')}>Изменить баланс</button></div>
      {operation === 'receipt' ? <form onSubmit={add} className="student-balances__receipt">
        <h3>Полученный платёж</h3><p>Добавьте деньги, которые ученик действительно передал вам. Они оплатят ближайшие неоплаченные занятия.</p><div className="student-balances__fields">
          <label>Сумма, ₽<input required type="number" min="0.01" max="1000000000" step="0.01" value={draft.amount} onChange={event => change('amount', event.target.value)} disabled={busy} /></label>
          <label>Дата получения<input required type="date" max={today()} value={draft.receivedAt} onChange={event => change('receivedAt', event.target.value)} disabled={busy} /></label>
          <label>Отправитель<input value={draft.senderName} onChange={event => change('senderName', event.target.value)} maxLength={200} disabled={busy} /></label>
          <label>Комментарий<input value={draft.note} onChange={event => change('note', event.target.value)} maxLength={500} disabled={busy} /></label>
        </div><label className="student-balances__check"><input type="checkbox" checked={draft.confirmed} onChange={event => change('confirmed', event.target.checked)} disabled={busy} />Деньги получены; этот перевод ещё не учтён.</label>
        <label className="student-balances__check"><input type="checkbox" checked={draft.confirmedSeparate} onChange={event => change('confirmedSeparate', event.target.checked)} disabled={busy} />При совпадении суммы и даты это отдельный перевод.</label>
        <button type="submit" disabled={busy || !draft.confirmed || !draft.amount}><Plus size={17} />Внести платёж</button>
      </form> : <form onSubmit={correctBalance} className="student-balances__receipt student-balances__adjustment">
        <h3>Корректировка свободного баланса</h3><p>Корректировка не является новым платежом. Ранее оплаченные занятия не изменяются.</p>
        <div className="student-balances__fields"><label>Действие<select aria-label="Действие с балансом" value={adjustment.mode} disabled={busy} onChange={event => changeAdjustment('mode', event.target.value)}><option value="add">Добавить к балансу</option><option value="subtract">Уменьшить баланс</option><option value="set">Установить свободный остаток</option></select></label><label>{adjustment.mode === 'set' ? 'Новый свободный остаток, ₽' : 'Сумма изменения, ₽'}<input required type="number" min={adjustment.mode === 'set' ? '0' : '0.01'} max="1000000000" step="0.01" value={adjustment.amount} disabled={busy} onChange={event => changeAdjustment('amount', event.target.value)} /></label><label className="student-balances__reason">Причина изменения<input required maxLength={500} value={adjustment.reason} placeholder="Например, бонус или исправление ошибочного остатка" disabled={busy} onChange={event => changeAdjustment('reason', event.target.value)} /></label></div>
        <div className="student-balances__preview" aria-live="polite"><span>Сейчас <strong>{money(beforeCents / 100)}</strong></span><span aria-hidden="true">→</span><span>После корректировки <strong>{adjustmentValid ? money(afterCents / 100) : '—'}</strong></span></div>
        {adjustment.amount !== '' && afterCents < 0 && <p className="student-balances__error">Сумма превышает свободный остаток. Оплаченные занятия нельзя списать этой корректировкой.</p>}
        <p className="student-balances__hint">Это остаток перед автоматической оплатой занятий. Добавленная сумма может сразу оплатить ближайшие неоплаченные занятия. Списание уменьшит только свободные деньги; исправление ошибочной суммы также уменьшит их учёт в финансовом отчёте.</p>
        <button type="submit" disabled={busy || !adjustmentValid || !adjustment.reason.trim()}><Check size={17} />Сохранить корректировку</button>
      </form>}
      </>}
      <details className="student-balances__history" open={!studentId}><summary>История операций ({selected.entries.length})</summary><div className="student-balances__table-wrap"><table><thead><tr><th>Записано</th><th>Операция</th><th>Сумма</th><th>Остаток после</th></tr></thead><tbody>{selected.entries.map(entry => <tr key={entry.id}><td>{date(entry.recordedAt || entry.at)}</td><td><strong>{types[entry.type] || entry.type}</strong><span>{entry.source === 'bank' ? 'Банк · ' : entry.source === 'manual' ? 'Вручную · ' : ''}{entry.senderName || entry.note}{entry.type === 'receipt' ? ` · получено ${date(entry.at)}` : ''}{entry.dayKey ? ` · ${entry.dayKey} ${entry.time || ''}` : ''}{entry.type === 'opening' ? ` · ${entry.month}` : ''}</span></td><td>{entry.type === 'adjustment' ? `${entry.adjustmentAmount > 0 ? '+' : ''}${money(entry.adjustmentAmount)}` : <>{entry.type === 'reserve' ? '-' : ['receipt', 'release', 'opening'].includes(entry.type) ? '+' : ''}{money(entry.amount)}</>}</td><td>{money(entry.balance)}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
