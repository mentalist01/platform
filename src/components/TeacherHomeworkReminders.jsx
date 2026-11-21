import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronUp, Minus } from 'lucide-react';
import { homeworkReminders, homeworkSuggestion, recentLessonReviews } from '../services/homeworkReminders';
import {TeacherLessonReviewDialog} from './TeacherLessonReview';
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

export function HomeworkReminderCard({ reminder, teacherId = '', count = 1, busy = false, error = '', onOpen, onDismiss, suggestion, collapsed, onToggle }) {
  const bodyId = useId();
  const date = new Date(reminder.endedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const toggleLabel = collapsed ? 'Развернуть напоминания о домашке' : 'Свернуть напоминание о домашке';
  return <aside className={`teacher-homework-reminder${collapsed ? ' teacher-homework-reminder--collapsed' : ''}`} aria-label="Напоминания о домашке">
    <div className="teacher-homework-reminder__heading">
      {!collapsed && <>
        <span><BookOpen size={19} aria-hidden="true" /></span>
        <div role="status"><b>Не забыли задать домашку?</b><small>{reminder.groupId ? 'Мини-группа' : 'Ученик'} · {reminder.name} · {date}{reminder.lessonTime ? ` · ${reminder.lessonTime}` : ''}</small></div>
        {count > 1 && <span className="teacher-homework-reminder__count">+{count - 1}</span>}
      </>}
      <button type="button" className="teacher-homework-reminder__toggle" onClick={onToggle}
        aria-label={collapsed ? `${toggleLabel} (${count})` : toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls={bodyId}>
        {collapsed ? <><BookOpen size={17} aria-hidden="true" /> Домашка <span>{count}</span><ChevronUp size={15} aria-hidden="true" /></>
          : <Minus size={17} aria-hidden="true" />}
      </button>
    </div>
    <div id={bodyId} hidden={collapsed}>
      <p>Урок завершён, новой домашки пока нет.</p>
      <HomeworkSuggestion rows={suggestion?.rows} group={Boolean(reminder.groupId)} />
      <HomeworkLessonNotePreview teacherId={teacherId} studentId={reminder.studentId} groupId={reminder.groupId} compact />
      {error && <p className="teacher-homework-reminder__error" role="alert">{error}</p>}
      <div className="teacher-homework-reminder__actions">
        <button type="button" disabled={busy} onClick={onOpen}>Перейти задать <ArrowRight size={16} /></button>
        <button type="button" disabled={busy} onClick={onDismiss}><Check size={16} /> Я так и хотел</button>
      </div>
    </div>
  </aside>;
}

export default function TeacherHomeworkReminders({ userId, onOpen, students, onStudentUpdated, paused = false, noteContext = {}, lessonSignal }) {
  const collapseKey = `homework-reminders-collapsed:${userId}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(collapseKey) === '1'; }
    catch { return false; }
  });
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    try { localStorage.setItem(collapseKey, collapsed ? '0' : '1'); }
    catch { /* The reminder remains usable without browser storage. */ }
  };
  const [reminders, setReminders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snoozed, setSnoozed] = useState({});
  const [suggestion, setSuggestion] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [activeReview, setActiveReview] = useState(null);
  const [liveReviews, setLiveReviews] = useState([]);
  const refreshRef = useRef(null);
  const seen = useRef(new Set());
  const autoReviewSnoozedUntil = useRef(0);
  const alive = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    alive.current = true;
    setReminders([]);
    setSnoozed({});
    setActiveReview(null);
    autoReviewSnoozedUntil.current = 0;
    setReviews([]);
    setLiveReviews([]);
    try {seen.current = new Set(JSON.parse(localStorage.getItem(`lesson-reviews-seen:${userId}`) || '[]'));}
    catch {seen.current = new Set();}
    const refresh = async () => {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const payload = await homeworkReminders();
        if (!cancelled) setReminders(payload.reminders || []);
        const recent = await recentLessonReviews();
        if (!cancelled) {setReviews(recent.lessons || []);setLiveReviews(recent.activeLessons || []);}
      } catch { /* A temporary outage must not invent missing homework. */ }
      finally { inFlight = false; }
    };
    void refresh();
    refreshRef.current = refresh;
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true; alive.current = false;
      refreshRef.current = null;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [userId]);
  useEffect(() => {void refreshRef.current?.();}, [lessonSignal]);
  useEffect(() => {
    const unseen = review => !seen.current.has(`${review.phase || 'after'}:${review.id}`) && !(review.phase !== 'before' && seen.current.has(review.id));
    const starting = liveReviews.find(unseen);
    if (starting && activeReview?.id !== starting.id) {setActiveReview(starting);return;}
    if (activeReview?.phase === 'before' && !liveReviews.some(review => review.id === activeReview.id)) {setActiveReview(null);return;}
    if (!paused && !activeReview && autoReviewSnoozedUntil.current <= Date.now()) setActiveReview(reviews.find(unseen) || null);
  }, [paused, reviews, liveReviews, activeReview]);
  const closeReview = () => {
    if (!activeReview) return;
    seen.current.add(`${activeReview.phase || 'after'}:${activeReview.id}`);
    try {localStorage.setItem(`lesson-reviews-seen:${userId}`, JSON.stringify([...seen.current].slice(-100)));} catch { /* The dialog remains usable when browser storage is full. */ }
    setActiveReview(null);
  };
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
    <TeacherParentReportReminder userId={userId} students={students} onStudentUpdated={onStudentUpdated} paused={paused || Boolean(activeReview)} showEntry={!reminder} />
    {activeReview && (activeReview.phase === 'before' || !paused) && <TeacherLessonReviewDialog key={`${activeReview.phase}:${activeReview.id}`} lesson={activeReview} teacherId={userId} onClose={closeReview} onAssign={request => {
      autoReviewSnoozedUntil.current = Date.now() + 10 * 60_000;
      setSnoozed(current => ({...current,[request.id]:autoReviewSnoozedUntil.current}));
      onOpen?.(request);
    }}/>}
    {reminder && !paused && !activeReview && <HomeworkReminderCard reminder={reminder} teacherId={userId} count={visible.length} busy={busy} error={error} collapsed={collapsed} onToggle={toggleCollapsed}
    suggestion={suggestion?.id === reminder.id && suggestion?.userId === userId ? suggestion : null}
    onDismiss={dismiss} onOpen={() => {
      const tasks = !reminder.groupId && suggestion?.id === reminder.id ? suggestion.rows?.find(row => row.studentId === reminder.studentId)?.tasks : [];
      onOpen?.({...reminder,suggestionTasks:tasks});
      setError('');
      setSnoozed(current => ({ ...current, [reminder.id]: Date.now() + 10 * 60_000 }));
    }} />}</>;
}
