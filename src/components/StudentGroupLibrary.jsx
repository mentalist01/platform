import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Headphones, Library, Loader2, MicOff, Play, RefreshCw, Search, Sparkles, Users, Video, X } from 'lucide-react';
import { fetchGroupLibrary } from '../services/groupLibrary';
import './StudentGroupLibrary.css';
import {groupRecordingCatalog} from '../utils/groupRecordingCatalog.js';
const CallSection = lazy(() => import('./CallSection'));
const date = value => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year:'numeric' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const lessonCount = count => `${count} ${{ one: 'занятие', few: 'занятия', many: 'занятий', other: 'занятия' }[new Intl.PluralRules('ru-RU').select(count)]}`;
const groupCount = count => `${count} ${{one:'группа',few:'группы',many:'групп',other:'группы'}[new Intl.PluralRules('ru-RU').select(count)]}`;
const recordingCount = count => `${count} ${{one:'запись',few:'записи',many:'записей',other:'записи'}[new Intl.PluralRules('ru-RU').select(count)]}`;
const tabs = [{ id: 'own', label: 'Мои группы', icon: Users }, { id: 'live', label: 'Слушать занятия', icon: Headphones }, { id: 'recordings', label: 'Все записи', icon: Library }];
export default function StudentGroupLibrary({ user, theme = 'light', openOwnRequest, children, startWithRecordings = false, transport = fetchGroupLibrary }) {
  const student = user?.role === 'student';
  const [tab, setTab] = useState(startWithRecordings ? 'recordings' : 'own'), [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(''), [groupId, setGroupId] = useState('');
  const [watching, setWatching] = useState(null), [part, setPart] = useState(0), [listening, setListening] = useState(null);
  const dialogRef = useRef(null);
  const load = useCallback(async () => {
    if (!student || !user?.id) return;
    setLoading(true);
    try { setData(await transport()); setError(''); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [student, user?.id, transport]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openOwnRequest) setTab('own'); }, [openOwnRequest]);
  useEffect(() => { if (!student || tab === 'own') return; const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load, student, tab]);
  useEffect(() => { if (data && !data.allowed) { setListening(null); setWatching(null); } }, [data]);
  useEffect(() => {
    if (!listening && !watching) return;
    const previous = document.body.style.overflow, previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const key = event => {
      if (event.key === 'Escape') { setListening(null); setWatching(null); }
      if (event.key !== 'Tab') return;
      const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), iframe, [tabindex="0"]') || [])].filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (first && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', key); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [listening, watching]);
  const shelves = useMemo(()=>groupRecordingCatalog(data?.groups,data?.recordings),[data]);
  const selectedGroup = shelves.find(group=>group.id===groupId);
  const search = query.trim().toLocaleLowerCase('ru-RU');
  const visibleGroups = shelves.filter(group=>`${group.name} ${group.recordings.map(entry=>entry.topic).join(' ')}`.toLocaleLowerCase('ru-RU').includes(search));
  const entries = (tab === 'recordings' ? selectedGroup?.recordings || [] : data?.lessons || []).filter(entry=>(!groupId || entry.groupId===groupId)
    && `${entry.topic} ${entry.groupName} ${date(entry.startAt)}`.toLocaleLowerCase('ru-RU').includes(search));
  if (!student) return children;
  const changeTab = value => { setTab(value); setQuery(''); setGroupId(''); };
  return <div className="student-group-library" data-theme={theme}>
    <nav className="sgl-tabs" aria-label="Занятия и записи групп">{tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => changeTab(id)}>{React.createElement(Icon,{size:18})}{label}{id === 'recordings' && data?.allowed && <span>{data.recordings.length}</span>}</button>)}</nav>
    {tab === 'own' ? children : <>
      {tab === 'recordings' ? <section className="sgl-recording-hero"><span><Video size={18}/> БИБЛИОТЕКА УРОКОВ</span><h2>{selectedGroup ? selectedGroup.name : 'Записи занятий по группам'}</h2><p>{selectedGroup ? 'Начните с первого урока или вернитесь к нужной теме. Записи идут от ранних занятий к новым.' : 'Выберите группу и проходите занятия по порядку — с самого первого урока.'}</p></section> : <section className="sgl-hero"><div className="sgl-hero-copy"><span className="sgl-eyebrow"><Sparkles size={15} /> Входит в ваш групповой тариф</span>
        <h2>{tab === 'live' ? <>Учитесь вместе.<br /><em>Даже с другой группой.</em></> : <>Любая тема.<br /><em>В вашем темпе.</em></>}</h2>
        <p>{tab === 'live' ? 'Присоединяйтесь к занятиям других групп вашего преподавателя как слушатель. Смотрите разбор и слушайте объяснения.' : 'Все записи групп вашего преподавателя в одном месте. Найдите нужную тему и вернитесь к объяснению в любое время.'}</p>
        <div className="sgl-hero-benefits"><span><Check size={14} /> Без дополнительной оплаты</span><span>{tab === 'live' ? <MicOff size={14} /> : <Play size={14} />}{tab === 'live' ? 'Микрофон выключен' : 'Смотрите сколько нужно'}</span></div></div>
        <div className="sgl-illustration" aria-hidden="true"><div className="sgl-illustration-window"><span className="sgl-window-dots">● ● ●</span><div className="sgl-illustration-icon">{tab === 'live' ? <Headphones size={42} /> : <Play size={42} />}</div><div className="sgl-window-line" /><div className="sgl-window-line short" /></div><div className="sgl-floating-tag"><span />{tab === 'live' ? 'Объяснение, которое помогает' : 'Вся библиотека под рукой'}</div></div>
      </section>}
      {error && <div className="sgl-message" role="alert">{error}<button type="button" onClick={load}>Повторить</button></div>}
      {!data && loading ? <div className="sgl-empty"><Loader2 className="animate-spin" />Загружаем занятия…</div> : data && !data.allowed ? <div className="sgl-empty"><Headphones size={32} /><h3>Доступ к групповым занятиям</h3><p>Записи и участие слушателем доступны с групповым тарифом или по разрешению преподавателя. Преподаватель может открыть доступ ещё до вступления в группу.</p></div> : data?.allowed && <>
        <div className="sgl-toolbar"><div>{tab === 'recordings' && groupId && <button className="sgl-back" type="button" onClick={()=>{setGroupId('');setQuery('');}}><ChevronLeft size={17}/> Все группы</button>}<h3>{tab === 'recordings' ? selectedGroup ? 'Занятия по порядку' : 'Выберите группу' : 'Занятия других групп'}</h3><p>{tab === 'recordings' ? selectedGroup ? `${lessonCount(selectedGroup.count)} · сначала самые ранние · время по Москве` : `${groupCount(shelves.length)} · ${recordingCount(data.recordings.length)}` : 'Время по Москве · вход доступен во время занятия'}</p></div><button type="button" className="sgl-refresh" onClick={load} disabled={loading} aria-label="Обновить занятия"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button></div>
        <div className="sgl-filters"><label><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tab==='recordings'&&groupId?'Найти тему или дату занятия':'Найти тему или группу'} aria-label="Поиск по теме или группе" /></label>{tab==='live'&&<select value={groupId} onChange={event => setGroupId(event.target.value)} aria-label="Фильтр по группе"><option value="">Все группы</option>{data.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}</div>
        {tab==='recordings'&&!groupId ? <div className="sgl-group-grid">{visibleGroups.map((group,index)=><button className={`sgl-group-tile tone-${index%3}`} type="button" key={group.id} onClick={()=>setGroupId(group.id)}><span className="sgl-group-symbol"><Users size={26}/></span><span className="sgl-group-count">{recordingCount(group.count)}</span><h4>{group.name}</h4><p>{group.firstAt ? `${date(group.firstAt)} — ${date(group.lastAt)}` : 'Записи появятся после занятия'}</p><span className="sgl-group-open">Открыть занятия <ChevronRight size={18}/></span></button>)}{!visibleGroups.length&&<div className="sgl-empty"><Library size={30}/><h3>Группы не найдены</h3><p>Попробуйте другое название или тему занятия.</p></div>}</div> : entries.length ? <div className="sgl-grid">{entries.map((entry, index) => <article key={entry.id} className={`sgl-card ${tab==='recordings'?'sgl-recording-card':''} ${entry.canListen && tab === 'live' ? 'is-live' : ''}`}>
          <div className={`sgl-card-art tone-${index % 3}`}><span className="sgl-card-group">{tab==='recordings'?`Занятие ${String(entry.lessonNumber).padStart(2,'0')}`:<><Users size={14} />{entry.groupName}</>}</span><div className="sgl-card-symbol">{tab === 'recordings' ? <Play size={38} /> : <Headphones size={38} />}</div><span className="sgl-card-status">{tab === 'recordings' ? entry.lessonNumber===1?'Первое занятие':'Видеозапись урока' : entry.canListen ? <><i /> Идёт сейчас</> : 'Скоро занятие'}</span></div>
        <div className="sgl-card-body">{tab==='recordings'&&<time className="sgl-recording-date" dateTime={entry.startAt}><CalendarDays size={16}/>{date(entry.startAt)}<span>{time(entry.startAt)}</span></time>}<h4>{entry.topic}</h4><div className="sgl-card-meta">{tab==='live'&&<span><CalendarDays size={14} />{date(entry.startAt)}, {time(entry.startAt)}</span>}<span><Clock3 size={14} />{entry.durationMinutes} мин</span>{tab==='recordings'&&<span><Video size={14}/>{entry.recordingParts.length>1?`${entry.recordingParts.length} части`:'Полное занятие'}</span>}</div>
            {tab === 'recordings' ? <button type="button" className="sgl-primary" onClick={() => { setWatching(entry); setPart(0); }}><Play size={17} />Смотреть запись<ChevronRight size={17} /></button> : <button type="button" className="sgl-primary" disabled={!entry.canListen} onClick={() => setListening(entry)}><Headphones size={17} />{entry.canListen ? 'Присоединиться слушателем' : 'Вход во время занятия'}{entry.canListen && <ArrowUpRight size={17} />}</button>}
          </div></article>)}</div> : <div className="sgl-empty"><Library size={34} /><h3>{query || groupId ? 'Пока ничего не нашли' : tab === 'recordings' ? 'Записи появятся здесь' : 'Скоро новые занятия'}</h3><p>{query || groupId ? 'Попробуйте другую тему или выберите все группы.' : tab === 'recordings' ? 'Готовые записи после публикации преподавателем попадут в библиотеку.' : 'Здесь появятся ближайшие занятия других групп вашего преподавателя.'}</p></div>}
        {tab==='live'&&<p className="sgl-footnote"><MicOff size={15} />Посещение других групп не расходует уроки вашего абонемента и не меняет вашу домашнюю работу.</p>}
      </>}
    </>}
    {(watching || listening) && <div className="sgl-overlay"><section ref={dialogRef} className="sgl-dialog" role="dialog" aria-modal="true" aria-label={watching ? 'Запись занятия' : 'Занятие в режиме слушателя'}>
      <header><div><span>{(watching || listening).groupName} · {date((watching || listening).startAt)}</span><h3>{(watching || listening).topic}</h3></div><button type="button" autoFocus aria-label="Закрыть занятие" onClick={() => { setWatching(null); setListening(null); }}><X size={22} /></button></header>
      {watching ? <><div className="sgl-player"><iframe key={part} src={watching.recordingParts[part].embedUrl} title="Видеозапись занятия" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /></div>{watching.recordingParts.length > 1 && <div className="sgl-parts">{watching.recordingParts.map((video, index) => <button key={video.embedUrl} type="button" aria-pressed={part === index} onClick={() => setPart(index)}>Часть {index + 1}</button>)}</div>}<a className="sgl-external" href={watching.recordingParts[part].url} target="_blank" rel="noopener noreferrer">Открыть на Rutube<ArrowUpRight size={15} /></a></> : <><p className="sgl-listener-note"><Headphones size={18} /><span>Вы незаметный слушатель: слышите занятие и видите демонстрацию. Другие участники не видят вашего подключения. Микрофон, камера и показ экрана недоступны.</span></p><Suspense fallback={<div className="sgl-empty">Подключаемся…</div>}><CallSection role={user.role} userId={user.id} userName={user.name} userAvatarDataUrl={user.avatarDataUrl} teacherId={user.teacherId} students={[]} lessonId={listening.id} groupId={listening.groupId} channelId="general" hideStudentPicker channelSelectionMode listenOnly initialMicEnabled={false} autoStartToken={1} theme={theme} /></Suspense></>}
    </section></div>}
  </div>;
}
