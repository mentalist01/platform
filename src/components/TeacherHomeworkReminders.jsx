import { useEffect, useRef, useState } from 'react';
import { BookOpen, ArrowRight, Check } from 'lucide-react';
import { homeworkReminders } from '../services/homeworkReminders';
import './TeacherHomeworkReminders.css';

export function HomeworkReminderCard({ reminder, count = 1, busy = false, error = '', onOpen, onDismiss }) {
  const date = new Date(reminder.endedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return <aside className="teacher-homework-reminder" role="status" aria-live="polite">
    <div className="teacher-homework-reminder__heading"><span><BookOpen size={19} /></span>
      <div><b>Не забыли задать домашку?</b><small>{reminder.groupId ? 'Мини-группа' : 'Ученик'} · {reminder.name} · {date}{reminder.lessonTime ? ` · ${reminder.lessonTime}` : ''}</small></div>
      {count > 1 && <span className="teacher-homework-reminder__count">+{count - 1}</span>}
    </div>
    <p>Урок завершён, новой домашки пока нет.</p>
    {error && <p className="teacher-homework-reminder__error" role="alert">{error}</p>}
    <div className="teacher-homework-reminder__actions">
      <button type="button" disabled={busy} onClick={onOpen}>Перейти задать <ArrowRight size={16} /></button>
      <button type="button" disabled={busy} onClick={onDismiss}><Check size={16} /> Я так и хотел</button>
    </div>
  </aside>;
}

export default function TeacherHomeworkReminders({ userId, onOpen, paused = false }) {
  const [reminders, setReminders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snoozed, setSnoozed] = useState({});
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
  if (!reminder || paused) return null;
  const dismiss = async () => {
    setBusy(true); setError('');
    try {
      await homeworkReminders(reminder.id);
      if (alive.current) setReminders(current => current.filter(entry => entry.id !== reminder.id));
    } catch (failure) { if (alive.current) setError(failure.message || 'Не удалось сохранить ответ. Повторите.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <HomeworkReminderCard reminder={reminder} count={visible.length} busy={busy} error={error}
    onDismiss={dismiss} onOpen={() => {
      onOpen?.(reminder);
      setError('');
      setSnoozed(current => ({ ...current, [reminder.id]: Date.now() + 10 * 60_000 }));
    }} />;
}
