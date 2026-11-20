import { useState } from 'react';
import { Brush, CalendarDays, ChevronDown, Clock3, Code2, Play, Search, Video } from 'lucide-react';
import { lessonRecordingState } from '../utils/studentLessonRecordings.js';

const pageSize = 12;
const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

export default function StudentGroupHistory({ lessons, now, overrunMs, schedule, loading, onOpenLesson, onOpenReplay, libraryRecordings = [], onOpenLibraryRecording }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const search = query.trim().toLocaleLowerCase('ru');
  const libraryById = new Map(libraryRecordings.map(entry => [entry.id,entry]));
  const entries = lessons.flatMap(lesson => {
    if (lesson.status === 'cancelled') return [];
    const start = Date.parse(lesson.startsAt || lesson.startAt);
    if (!Number.isFinite(start)) return [];
    const duration = Math.max(15, Number(lesson.durationMinutes) || 60);
    const finished = lesson.status === 'completed' || start + duration * 60_000 + overrunMs <= now || lesson.recording?.available || libraryById.has(lesson.id);
    return [{ lesson, start, duration, finished, label: date.format(start), hour: time.format(start) }];
  }).filter(entry => schedule ? !entry.finished : entry.finished).sort((a,b) => schedule ? a.start-b.start : b.start-a.start);
  const matches = entries.filter(({ lesson, label, hour, start }) => [lesson.topic, label, hour, new Date(start).toISOString().slice(0,10)]
    .join(' ').toLocaleLowerCase('ru').includes(search));
  return <section className="sgl-history" aria-label={schedule ? 'Расписание' : 'Прошедшие занятия'}>
    {!schedule && <div className="sgl-filters sgl-history-search"><label><Search size={18} aria-hidden="true"/>
      <input type="search" placeholder="Найти тему или дату" aria-label="Поиск по записям группы" value={query}
        onChange={event => { setQuery(event.target.value); setLimit(pageSize); }}/>
    </label></div>}
    {loading && !entries.length ? <p className="sgl-empty" role="status">Загружаем занятия…</p>
      : !matches.length ? <div className="sgl-empty"><Video size={27} aria-hidden="true"/>
        <h3>{search ? 'Занятия не найдены' : schedule ? 'Ближайших занятий пока нет' : 'Прошедших занятий пока нет'}</h3>
      </div> : <ul className="sgl-history-list">
        {matches.slice(0,limit).map(({ lesson, start, duration, label, hour }) => {
          const recording = lessonRecordingState(lesson.recording);
          const libraryEntry = recording.tone === 'ready' ? null : libraryById.get(lesson.id);
          const ready = Boolean(libraryEntry) || recording.tone === 'ready';
          const canWatch = ready || recording.tone !== 'unavailable';
          return <li className="sgl-history-entry" key={lesson.lessonId || lesson.id}>
            <span className="sgl-history-icon" data-ready={!schedule && ready}>
              {schedule ? <CalendarDays size={22}/> : <Play size={21}/>}
            </span>
            <div className="sgl-history-info">
              <div className="sgl-history-meta"><time dateTime={new Date(start).toISOString()}>{label} · {hour} МСК</time><span><Clock3 size={13}/>{duration} мин</span></div>
              <h3>{lesson.topic || 'Занятие группы'}</h3>
              {!schedule && !ready && <small>{recording.label}</small>}
            </div>
            <div className="sgl-history-actions">
              {schedule && lesson.subscriptionAccess?.live !== false && <button type="button" className="sgl-history-primary" onClick={() => onOpenLesson(lesson,'call')}><Video size={16}/>К уроку</button>}
              {!schedule && canWatch && <button type="button" className="sgl-history-primary" onClick={() => libraryEntry ? onOpenLibraryRecording(libraryEntry) : onOpenReplay(lesson)}><Play size={15}/>{ready ? 'Смотреть' : 'Открыть запись'}</button>}
              <button type="button" aria-label={'Доска занятия: '+lesson.topic} onClick={() => onOpenLesson(lesson,'board')}><Brush size={15}/>Доска</button>
              <button type="button" aria-label={'Код занятия: '+lesson.topic} onClick={() => onOpenLesson(lesson,'collab')}><Code2 size={16}/>Код</button>
            </div>
          </li>;
        })}
      </ul>}
    {matches.length > limit && <button type="button" className="sgl-history-more" onClick={() => setLimit(value => value + pageSize)}><ChevronDown size={16}/>Показать ещё</button>}
  </section>;
}
