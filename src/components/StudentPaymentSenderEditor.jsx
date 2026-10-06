import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, ShieldCheck, X } from 'lucide-react';
import { findPaymentSenderConflict } from '../utils/paymentSenderLinks.js';
import './StudentPaymentSenderEditor.css';

export default function StudentPaymentSenderEditor({
  student, links, loading, ready, busyKey, draft, onDraftChange,
  onAdd, onRemove, onReviewMode,
}) {
  const [confirmAutoKey, setConfirmAutoKey] = useState('');
  const studentLinks = links.filter(link => String(link.studentId) === String(student.id));
  const conflict = findPaymentSenderConflict(links, draft, student.id);
  const busy = Boolean(busyKey);
  const conflictLabel = conflict?.studentName || 'другой ученик';
  return <section onClick={event => event.stopPropagation()} className="student-payment-sender rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-slate-700" aria-label="Плательщики Т-Банка">
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
      <ShieldCheck size={15} /> Плательщики Т-Банка
      {loading && <span className="font-normal">Загрузка…</span>}
    </div>
    {studentLinks.length > 0 && <div className="mb-3 flex flex-col gap-2">
      {studentLinks.map(link => <div key={link.senderKey} className="student-payment-sender__link flex flex-wrap items-center gap-2 rounded-lg border border-purple-100 bg-white/80 px-2 py-1.5 text-xs">
        <strong className="min-w-0 break-words">{link.senderName}</strong>
        {link.manualReview && <span className="student-payment-sender__mode rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">Ручная проверка</span>}
        <button type="button" disabled={busy || !ready} onClick={() => { if (link.manualReview) setConfirmAutoKey(link.senderKey); else onReviewMode(link, true); }}
          className="ml-auto rounded-md px-2 py-1 font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50 dark:text-purple-300 dark:hover:bg-purple-900/30">
          {link.manualReview ? 'Вернуть автоучёт' : 'Ручная проверка'}
        </button>
        <button type="button" disabled={busy || !ready} onClick={() => onRemove(link.senderName)} aria-label={`Удалить привязку ${link.senderName}`}
          className="rounded-md p-1 text-slate-400 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50 dark:hover:bg-purple-900/30"><X size={14} /></button>
        {confirmAutoKey === link.senderKey && link.manualReview && <div className="student-payment-sender__resume w-full rounded-lg bg-amber-50 p-2 text-amber-900">
          <p>Все будущие переводы от «{link.senderName}» будут автоматически учитываться только для ученика «{student.name}». Включайте автоучёт, если совпадение имён уже устранено.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} className="rounded-md bg-purple-600 px-2 py-1 font-semibold text-white disabled:opacity-50" onClick={() => { onReviewMode(link, false); setConfirmAutoKey(''); }}>Включить автоучёт</button>
            <button type="button" className="px-2 py-1" onClick={() => setConfirmAutoKey('')}>Отмена</button>
          </div>
        </div>}
      </div>)}
    </div>}
    <div className="flex flex-col gap-2 sm:flex-row">
      <input type="text" maxLength={120} value={draft} onChange={event => onDraftChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (ready && !loading && !busy && !conflict && draft.trim()) onAdd(); } }}
        aria-label={`Имя плательщика для ${student.name}`} aria-invalid={Boolean(conflict)} aria-describedby={conflict ? `payer-conflict-${student.id}` : undefined}
        placeholder="Имя отправителя точно как в банке"
        className={`min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300 dark:bg-slate-950/40 ${conflict ? 'border-amber-400 dark:border-amber-600' : 'border-purple-200 dark:border-purple-500/30'}`} />
      <button type="button" onClick={onAdd} disabled={!ready || loading || busy || Boolean(conflict) || !draft.trim()}
        className="inline-flex items-center justify-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40">
        <Plus size={14} /> {busyKey === `add:${student.id}` ? 'Сохраняем…' : 'Привязать'}
      </button>
    </div>
    {conflict && <div id={`payer-conflict-${student.id}`} role="alert" className="student-payment-sender__conflict mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <div className="flex items-start gap-2"><AlertTriangle size={16} className="shrink-0" /><div><strong>Имя уже используется</strong><p className="mt-1">«{conflict.senderName}» — {conflictLabel}. Сохранение заблокировано: прежняя привязка не изменится.</p></div></div>
      {conflict.manualReview && <>
        <p className="mt-2 flex items-start gap-1"><CheckCircle2 size={14} className="shrink-0" /> Ручная проверка уже включена. Переводы с этим именем ждут проверки и не отмечают занятия автоматически.</p>
        <button type="button" className="mt-2 rounded-lg border border-amber-300 px-2 py-1.5 font-semibold dark:border-amber-600" onClick={() => onDraftChange('')}>Продолжить без автопривязки</button>
      </>}
    </div>}
    <details className="mt-2 text-xs" open={conflict ? true : undefined}>
      <summary className="cursor-pointer font-semibold text-purple-700 dark:text-purple-300">Что делать при совпадении имён?</summary>
      <div className="student-payment-sender__help mt-2 space-y-2 leading-relaxed text-slate-600">
        <p>Сначала сверьте имя с уведомлением банка. Если там другое имя, укажите его точно. Не добавляйте номер ученика или выдуманную букву: банк их не передаст.</p>
        <p>Если прежняя привязка ошибочна или плательщик теперь оплачивает только нового ученика, удалите привязку в карточке прежнего ученика, затем сохраните здесь.</p>
        <p>Если банк показывает одинаковые имена разных людей или один человек платит за нескольких учеников, включите ручную проверку этого имени. Будущие переводы останутся в «Финансы → Автооплата → Требует проверки»; после сверки отметьте оплату нужных занятий в расписании. Уже учтённые оплаты сохранятся.</p>
        {conflict && !conflict.manualReview && <button type="button" disabled={busy || loading || !ready} onClick={() => onReviewMode(conflict, true)}
          className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-3 py-2 font-semibold text-purple-700 disabled:opacity-50 dark:border-purple-500/30 dark:bg-purple-900/30 dark:text-purple-200">
          <ShieldCheck size={14} /> Включить ручную проверку для «{conflict.senderName}»
        </button>}
      </div>
    </details>
    {!ready && !loading && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Не удалось проверить плательщиков. Обновите список перед сохранением.</p>}
  </section>;
}
