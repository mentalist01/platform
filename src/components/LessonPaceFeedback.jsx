import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lessonPaceApi } from '../services/lessonPaceApi';
import { paceLabel } from '../utils/lessonPace';
import './LessonPaceFeedback.css';

export default function LessonPaceFeedback({ user, transport = lessonPaceApi }) {
  const [lesson, setLesson] = useState(null);
  const [value, setValue] = useState(50);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const answered = useRef(new Set());
  const dialog = useRef(null);
  useEffect(() => {
    if (user?.role !== 'student') return;
    let alive = true, pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = (await transport.getPendingLessonPace()).lesson;
        if (alive && next && !answered.current.has(next.id)) {
          setLesson(current => current || next);
        }
      } catch { /* Lessons stay usable during an outage. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      alive = false; clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [transport, user?.id, user?.role]);
  useEffect(() => {
    setValue(50); setTouched(false); setError('');
    if (!lesson) return;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keepFocus = event => { if (!dialog.current?.contains(event.target)) dialog.current?.focus(); };
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('focusin', keepFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [lesson]);
  if (user?.role !== 'student' || !lesson) return null;
  const save = async () => {
    setSaving(true); setError('');
    try {
      await transport.saveLessonPace(lesson.groupId, lesson.id, value);
      answered.current.add(lesson.id);
      setLesson(null);
      try {
        const next = (await transport.getPendingLessonPace()).lesson;
        if (next && !answered.current.has(next.id)) setLesson(next);
      } catch { /* Remaining unanswered lessons will be retried by the refresh. */ }
    } catch (cause) { setError(cause.message || 'Не удалось сохранить. Попробуйте ещё раз.'); }
    finally { setSaving(false); }
  };
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    if (event.key !== 'Tab') return;
    const elements = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && [dialog.current, first].includes(document.activeElement)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="lesson-pace-backdrop">
    <section className="lesson-pace-dialog" role="dialog" aria-modal="true" aria-labelledby="lesson-pace-title" tabIndex={-1} ref={dialog} onKeyDown={keyDown}>
      <span className="lesson-pace-eyebrow">После занятия · {lesson.groupName}</span>
      <h2 id="lesson-pace-title">Как тебе темп урока?</h2>
      <p>{lesson.topic || 'Занятие'} · {new Date(lesson.startAt).toLocaleDateString('ru-RU')}</p>
      <p>Ответ увидит преподаватель. Это поможет выбрать удобный темп следующего занятия.</p>
      <p>Выбери оценку и отправь её, чтобы продолжить.</p>
      <div className="lesson-pace-current" aria-live="polite">{paceLabel(value)}</div>
      <input aria-label="Насколько я поспеваю за темпом урока" aria-valuetext={paceLabel(value)} type="range" min="0" max="100" step="1" value={value} disabled={saving}
        onChange={event => { setValue(Number(event.target.value)); setTouched(true); }} />
      <div className="lesson-pace-labels"><span>Отстаю,<br />ничего не успеваю</span><button disabled={saving} onClick={() => { setValue(50); setTouched(true); }}>Всё круто,<br />я в темпе занятия</button><span>Слишком легко,<br />нужен темп быстрее</span></div>
      {error && <p role="alert">{error}</p>}
      <div className="lesson-pace-actions"><button className="lesson-pace-submit" disabled={saving || !touched} onClick={save}>{saving ? 'Сохраняем…' : 'Отправить оценку'}</button></div>
    </section>
  </div>, document.body);
}

export function LessonPaceResults({ groupId, lessonId, transport = lessonPaceApi }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const refresh = () => transport.getLessonPace(groupId, lessonId).then(result => {
      if (alive) { setData(result); setError(''); }
    }).catch(cause => { if (alive) setError(cause.message); });
    void refresh(); const timer = setInterval(refresh, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [groupId, lessonId, open, transport]);
  return <div className="lesson-pace-results"><button onClick={() => setOpen(!open)} aria-expanded={open}>Темп урока — ответы учеников</button>
    {open && <div>{error && <p role="alert">{error}</p>}{!data && !error && <p>Загружаем…</p>}
      {data && <><p>Ответили {data.responses.length} из {data.total}</p>{data.responses.map(row => <div className="lesson-pace-response" key={row.studentId}>
        <strong>{row.name}</strong><span>{paceLabel(row.value)} · {row.value}/100</span><meter min="0" max="100" value={row.value} aria-label={`${row.name}: ${paceLabel(row.value)}`} />
      </div>)}{data.pendingStudents?.map(row => <div className="lesson-pace-response" key={row.studentId}><strong>{row.name}</strong><span>Ещё не оценил темп</span></div>)}</>}
    </div>}
  </div>;
}
