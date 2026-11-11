import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CalendarClock, Check, FileText, Undo2, X } from 'lucide-react';
import { api } from '../services/api';
import useStudentParentContacts from '../hooks/useStudentParentContacts';
import { isCurrentStudent } from '../utils/studentStudyStatus';
import { parentReportPeriod, parentReportRecipients, PARENT_REPORT_NEXT_CYCLE, readParentReportSnooze, skipParentReportReminder, snoozeParentReports } from '../utils/parentReportReminder';
import StudentMonthlyReportModal from './StudentMonthlyReportModal';
import './TeacherParentReportReminder.css';

const deviceStorage = () => { try { return window.localStorage; } catch { return undefined; } };

function ReportRecipientsDialog({ rows, month, busy, error, skipped, onOpen, onSent, onDefer, onClose, onSkip }) {
  const dialog = useRef(null);
  const pending = rows.filter(row => !row.sent && !row.deferred).length;
  const deferredCount = rows.filter(row => row.deferred).length;
  const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00Z`));
  useEffect(() => {
    const previous = document.activeElement, element = dialog.current;
    element.showModal();
    return () => { element.close(); if (previous?.isConnected) previous.focus?.(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="parent-report-reminder__dialog" aria-labelledby="parent-report-reminder-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><span className="parent-report-reminder__icon"><FileText size={24} /></span><div><small>ИТОГИ МЕСЯЦА · {monthLabel}</small><h2 id="parent-report-reminder-title">Отчёты родителям</h2></div>
      <button type="button" className="parent-report-reminder__close" onClick={onClose} aria-label="Закрыть напоминание"><X size={20} /></button></header>
    <p className="parent-report-reminder__intro">{pending ? `Осталось отправить: ${pending} из ${rows.length}.` : deferredCount ? 'На этот месяц напоминаний больше нет.' : 'Все отчёты отмечены как отправленные.'}{deferredCount > 0 && ` Отложено до следующего месяца: ${deferredCount}.`} Здесь ученики с сохранённым контактом родителя.</p>
    <p className="parent-report-reminder__hint">Откройте отчёт, проверьте текст и нажмите «Отправить». После отправки сообщения поставьте отметку.</p>
    {error && <p role="alert" className="parent-report-reminder__error">{error}</p>}
    <div className="parent-report-reminder__list">{rows.map(({ student, contact, sent, deferred }) => <article key={student.id} data-sent={sent} data-deferred={deferred}>
      <span className="parent-report-reminder__avatar">{sent ? <Check size={20} /> : String(student.name || '?').slice(0, 1)}</span>
      <div className="parent-report-reminder__person"><strong>{student.name || 'Ученик'}</strong><span>{contact.name || 'Имя родителя не указано'}{!isCurrentStudent(student) ? ' · сейчас не учится' : ''}</span>
        <label><input type="checkbox" checked={sent} disabled={Boolean(busy)} onChange={event => onSent(student, event.target.checked)} aria-label={`Отчёт отправлен · ${student.name}`} />{sent ? 'Отправлен' : 'Отчёт ещё не отправлен'}</label>
        {deferred && <span className="parent-report-reminder__deferred" role="status"><CalendarClock size={13} />Напомнить за следующий месяц</span>}</div>
      <div className="parent-report-reminder__row-actions">
        <button type="button" onClick={() => onOpen(student)} aria-label={`Открыть отчёт · ${student.name}`}>Открыть отчёт <ArrowRight size={15} /></button>
        {!sent && <button type="button" className="parent-report-reminder__defer" disabled={Boolean(busy)} onClick={() => onDefer(student, !deferred)} aria-label={`${deferred ? 'Вернуть напоминание' : 'Отправлю в следующем месяце'} · ${student.name}`}>
          {deferred ? <Undo2 size={14} /> : <CalendarClock size={14} />}{deferred ? 'Вернуть напоминание' : 'Отправлю в следующем месяце'}
        </button>}
      </div>
    </article>)}</div>
    <footer>
      <span>{skipped ? 'Следующее напоминание будет за новый отчётный месяц.' : 'Отправка остаётся под вашим контролем.'}</span>
      <div className="parent-report-reminder__footer-actions">
        {skipped ? <button type="button" onClick={onClose}>Закрыть</button> : <>
          {pending > 0 && <button type="button" disabled={Boolean(busy)} onClick={onSkip}>Отправлю в следующем месяце</button>}
          <button type="button" onClick={onClose}>Напомнить завтра</button>
        </>}
      </div>
    </footer>
  </dialog>, document.body);
}

export default function TeacherParentReportReminder({ userId, students = [], onStudentUpdated, paused = false, showEntry = true, getNow = Date.now }) {
  const { contacts, loading, error: contactError } = useStudentParentContacts(userId);
  const [now, setNow] = useState(getNow), [open, setOpen] = useState(false), [selected, setSelected] = useState(null);
  const [dismissed, setDismissed] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const period = parentReportPeriod(now);
  const reportMonth = typeof open === 'string' && open ? open : period.month;
  const rows = useMemo(() => parentReportRecipients(students, contacts, reportMonth), [students, contacts, reportMonth]);
  const pending = rows.filter(row => !row.sent && !row.deferred).length;
  const reportDismissal = month => dismissed?.userId === userId && dismissed.month === month
    ? dismissed.until : readParentReportSnooze(userId, month, deviceStorage());
  const until = reportDismissal(period.month);
  const skipped = reportDismissal(reportMonth) === PARENT_REPORT_NEXT_CYCLE;
  useEffect(() => {
    const tick = () => setNow(getNow());
    const sync = () => { setDismissed(null); tick(); };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick); window.addEventListener('storage', sync);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); window.removeEventListener('storage', sync); };
  }, [getNow]);
  useEffect(() => {
    if (!paused && !loading && !contactError && period.due && pending && until !== PARENT_REPORT_NEXT_CYCLE
      && until <= period.date && !open && !selected
      && document.visibilityState !== 'hidden' && !document.querySelector('[aria-modal="true"], dialog[open]')) setOpen(period.month);
  }, [paused, loading, contactError, period.due, period.date, period.month, pending, until, open, selected, now]);
  const dismiss = (skip = false) => {
    const until = skip || skipped
      ? skipParentReportReminder(userId, reportMonth, deviceStorage())
      : snoozeParentReports(userId, getNow(), deviceStorage(), reportMonth);
    setDismissed({ userId, month: reportMonth, until });
    setOpen(false);
    setError('');
  };
  const markSent = async (student, sent) => {
    if (busy) return;
    setBusy(student.id); setError('');
    try {
      const result = await api.updateStudentMonthlyReportStatus(student.id, reportMonth, sent);
      onStudentUpdated?.({ id: student.id, monthlyReportSentMonths: result.monthlyReportSentMonths, monthlyReportDeferredMonths: result.monthlyReportDeferredMonths });
    } catch (failure) { setError(failure.message || 'Не удалось сохранить отметку.'); }
    finally { setBusy(''); }
  };
  const deferReport = async (student, deferred) => {
    if (busy) return;
    setBusy(student.id); setError('');
    try {
      const result = await api.deferStudentMonthlyReport(student.id, reportMonth, deferred);
      onStudentUpdated?.({ id: student.id, monthlyReportSentMonths: result.monthlyReportSentMonths, monthlyReportDeferredMonths: result.monthlyReportDeferredMonths });
    } catch (failure) { setError(failure.message || 'Не удалось сохранить перенос напоминания.'); }
    finally { setBusy(''); }
  };
  if (paused || (!rows.length && !contactError)) return null;
  const selectedStudent = selected && students.find(student => student.id === selected.id);
  return <>
    {showEntry && <button type="button" className="parent-report-reminder__entry" onClick={() => { setOpen(period.month); setError(''); }}><FileText size={17} />Отчёты родителям{pending > 0 && until !== PARENT_REPORT_NEXT_CYCLE && <b>{pending}</b>}</button>}
    {open && !selected && <ReportRecipientsDialog rows={rows} month={reportMonth} busy={busy} error={error || contactError} skipped={skipped}
      onOpen={student => setSelected({ id: student.id, month: reportMonth })} onSent={markSent} onDefer={deferReport} onClose={() => dismiss()} onSkip={() => dismiss(true)} />}
    {selectedStudent && <StudentMonthlyReportModal key={selectedStudent.id} student={selectedStudent} initialMonth={selected.month} onStudentUpdated={onStudentUpdated} onClose={() => setSelected(null)} />}
  </>;
}
