import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lessonPaceApi } from '../services/lessonPaceApi';
import { paceLabel, paceShortLabel, paceTone } from '../utils/lessonPace';
import './LessonPaceFeedback.css';

const date = value => new Date(value).toLocaleString('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function StudentPaceBadge({ row, loaded, error, onClick }) {
  const feedback = row?.latest?.feedback;
  return <button type="button" className="student-pace-badge" data-tone={feedback ? paceTone(feedback.value) : 'pending'}
    onClick={event => { event.stopPropagation(); onClick(); }}
    title={error || (row?.latest ? `${date(row.latest.startAt)} · ${row.latest.groupName}` : 'Оценки после проведённых уроков')}
    aria-label="Темп уроков — открыть оценки ученика">
    <span>Темп уроков</span>
    <strong>{feedback ? `${paceShortLabel(feedback.value)} · ${feedback.value}/100`
      : row?.latest ? 'Ждём оценку' : error ? 'Не удалось загрузить' : loaded ? 'Пока нет оценок' : 'Загружаем…'}</strong>
    {row?.pendingCount > 0 && <small>Без ответа: {row.pendingCount}</small>}
  </button>;
}

export function StudentPaceHistory({ studentId, studentName, onClose, transport = lessonPaceApi }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef(null), requestBusy = useRef(false), generation = useRef(0);
  useEffect(() => {
    let alive = true;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current?.focus();
    const keepFocus = event => { if (!dialog.current?.contains(event.target)) dialog.current?.focus(); };
    document.addEventListener('focusin', keepFocus);
    const current = ++generation.current;
    requestBusy.current = false;
    setData(null); setError(''); setBusy(true);
    const refresh = async () => {
      if (requestBusy.current) return;
      requestBusy.current = true;
      try {
        const result = await transport.getStudentPaceHistory(studentId);
        if (alive) { setData(result); setError(''); }
      } catch (cause) { if (alive) setError(cause.message || 'Не удалось загрузить оценки'); }
      finally { if (alive && current === generation.current) { requestBusy.current = false; setBusy(false); } }
    };
    void refresh();
    return () => {
      alive = false; generation.current = current + 1;
      document.body.style.overflow = overflow;
      document.removeEventListener('focusin', keepFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [studentId, transport, retry]);
  const more = async () => {
    if (requestBusy.current || data?.nextOffset == null) return;
    const current = generation.current;
    requestBusy.current = true; setBusy(true);
    try {
      const next = await transport.getStudentPaceHistory(studentId, data.nextOffset);
      if (current === generation.current) {
        setData(previous => ({ ...next, lessons: [...new Map([...previous.lessons, ...next.lessons].map(row => [row.id, row])).values()] }));
        setError('');
      }
    } catch (cause) { if (current === generation.current) setError(cause.message || 'Не удалось загрузить оценки'); }
    finally { if (current === generation.current) { requestBusy.current = false; setBusy(false); } }
  };
  const keyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && [dialog.current, first].includes(document.activeElement)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="lesson-pace-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="student-pace-title"
      className="lesson-pace-dialog student-pace-history" onKeyDown={keyDown}>
      <header><div><span className="lesson-pace-eyebrow">Обратная связь после занятий</span>
        <h2 id="student-pace-title">Темп уроков · {studentName}</h2></div>
        <button type="button" onClick={onClose} aria-label="Закрыть оценки темпа">×</button></header>
      <p>Индивидуальные и групповые уроки. Оценку выбирает сам ученик: 0 — не успевает, 50 — в темпе, 100 — хочет быстрее.</p>
      {!data && !error && <p role="status">Загружаем оценки…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button></div>}
      {data?.lessons.length === 0 && <p>Пока нет завершённых занятий для оценки темпа.</p>}
      <ol>{data?.lessons.map(lesson => <li key={lesson.id} data-tone={lesson.feedback ? paceTone(lesson.feedback.value) : 'pending'}>
        <div className="student-pace-history__meta"><strong>{lesson.groupName}</strong><time dateTime={lesson.startAt}>{date(lesson.startAt)}</time></div>
        <p>{lesson.topic || 'Занятие'}</p>
        {lesson.feedback ? <><div className="student-pace-history__answer"><strong>{paceShortLabel(lesson.feedback.value)}</strong><b>{lesson.feedback.value}/100</b></div>
          <meter min="0" max="100" value={lesson.feedback.value} aria-label={paceLabel(lesson.feedback.value)} />
          <p>{paceLabel(lesson.feedback.value)}</p></> : <p className="student-pace-history__pending">Ученик ещё не оценил темп</p>}
      </li>)}</ol>
      {data?.nextOffset != null && <button type="button" disabled={busy} onClick={more}>{busy ? 'Загружаем…' : 'Показать более ранние'}</button>}
      <footer><button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)}>Обновить</button><button type="button" onClick={onClose}>Понятно</button></footer>
    </section>
  </div>, document.body);
}
