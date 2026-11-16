import { useEffect, useRef, useState } from 'react';
import { BookOpen, ArrowRight, Check } from 'lucide-react';
import { homeworkReminders, homeworkSuggestion } from '../services/homeworkReminders';
import './TeacherHomeworkReminders.css';
import TeacherParentReportReminder from './TeacherParentReportReminder';
import TeacherHomeworkNotes, { HomeworkLessonNotePreview } from './TeacherHomeworkNotes';

function HomeworkSuggestion({rows, group}) {
  if (!rows?.length) return null;
  return <section className="teacher-homework-suggestion" aria-label="Подсказка к домашке">
    {rows.map(row => <div key={row.studentId}>
      {group && <b>{row.name}</b>}
      <dl>
        {row.concerns && <div><dt>Проблемы</dt><dd>{row.concerns}</dd></div>}
        {row.repeat && <div><dt>Что повторить</dt><dd>{row.repeat}</dd></div>}
        {row.homework && <div><dt>Предлагаю задать</dt><dd>{row.homework}</dd></div>}
      </dl>
    </div>)}
  </section>;
}

export function HomeworkReminderCard({ reminder, teacherId = '', count = 1, busy = false, error = '', onOpen, onDismiss, suggestion }) {
  const date = new Date(reminder.endedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return <aside className="teacher-homework-reminder" role="status" aria-live="polite">
    <div className="teacher-homework-reminder__heading"><span><BookOpen size={19} /></span>
      <div><b>Не забыли задать домашку?</b><small>{reminder.groupId ? 'Мини-группа' : 'Ученик'} · {reminder.name} · {date}{reminder.lessonTime ? ` · ${reminder.lessonTime}` : ''}</small></div>
      {count > 1 && <span className="teacher-homework-reminder__count">+{count - 1}</span>}
    </div>
    <p>Урок завершён, новой домашки пока нет.</p>
    <HomeworkSuggestion rows={suggestion?.rows} group={Boolean(reminder.groupId)} />
    <HomeworkLessonNotePreview teacherId={teacherId} studentId={reminder.studentId} groupId={reminder.groupId} compact />
    {error && <p className="teacher-homework-reminder__error" role="alert">{error}</p>}
    <div className="teacher-homework-reminder__actions">
      <button type="button" disabled={busy} onClick={onOpen}>Перейти задать <ArrowRight size={16} /></button>
      <button type="button" disabled={busy} onClick={onDismiss}><Check size={16} /> Я так и хотел</button>
    </div>
  </aside>;
}

export default function TeacherHomeworkReminders({ userId, onOpen, students, onStudentUpdated, paused = false, noteContext = {} }) {
  const [reminders, setReminders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snoozed, setSnoozed] = useState({});
  const [suggestion, setSuggestion] = useState(null);
  const alive = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    alive.current = true;
    setReminders([]);
    setSnoozed({});
    const refresh = async () => {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const payload = await homeworkReminders();
        if (!cancelled) setReminders(payload.reminders || []);
      } catch { /* A temporary outage must not invent missing homework. */ }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true; alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [userId]);
  const visible = reminders.filter(reminder => !(snoozed[reminder.id] > Date.now()));
  const reminder = visible[0];
  const suggestionId = paused ? null : reminder?.id;
  useEffect(() => {
    if (!suggestionId) return undefined;
    const controller = new AbortController();
    let fetching = false;
    let found = false;
    const refresh = async () => {
      if (fetching || found || document.visibilityState === 'hidden' || controller.signal.aborted) return;
      fetching = true;
      try {
        const result = await homeworkSuggestion(suggestionId, controller.signal);
        if (!controller.signal.aborted && result?.id === suggestionId) {
          found = true;
          setSuggestion({userId, ...result});
        }
      } catch { /* Preserve the ordinary reminder while suggestions are unavailable. */ }
      finally { fetching = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [suggestionId, userId]);
  const dismiss = async () => {
    setBusy(true); setError('');
    try {
      await homeworkReminders(reminder.id);
      if (alive.current) setReminders(current => current.filter(entry => entry.id !== reminder.id));
    } catch (failure) { if (alive.current) setError(failure.message || 'Не удалось сохранить ответ. Повторите.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <><TeacherHomeworkNotes teacherId={userId} students={students} groups={noteContext.groups} activeStudentId={noteContext.studentId} activeGroupId={noteContext.groupId} visible={paused} />
    <TeacherParentReportReminder userId={userId} students={students} onStudentUpdated={onStudentUpdated} paused={paused} showEntry={!reminder} />
    {reminder && !paused && <HomeworkReminderCard reminder={reminder} teacherId={userId} count={visible.length} busy={busy} error={error}
    suggestion={suggestion?.id === reminder.id && suggestion?.userId === userId ? suggestion : null}
    onDismiss={dismiss} onOpen={() => {
      onOpen?.(reminder);
      setError('');
      setSnoozed(current => ({ ...current, [reminder.id]: Date.now() + 10 * 60_000 }));
    }} />}</>;
}
