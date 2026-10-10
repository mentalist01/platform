import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Clock3, Copy, Heart, Loader2, RefreshCw, Users, X } from 'lucide-react';
import { api } from '../services/api';
import { AVAILABILITY_DAYS, AVAILABILITY_DAY_NAMES, availabilitySlots } from '../utils/groupAvailability';
import './GroupAvailability.css';
import './GroupPlacement.css';

const durations = [30, 45, 60, 90, 120];
const dateLabel = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const labels = { exact: 'Подходит по времени', flexible: 'Можно подстроиться', waiting: 'Ждём ответы участников', partial: 'Не хватает второго дня',
  unanswered: 'Нужны отметки ученика', unverified: 'Календарь не проверен', 'no-schedule': 'Расписание ещё не выбрано', conflict: 'Время не совпадает', member: 'Уже в этой группе' };
const slotLabel = slot => `${AVAILABILITY_DAYS[slot.day]}, ${slot.time}–${slot.end}`;
const memberLabel = count => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'участник' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'участника' : 'участников'}`;

export function PersonalGroupAvailability({ transport = api, individual = true }) {
  const [duration, setDuration] = useState(60), [data, setData] = useState(null), [draft, setDraft] = useState({});
  const [brush, setBrush] = useState('yes'), [day, setDay] = useState(0), [early, setEarly] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [dirty, setDirty] = useState(false);
  const generation = useRef(0), dirtyRef = useRef(false), painting = useRef(null), painted = useRef(new Set()), touchTap = useRef(null);
  const install = next => { setData(next); setDraft(next.answer?.choices || {}); setDirty(false); dirtyRef.current = false; };
  const load = async () => {
    const token = ++generation.current; setBusy(true); setError(''); setData(null);
    try { const next = await transport.personalGroupAvailability(duration); if (token === generation.current) install(next); }
    catch (error) { if (token === generation.current) setError(error.message); }
    finally { if (token === generation.current) setBusy(false); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, [duration, transport]);
  useEffect(() => {
    const stop = event => { painting.current = null; painted.current.clear(); if (event.type === 'pointercancel') touchTap.current = null; };
    const warn = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('beforeunload', warn); };
  }, []);
  const mark = (id, value) => {
    if (busy) return;
    setDraft(previous => { const next = { ...previous }; if (value === 'erase') delete next[id]; else next[id] = value; return next; });
    setDirty(true); dirtyRef.current = true; setNotice('');
  };
  const startPaint = (event, slot) => {
    if (event.pointerType === 'touch') { touchTap.current = slot.id; return; }
    touchTap.current = null;
    if (event.button !== 0 || busy) return;
    event.preventDefault(); painting.current = draft[slot.id] === brush ? 'erase' : brush;
    painted.current = new Set([slot.id]); mark(slot.id, painting.current);
  };
  const save = async () => {
    if (busy || !data) return;
    const token = ++generation.current; setBusy(true); setError('');
    try {
      const next = await transport.savePersonalGroupAvailability({ durationMinutes: duration, revision: data.revision, choices: draft });
      if (token === generation.current) { install(next); setNotice(individual
        ? 'Свободное время сохранено. Преподаватель сможет подобрать группу; ваши индивидуальные занятия продолжаются.'
        : 'Свободное время сохранено для будущего подбора. Текущее расписание группы не меняется.'); }
    } catch (error) { if (token === generation.current) setError(error.message); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const changeDuration = event => {
    if (dirty && !window.confirm('Есть несохранённые отметки. Переключить длительность без сохранения?')) return;
    setDuration(Number(event.target.value)); setNotice('');
  };
  const slots = availabilitySlots(data?.config).filter(slot => early || slot.minutes >= 480);
  return <section className="ga-shell placement-personal" aria-label="Свободное время для подбора группы">
    <header className="ga-hero"><div className="ga-hero-icon"><CalendarDays size={26} /></div><div className="ga-hero-copy"><span className="ga-eyebrow">ПОДБОР БУДУЩЕЙ ГРУППЫ</span><h2>Когда вам удобно заниматься?</h2><p>Отметьте все свободные варианты обычной недели. {individual ? 'Пока преподаватель выбирает группу, вы продолжаете заниматься индивидуально.' : 'Это личная анкета для будущего подбора; текущее расписание группы не меняется.'}</p></div><span className="ga-zone"><Clock3 size={15} />Москва · UTC+3</span></header>
    <div className="ga-body">
      <div className="placement-toolbar"><label>Длительность занятия<select value={duration} onChange={changeDuration} disabled={busy}>{durations.map(n => <option key={n} value={n}>{n} минут</option>)}</select></label><p>Одна карточка — полное занятие. «Могу подстроиться» помогает найти дополнительные варианты.</p></div>
      {error && <div className="ga-alert" role="alert">{error}<button disabled={busy} onClick={() => { if (!dirty || window.confirm('Обновить анкету и отменить несохранённые изменения?')) void load(); }}>Обновить анкету</button></div>}
      {notice && <div className="ga-notice" role="status"><Check size={18} />{notice}</div>}
      {!data ? busy && <p role="status"><Loader2 className="ga-spin" size={18} /> Загружаем ваши отметки…</p> : <>
        <div className="ga-brushes" aria-label="Как отметить свободное время">{[['yes','Удобно'],['maybe','Могу подстроиться'],['erase','Убрать отметку']].map(([value,label]) => <button type="button" key={value} disabled={busy} className={`ga-brush-${value} ${brush === value ? 'selected' : ''}`} aria-pressed={brush === value} onClick={() => setBrush(value)}>{value === 'yes' ? <Check size={16} /> : value === 'maybe' ? <Heart size={16} /> : <X size={16} />}{label}</button>)}</div>
        <div className="ga-savebar ga-selection-bar"><div><strong>Выбрано вариантов: {Object.keys(draft).length}</strong><small>{dirty ? 'Есть несохранённые изменения' : data.answer ? `Сохранено ${dateLabel(data.answer.updatedAt)}` : 'Выберите время и сохраните анкету'}</small></div><button type="button" className="ga-primary" disabled={busy || !dirty && !!data.answer} onClick={save}><Check size={18} />{busy ? 'Сохраняем…' : 'Сохранить свободное время'}</button></div>
        <label className="placement-early"><input type="checkbox" checked={early} onChange={event => setEarly(event.target.checked)} />Показать часы до 08:00</label>
        <p className="ga-hint">Все часы указаны по Москве (UTC+3). На компьютере можно провести по карточкам, чтобы отметить несколько вариантов. Отметки видны вам и вашему преподавателю.</p>
        <nav className="ga-mobile-days" aria-label="День недели">{AVAILABILITY_DAYS.map((name,i) => <button type="button" key={i} className={day === i ? 'selected' : ''} onClick={() => setDay(i)}>{name}</button>)}</nav>
        <div className="ga-week-options" style={{ '--ga-days': 7 }}>{AVAILABILITY_DAYS.map((name,i) => <section key={i} className={`ga-day-options ${day === i ? 'ga-mobile-active' : ''}`} aria-label={AVAILABILITY_DAY_NAMES[i]}><div className="ga-options-day"><strong>{name}</strong></div><div className="ga-options-list">{slots.filter(slot => slot.day === i).map(slot => <button type="button" key={slot.id} disabled={busy} className={`ga-time-option placement-slot ${draft[slot.id] || ''}`} aria-label={`${AVAILABILITY_DAY_NAMES[i]}, ${slot.time}–${slot.end}: ${draft[slot.id] === 'yes' ? 'удобно' : draft[slot.id] === 'maybe' ? 'могу подстроиться' : 'не выбрано'}`} aria-pressed={!!draft[slot.id]}
          onPointerDown={event => startPaint(event,slot)} onPointerEnter={() => { if (painting.current && !painted.current.has(slot.id)) { painted.current.add(slot.id); mark(slot.id,painting.current); } }}
          onClick={event => { if (event.detail === 0 || touchTap.current === slot.id || event.nativeEvent.pointerType === 'touch') mark(slot.id, draft[slot.id] === brush ? 'erase' : brush); touchTap.current = null; }}><strong>{slot.time}–{slot.end}</strong><small>{draft[slot.id] === 'yes' ? 'Удобно' : draft[slot.id] === 'maybe' ? 'Могу подстроиться' : 'Можно выбрать'}</small></button>)}</div></section>)}</div>
      </>}
    </div>
  </section>;
}

export function TeacherGroupPlacement({ students = [], onChoose, transport = api }) {
  const [studentId, setStudentId] = useState(''), [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const generation = useRef(0);
  const load = async () => {
    if (!studentId) return;
    const token = ++generation.current; setBusy(true); setError('');
    try { const next = await transport.studentGroupPlacement(studentId); if (token === generation.current) setData(next); }
    catch (error) { if (token === generation.current) { setError(error.message); setData(null); } }
    finally { if (token === generation.current) setBusy(false); }
  };
  useEffect(() => { setData(null); setCopied(false); void load(); return () => { generation.current++; }; }, [studentId, transport]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener('learning-groups-changed', refresh);
    return () => window.removeEventListener('learning-groups-changed', refresh);
  }, [studentId, transport]);
  const answered = data?.answers.filter(answer => answer.answer) || [];
  const currentGroup = data?.groups.find(group => group.alreadyMember);
  const link = `${window.location.origin}/?view=groups`;
  return <section className="placement-teacher" aria-label="Подобрать группу ученику"><header><Users size={24} /><div><h2>Подобрать группу ученику</h2><p>Сначала свободное время, потом группа. До вступления ученик остаётся индивидуальным.</p></div></header>
    <div className="placement-toolbar"><label>Ученик<select value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">Выберите ученика</option>{students.filter(student => !student.deletedAt).map(student => <option key={student.id} value={student.id}>{student.name}{student.nickname && student.nickname !== student.name ? ` · ${student.nickname}` : ''}</option>)}</select></label><button type="button" disabled={!studentId || busy} onClick={load}><RefreshCw size={16} />{busy ? 'Проверяем…' : 'Обновить подбор'}</button></div>
    {error && <p className="ga-alert" role="alert">{error}</p>}
    {studentId && <div className="placement-invite"><div><strong>Попросите ученика отметить время</strong><p>В его кабинете: «Подбор группы» → «Мои группы» → анкета свободного времени. Если он уже состоит в группе, раздел называется «Группы и записи». Регистрация в группе для анкеты не нужна.</p></div><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError('Не удалось скопировать ссылку. Откройте адрес ниже.'); } }}><Copy size={16} />{copied ? 'Ссылка скопирована' : 'Скопировать ссылку ученику'}</button><a href={link} target="_blank" rel="noreferrer">{link}</a></div>}
    {data && <>
      {!answered.length ? <p className="placement-empty">Ученик ещё не сохранил свободное время. Его индивидуальные занятия продолжаются; после заполнения анкеты нажмите «Обновить подбор».</p> : <>
        <p className="placement-answer">Анкета сохранена {dateLabel(Math.max(...answered.map(answer => answer.answer.updatedAt)))}. Длительность: {answered.map(answer => `${answer.durationMinutes} мин`).join(', ')}. Подбор учитывает только время; уровень и состав группы выберите сами.</p>
        {currentGroup && <p className="placement-answer">Ученик уже состоит в группе «{currentGroup.name}». Для перехода используйте «Перенести» в составе этой группы.</p>}
        {data.calendarError && <p className="ga-alert" role="alert">Не удалось проверить календарь преподавателя. Совпадения с установленным расписанием показаны, но свободные часы формирующихся групп нужно проверить повторно.</p>}
        {!data.groups.length ? <p className="placement-empty">Пока нет доступных групп. Можно создать группу под свободное время ученика.</p> : <div className="placement-results">{data.groups.map(group => <article key={group.id} className={`placement-result fit-${group.fit}`}><header><div><h3>{group.name}</h3><p>{memberLabel(group.memberCount)} · {group.mode === 'schedule' ? 'Расписание выбрано' : group.mode === 'forming' ? 'Подбираем расписание' : 'Нет расписания'}</p></div><span className="placement-fit">{labels[group.fit]}</span></header>
          <p>{group.mode === 'schedule' ? `Подходит ${group.matchedCount} из ${group.totalCount} занятий.` : group.mode === 'forming' ? `Полностью согласовано дней: ${group.availableDays}. Для группы нужны два разных дня.${group.pendingMembers ? ` Ждём ответы: ${group.pendingMembers}.` : ''}` : 'Откройте подбор времени в этой группе, чтобы сравнить отметки участников.'}</p>
          {group.fit === 'unanswered' && <p>Нужны отметки для длительности занятий этой группы или для часов, которых не было в прошлой анкете.</p>}
          <div className="placement-slots">{group.slots.map(slot => <span key={`${slot.id}-${slot.durationMinutes}`} className={`choice-${slot.choice}`} title={slot.pending ? 'Часть участников ещё не ответила' : undefined}>{slotLabel(slot)}{slot.choice === 'maybe' || slot.flexible ? ' · подстроиться' : slot.choice === 'no' ? ' · не подходит' : slot.choice === 'pending' ? ' · нет ответа' : ''}{slot.pending ? ' · ждём ответы' : ''}</span>)}</div>
          {!group.alreadyMember && <button type="button" disabled={busy || !!currentGroup} onClick={() => onChoose?.(group.id,studentId)}>Выбрать эту группу</button>}
        </article>)}</div>}
        <p className="placement-answer">Выбор откроет состав группы с выбранным учеником. Вступление и изменение формата занятий подтверждаются отдельно.</p>
      </>}
    </>}
  </section>;
}
