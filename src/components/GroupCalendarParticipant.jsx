import CalendarStudentPayer from './CalendarStudentPayer.jsx';

export default function GroupCalendarParticipant({member, senders, cancelled, busy, canMarkAbsence, onPayment, onAbsence}) {
  const status = String(member.status || 'pending');
  const paid = status === 'paid', trial = status === 'trial', absent = member.absenceWaived === true;
  const unavailable = cancelled || status === 'cancelled';
  const statusLabel = unavailable ? 'Отменено' : absent ? 'Не был · без оплаты' : trial ? 'Пробное'
    : paid ? 'Оплатил(а)' : status === 'not-required' ? 'Не участвует по расписанию'
      : status === 'unpaid' ? 'Не оплатил(а)' : 'Ожидаем оплату';
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
    <div className="min-w-0 flex-1">
      <span className="block truncate text-xs font-semibold text-slate-800">{member.studentName || 'Ученик'}</span>
      <CalendarStudentPayer studentId={member.studentId} senders={senders} compact />
      {!unavailable && canMarkAbsence && <button type="button" onClick={() => onAbsence(member)}
        disabled={busy || (!absent && (paid || trial))}
        title={absent ? 'Отменить отметку пропуска этого занятия' : paid ? 'Сначала отмените оплату, затем отметьте пропуск'
          : status === 'not-required' ? 'Оплата уже не требуется. Можно сохранить отметку пропуска.'
            : 'Отметить пропуск этого занятия без начисления оплаты'}
        className="mt-1 rounded-md px-1 py-1 text-[11px] font-semibold text-slate-500 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
        {absent ? 'Отменить отметку пропуска' : 'Не был на занятии'}
      </button>}
    </div>
    <button type="button" onClick={() => onPayment(member)}
      disabled={busy || unavailable || trial || absent || status === 'not-required'}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold disabled:cursor-not-allowed ${
        unavailable || absent || status === 'not-required' ? 'border-slate-200 bg-slate-50 text-slate-600'
          : paid ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : status === 'unpaid' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}>{statusLabel}</button>
  </div>;
}
