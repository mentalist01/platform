import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, Send } from 'lucide-react';
import { weeklySchedules } from '../services/scheduleRequests';
import { subscribeScheduleSync } from '../services/scheduleSync';
import { ScheduleDialog } from './ScheduleDialog';
import { addCalendarDays, availabilitySlots, AVAILABILITY_DAYS, AVAILABILITY_DAY_NAMES, moscowDay } from '../utils/groupAvailability';
import { lessonDateLabel } from '../utils/lessonReschedule';
import { weeklyScheduleLabel, weeklyScheduleStatus } from '../utils/weeklySchedule';
import './LessonReschedule.css';
import './WeeklySchedule.css';

export function WeeklySummary({ row }) {
  return <div className="ws-summary"><strong>{weeklyScheduleLabel(row)}</strong><span>Каждую неделю с {lessonDateLabel(row.config.startDate)} · {row.config.durationMinutes} мин.</span></div>;
}

export function StudentWeeklySchedule({ onClose, transport = weeklySchedules }) {
  const [startDate, setStartDate] = useState(() => addCalendarDays(moscowDay(), 1));
  const [durationMinutes, setDuration] = useState(60); const [count, setCount] = useState(2);
  const [selected, setSelected] = useState([]); const [data, setData] = useState(null);
  const [rows, setRows] = useState([]); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [retry, setRetry] = useState(0);
  const [comment, setComment] = useState(''); const [day, setDay] = useState(0); const [period, setPeriod] = useState('all');
  const reload = useCallback(async () => { const result = await transport(); setRows(result.requests); }, [transport]);
  useEffect(() => {
    let alive = true;
    const load = () => transport().then(r => { if (alive) setRows(r.requests); }).catch(e => { if (alive) setError(e.message); });
    void load(); const timer = setInterval(load, 15000); const unsubscribe = subscribeScheduleSync(load);
    return () => { alive = false; clearInterval(timer); unsubscribe(); };
  }, [transport]);
  useEffect(() => {
    let alive = true; setLoading(true); setData(null); setSelected([]); setError('');
    transport(`/availability?${new URLSearchParams({ startDate, durationMinutes })}`)
      .then(r => { if (alive) setData(r); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [transport, startDate, durationMinutes, retry]);
  const pending = rows.find(r => ['pending', 'applying'].includes(r.status));
  const slots = availabilitySlots(data?.config).filter(s => !data.blocked[s.id]);
  const picked = data ? { config: data.config, slots: selected } : null;
  const choose = slot => { setNotice(''); setSelected(old => old.includes(slot.id) ? old.filter(id => id !== slot.id)
    : [...old.filter(id => !id.startsWith(`${slot.day}-`)), slot.id].slice(-count)); };
  const submit = async () => {
    if (!data || selected.length !== count || busy || pending) return;
    setBusy(true); setError('');
    try { await transport('', { startDate, durationMinutes, slots: selected, baseSignature: data.baseSignature, comment }); await reload(); setNotice('Запрос отправлен учителю. Занятия появятся после подтверждения.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true); setError(''); try { await transport(`/${pending.id}/cancel`, {}); await reload(); setRetry(n => n + 1); setNotice('Запрос отменён. Можно выбрать другое время.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <ScheduleDialog title="Выбрать время занятий" onClose={() => { if (!busy) onClose(); }} footer={!pending && data && !loading && <>
    <div className="lr-footer-selection"><div><small>ИНДИВИДУАЛЬНО · КАЖДУЮ НЕДЕЛЮ</small><strong>Выбрано {selected.length} из {count}</strong><span>{selected.length ? weeklyScheduleLabel(picked) : 'Выберите удобные дни и часы'}</span></div>
      <button className="lr-primary" disabled={busy || selected.length !== count} onClick={submit}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}Я выбрал занятия</button></div>
  </>}><div className="lr-body">
    <p className="lr-intro">Выберите постоянное время индивидуальных занятий. Отправьте запрос — учитель проверит и подтвердит расписание.</p>
    {error && <div role="alert" className="lr-error">{error}<button disabled={busy} onClick={() => setRetry(n => n + 1)}><RefreshCw size={14} />Обновить свободное время</button></div>}
    {notice && <p className="lr-pending" role="status">{notice}</p>}
    {pending ? <div className="ws-pending"><h3>{weeklyScheduleStatus[pending.status]}</h3><WeeklySummary row={pending} /><p className="lr-hint">До подтверждения время не забронировано.</p>{pending.status === 'pending' && <button disabled={busy} onClick={cancel}>Отменить запрос и выбрать заново</button>}</div> : <>
      <div className="ws-settings"><label className="lr-field">Занятий в неделю<select value={count} disabled={busy} onChange={e => { setCount(Number(e.target.value)); setSelected([]); }}>{[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="lr-field">Длительность<select value={durationMinutes} disabled={busy} onChange={e => setDuration(Number(e.target.value))}>{[30,45,60,90,120].map(n => <option key={n} value={n}>{n} минут</option>)}</select></label>
        <label className="lr-field">Начинать с<input type="date" min={moscowDay()} max={addCalendarDays(moscowDay(),90)} value={startDate} disabled={busy} onChange={e => setStartDate(e.target.value)} /></label></div>
      <p className="lr-hint">Каждая карточка — целый урок с окончанием до 23:00. Показываем время без пересечений на ближайшие 8 недель от даты начала. После подтверждения занятия повторяются еженедельно без даты окончания.</p>
      <div className="lr-periods" aria-label="Часть дня">{[['all','Весь день'],['morning','Утро'],['day','День'],['evening','Вечер']].map(([id,label]) => <button key={id} aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}</div>
      {loading ? <div className="lr-loading"><Loader2 className="animate-spin" />Проверяем календарь преподавателя…</div> : data && <>
        <nav className="lr-mobile-days" aria-label="День недели">{AVAILABILITY_DAYS.map((d,i) => <button key={d} aria-pressed={day === i} onClick={() => setDay(i)}>{d}</button>)}</nav>
        <div className="lr-days">{AVAILABILITY_DAYS.map((name,i) => { const times = slots.filter(s => s.day === i && (period === 'all' || (period === 'morning' ? s.time < '12:00' : period === 'day' ? s.time >= '12:00' && s.time < '17:00' : s.time >= '17:00'))); return <section key={name} className={day === i ? 'is-active' : ''} aria-label={AVAILABILITY_DAY_NAMES[i]}><header><strong>{name}</strong><span>Каждую неделю</span></header><div>{times.map(slot => <button key={slot.id} disabled={busy} aria-pressed={selected.includes(slot.id)} aria-label={`${AVAILABILITY_DAY_NAMES[i]}, ${slot.time}–${slot.end}`} onClick={() => choose(slot)}><strong>{slot.time}–{slot.end}</strong><span>{selected.includes(slot.id) ? 'Выбрано' : 'Свободно'}</span></button>)}{!times.length && <p>Нет свободных вариантов</p>}</div></section>; })}</div>
        <label className="lr-field">Комментарий учителю <small>необязательно</small><textarea value={comment} maxLength={400} onChange={e => setComment(e.target.value)} /></label>
        <p className="lr-hint">Новый запрос заменит будущее расписание, ранее согласованное через эту кнопку. Занятия, добавленные отдельно, сохраняются и учитываются как занятые.</p>
      </>}
    </>}
    {rows.length > 0 && <details className="lr-history"><summary>Мои запросы расписания · {rows.length}</summary>{rows.map(r => <article key={r.id}><strong>{weeklyScheduleStatus[r.status]}</strong><WeeklySummary row={r} />{r.resolutionNote && <p>{r.resolutionNote}</p>}</article>)}</details>}
  </div></ScheduleDialog>;
}

export function TeacherWeeklyDetails({ preview, busy, note, setNote, resolve }) {
  const row = preview.request;
  return <><h3 className="lr-student-name">{row.studentName}</h3><p className="lr-hint">{weeklyScheduleStatus[row.status]}</p><WeeklySummary row={row} />
    {row.comment && <p className="lr-quote">{row.comment}</p>}{row.resolutionNote && <p className="lr-hint">{row.resolutionNote}</p>}
    {preview.conflict && <div role="alert" className="lr-error">{preview.conflict}</div>}
    {['pending','applying'].includes(row.status) && <><p className="lr-intro">После подтверждения эти индивидуальные занятия будут повторяться каждую неделю на платформе. Проверяем пересечения на 8 недель от даты начала. Прежнее расписание из таких запросов заменится с выбранной даты; отдельные занятия сохранятся.</p>
      <label className="lr-field">Ответ ученику <small>необязательно</small><input maxLength={400} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="lr-decision"><button disabled={busy || row.status === 'applying'} onClick={() => resolve('reject')}>Отклонить</button><button className="lr-primary" disabled={busy || !!preview.conflict} onClick={() => resolve('approve')}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{row.status === 'applying' ? 'Завершить подтверждение' : 'Подтвердить расписание'}</button></div></>}
  </>;
}
