import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, FileText, X } from 'lucide-react';
import { api } from '../services/api';
import useStudentParentContacts from '../hooks/useStudentParentContacts';
import { isCurrentStudent } from '../utils/studentStudyStatus';
import { parentReportPeriod, parentReportRecipients, readParentReportSnooze, snoozeParentReports } from '../utils/parentReportReminder';
import StudentMonthlyReportModal from './StudentMonthlyReportModal';
import './TeacherParentReportReminder.css';

const deviceStorage = () => { try { return window.localStorage; } catch { return undefined; } };

function ReportRecipientsDialog({ rows, month, busy, error, onOpen, onSent, onClose }) {
  const dialog = useRef(null);
  const pending = rows.filter(row => !row.sent).length;
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
    <p className="parent-report-reminder__intro">{pending ? `Осталось отправить: ${pending} из ${rows.length}.` : 'Все отчёты отмечены как отправленные.'} Здесь ученики с сохранённым контактом родителя.</p>
    <p className="parent-report-reminder__hint">Откройте отчёт, проверьте текст и нажмите «Отправить». После отправки сообщения поставьте отметку.</p>
    {error && <p role="alert" className="parent-report-reminder__error">{error}</p>}
    <div className="parent-report-reminder__list">{rows.map(({ student, contact, sent }) => <article key={student.id} data-sent={sent}>
      <span className="parent-report-reminder__avatar">{sent ? <Check size={20} /> : String(student.name || '?').slice(0, 1)}</span>
      <div className="parent-report-reminder__person"><strong>{student.name || 'Ученик'}</strong><span>{contact.name || 'Имя родителя не указано'}{!isCurrentStudent(student) ? ' · сейчас не учится' : ''}</span>
        <label><input type="checkbox" checked={sent} disabled={Boolean(busy)} onChange={event => onSent(student, event.target.checked)} aria-label={`Отчёт отправлен · ${student.name}`} />{sent ? 'Отправлен' : 'Отчёт ещё не отправлен'}</label></div>
      <button type="button" onClick={() => onOpen(student)} aria-label={`Открыть отчёт · ${student.name}`}>Открыть отчёт <ArrowRight size={15} /></button>
    </article>)}</div>
    <footer><span>Отправка остаётся под вашим контролем.</span><button type="button" onClick={onClose}>Напомнить завтра</button></footer>
  </dialog>, document.body);
}

export default function TeacherParentReportReminder({ userId, students = [], onStudentUpdated, paused = false, showEntry = true, getNow = Date.now }) {
  const { contacts, loading, error: contactError } = useStudentParentContacts(userId);
  const [now, setNow] = useState(getNow), [open, setOpen] = useState(false), [selected, setSelected] = useState(null);
  const [dismissed, setDismissed] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const period = parentReportPeriod(now);
  const rows = useMemo(() => parentReportRecipients(students, contacts, period.month), [students, contacts, period.month]);
  const pending = rows.filter(row => !row.sent).length;
  const until = dismissed?.month === period.month ? dismissed.until : readParentReportSnooze(userId, period.month, deviceStorage());
  useEffect(() => {
    const tick = () => setNow(getNow());
    const sync = () => { setDismissed(null); tick(); };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick); window.addEventListener('storage', sync);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); window.removeEventListener('storage', sync); };
  }, [getNow]);
  useEffect(() => {
    if (!paused && !loading && !contactError && period.due && pending && until <= period.date && !open && !selected
      && document.visibilityState !== 'hidden' && !document.querySelector('[aria-modal="true"], dialog[open]')) setOpen(true);
  }, [paused, loading, contactError, period.due, period.date, pending, until, open, selected, now]);
  const dismiss = () => {
    setDismissed({ month: period.month, until: snoozeParentReports(userId, getNow(), deviceStorage()) }); setOpen(false); setError('');
  };
  const markSent = async (student, sent) => {
    if (busy) return;
    setBusy(student.id); setError('');
    try {
      const result = await api.updateStudentMonthlyReportStatus(student.id, period.month, sent);
      onStudentUpdated?.({ id: student.id, monthlyReportSentMonths: result.monthlyReportSentMonths });
    } catch (failure) { setError(failure.message || 'Не удалось сохранить отметку.'); }
    finally { setBusy(''); }
  };
  if (paused || (!rows.length && !contactError)) return null;
  const selectedStudent = selected && students.find(student => student.id === selected.id);
  return <>
    {showEntry && <button type="button" className="parent-report-reminder__entry" onClick={() => { setOpen(true); setError(''); }}><FileText size={17} />Отчёты родителям{pending > 0 && <b>{pending}</b>}</button>}
    {open && !selected && <ReportRecipientsDialog rows={rows} month={period.month} busy={busy} error={error || contactError} onOpen={student => setSelected({ id: student.id, month: period.month })} onSent={markSent} onClose={dismiss} />}
    {selectedStudent && <StudentMonthlyReportModal key={selectedStudent.id} student={selectedStudent} initialMonth={selected.month} onStudentUpdated={onStudentUpdated} onClose={() => setSelected(null)} />}
  </>;
}
