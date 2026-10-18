import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Heart, RefreshCcw, Search, X } from 'lucide-react';
import { teacherHomeworkLives } from '../services/homeworkLives';
import { formatLives } from '../utils/homeworkLives';
import { PixelLives, TeacherHomeworkLivesPanel } from './HomeworkLives.jsx';
import './TeacherLivesOverview.css';

export default function TeacherLivesOverview({ students = [], onClose }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0), [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [selected, setSelected] = useState(null);
  const panel = useRef(null), close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const elements = [...panel.current.querySelectorAll('button:not(:disabled),input,select,summary,[tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  useEffect(() => {
    let cancelled = false; setBusy(true); setError('');
    teacherHomeworkLives().then(value => { if (!cancelled) setData(value); })
      .catch(failure => { if (!cancelled) setError(failure.message || 'Не удалось загрузить жизни.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [revision]);
  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    window.addEventListener('homework-lives-updated', update);
    return () => window.removeEventListener('homework-lives-updated', update);
  }, []);
  const rows = (data?.students || []).map(row => ({ ...row, nickname: students.find(student => student.id === row.studentId)?.nickname || '' }));
  const lost = rows.filter(row => row.remaining < 3), zero = rows.filter(row => row.remaining === 0);
  const reviews = rows.filter(row => row.pendingReviews.length || row.needsReview);
  const visible = rows.filter(row => `${row.name} ${row.nickname}`.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU'))
    && (filter === 'all' || filter === 'lost' && row.remaining < 3 || filter === 'zero' && row.remaining === 0 || filter === 'review' && (row.pendingReviews.length || row.needsReview)))
    .sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name, 'ru'));
  const month = data?.month ? new Date(`${data.month}-15T12:00:00+03:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : '';
  return createPortal(<div className="teacher-lives-shade" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="teacher-lives-overview" ref={panel} role="dialog" aria-modal="true" aria-labelledby="teacher-lives-heading">
      <header><span className="teacher-lives-overview__icon"><Heart size={23} /></span><div><h2 id="teacher-lives-heading">Жизни учеников</h2><p>{month || 'Текущий месяц'} · только домашняя работа по ЕГЭ</p></div><button ref={close} type="button" aria-label="Закрыть список жизней" onClick={onClose}><X size={21} /></button></header>
      <div className="teacher-lives-overview__body">
        {selected ? <><button className="teacher-lives-overview__back" type="button" onClick={() => setSelected(null)}><ArrowLeft size={16} /> Все ученики</button><TeacherHomeworkLivesPanel key={selected.studentId} studentId={selected.studentId} studentName={selected.name} /></> : <>
          <div className="teacher-lives-overview__summary"><div><span>Всего учеников</span><b>{data ? rows.length : '—'}</b></div><div><span>Есть списания</span><b>{data ? lost.length : '—'}</b></div><div><span>Жизни закончились</span><b>{data ? zero.length : '—'}</b></div></div>
          <div className="teacher-lives-overview__tools"><label><Search size={17} /><input type="search" aria-label="Найти ученика в списке жизней" placeholder="Имя или второе имя ученика" value={query} onChange={event => setQuery(event.target.value)} /></label><button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCcw size={15} /> {busy ? 'Обновляем…' : 'Обновить'}</button></div>
          <div className="teacher-lives-overview__filters">{[['all', 'Все', rows.length], ['lost', 'Есть списания', lost.length], ['zero', 'Без жизней', zero.length], ['review', 'Нужно внимание', reviews.length]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{data ? count : '—'}</span></button>)}</div>
          {error && <p role="alert" className="teacher-lives-overview__error">{error}{data ? ' Показаны последние загруженные данные.' : ''}</p>}
          {!data && busy && <p role="status">Загружаем жизни учеников…</p>}
          {data && !data.settings.enabled && <p>Система жизней пока выключена.</p>}
          {data?.settings.enabled && <div className="teacher-lives-overview__table"><table><thead><tr><th>Ученик</th><th>Осталось</th><th>Списано за месяц</th><th>Состояние</th></tr></thead><tbody>{visible.map(row => <tr key={row.studentId}><td><button type="button" onClick={() => setSelected(row)}>{row.name}<small>{row.nickname || 'Открыть историю списаний →'}</small>{row.adaptation?.active && <small>Адаптация · {row.adaptation.completedLessons}/8 занятий · списания ×½</small>}</button></td><td><span className="teacher-lives-overview__balance"><PixelLives remaining={row.remaining} size="small" /><b>{formatLives(row.remaining)} / 3</b></span></td><td>{row.remaining < 3 ? `−${formatLives(3 - row.remaining)}` : '0'}</td><td><span className={`teacher-lives-overview__state ${row.pendingReviews.length || row.remaining === 0 ? 'is-empty' : row.needsReview || row.remaining < 1 ? 'is-warning' : ''}`}>{row.pendingReviews.length ? 'Нужен разговор' : row.remaining === 0 ? 'Жизни закончились' : row.needsReview ? 'Нужна проверка' : row.remaining < 1 ? 'Мало жизней' : 'Всё в порядке'}</span></td></tr>)}</tbody></table>{!visible.length && <p className="teacher-lives-overview__empty">По этим условиям учеников нет.</p>}</div>}
          <p className="teacher-lives-overview__foot">Нажмите на имя, чтобы увидеть, за какие работы списаны жизни. Python не отнимает сердца. Первого числа запас снова составит 3 жизни.</p>
        </>}
      </div>
    </section>
  </div>, document.body);
}
