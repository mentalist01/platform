import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CalendarClock, Check, ChevronLeft, ChevronRight, Clock3, Loader2, Send, X } from 'lucide-react';
import { api, resolveAuthenticatedApiUrl } from '../services/api';
import { addCalendarDays, AVAILABILITY_DAYS } from '../utils/groupAvailability';
import { rescheduleWeek, lessonDateLabel, lessonTimeLabel, rescheduleStatus } from '../utils/lessonReschedule';
import './LessonReschedule.css';

function Dialog({title,onClose,children,footer}) {
  const ref=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.focus();
    return ()=>{document.body.style.overflow=overflow;previous?.focus?.();};
  },[]);
  return createPortal(<div className="lr-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section className="lr-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onKeyDown={e=>{
    if(e.key==='Escape')onClose();
    if(e.key==='Tab'){const items=[...ref.current.querySelectorAll('button:not([disabled]),input,select,textarea,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}><header className="lr-header"><span className="lr-icon"><CalendarClock size={24}/></span><div><span className="lr-eyebrow">РАСПИСАНИЕ · МОСКОВСКОЕ ВРЕМЯ</span><h2>{title}</h2></div><button className="lr-close" onClick={onClose} aria-label="Закрыть перенос"><X size={21}/></button></header><div className="lr-content">{children}</div>{footer&&<footer className="lr-footer">{footer}</footer>}</section></div>,document.body);
}

const LessonChip=({lesson,label,tone})=><div className={`lr-lesson lr-${tone}`}><small>{label}</small><strong>{lessonDateLabel(lesson.date)}</strong><span><Clock3 size={14}/>{lessonTimeLabel(lesson)}</span></div>;
export const MoveSummary=({source,target,targetLabel="Станет"})=><div className="lr-summary"><LessonChip lesson={source} label="Было" tone="before"/><ArrowRight size={22}/><LessonChip lesson={target} label={targetLabel} tone="after"/></div>;

function useRequests() {
  const [rows,setRows]=useState([]);const [error,setError]=useState('');
  const reload=useCallback(async()=>{try{const data=await api.lessonReschedules();setRows(data.requests);setError('');}catch(e){setError(e.message);}},[]);
  useEffect(()=>{let alive=true;const load=()=>{if(alive)void reload();};load();const timer=setInterval(load,30000);
    const events=new EventSource(resolveAuthenticatedApiUrl('/api/schedule-sync/stream'),{withCredentials:true});events.addEventListener('schedule-sync',load);
    window.addEventListener('focus',load);return()=>{alive=false;clearInterval(timer);events.close();window.removeEventListener('focus',load);};},[reload]);
  return {rows,error,reload};
}

export function StudentLessonReschedule({onClose}) {
  const [week,setWeek]=useState(()=>rescheduleWeek());const [key,setKey]=useState('');const [data,setData]=useState(null);
  const [target,setTarget]=useState(null);const [comment,setComment]=useState('');const [period,setPeriod]=useState('evening');const [day,setDay]=useState(0);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [sent,setSent]=useState(null);
  const {rows,reload}=useRequests();const [retry,setRetry]=useState(0);
  useEffect(()=>{let alive=true;setLoading(true);setTarget(null);setData(null);setError('');
    api.lessonReschedules(`/availability?${new URLSearchParams({week,...(key?{lessonKey:key}:{})})}`).then(result=>{if(alive)setData(result);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[week,key,retry]);
  const source=data?.lessons.find(l=>l.key===(key||data.selectedKey));
  const pending=rows.find(r=>['pending','applying'].includes(r.status)&&r.source.key===source?.key);
  const submit=async()=>{if(!target||!source||busy||loading)return;setBusy(true);setError('');try{setSent(await api.lessonReschedules('',{lessonKey:source.key,...target,comment}));await reload();}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <Dialog title="Перенести занятие" onClose={()=>{if(!busy)onClose();}} footer={target&&source&&!loading&&!pending&&!sent&&<>
    <div className="lr-footer-selection"><div><small>НОВОЕ ВРЕМЯ · {source.durationMinutes} МИН</small><strong>{lessonDateLabel(target.date)} · {lessonTimeLabel(target)}</strong><span>После подтверждения учителем</span></div><button className="lr-primary" disabled={busy} onClick={submit}>{busy?<Loader2 className="animate-spin" size={17}/>:<Send size={17}/>}Запросить перенос</button></div>
    <details className="lr-comment"><summary>Добавить комментарий учителю</summary><label className="lr-field">Комментарий учителю<textarea maxLength={400} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Например, в этот день школьное мероприятие"/></label></details>
  </>}><div className="lr-body">
    {error&&<div role="alert" className="lr-error">{error}<button onClick={()=>{setKey('');setWeek(rescheduleWeek());setRetry(n=>n+1);}}>Выбрать занятие заново</button></div>}
    {sent?<div className="lr-sent"><span className="lr-success-icon"><Check size={30}/></span><h3>Запрос отправлен учителю</h3><p>До подтверждения действует прежнее расписание. Ответ можно посмотреть в истории запросов в этом окне.</p><MoveSummary source={sent.source} target={sent.target}/><button className="lr-primary" onClick={onClose}>Понятно</button></div>:<>
      <p className="lr-intro">Выберите одно своё занятие и новое время. Остальные занятия останутся в расписании.</p>
      <label className="lr-field">Какое занятие переносим?<select value={key||data?.selectedKey||''} disabled={busy||!data?.lessons.length} onChange={e=>setKey(e.target.value)}>
        {!data?.lessons.length&&<option value="">{loading?'Ищем ваши занятия…':'Нет предстоящих индивидуальных занятий'}</option>}
        {data?.lessons.map(l=><option key={l.key} value={l.key}>{lessonDateLabel(l.date)} · {lessonTimeLabel(l)}</option>)}
      </select></label>
      {pending&&<div className="lr-pending"><strong>{rescheduleStatus[pending.status]}</strong><span>{lessonDateLabel(pending.target.date)} · {lessonTimeLabel(pending.target)}</span>{pending.status==='pending'&&<button disabled={busy} onClick={async()=>{setBusy(true);try{await api.lessonReschedules(`/${pending.id}/cancel`,{});await reload();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Отменить запрос</button>}</div>}
      <div className="lr-week"><button aria-label="Предыдущая неделя" disabled={week<=rescheduleWeek(0)||busy} onClick={()=>setWeek(w=>addCalendarDays(w,-7))}><ChevronLeft size={19}/></button><div><span>{week===rescheduleWeek(1)?'СЛЕДУЮЩАЯ НЕДЕЛЯ':week===rescheduleWeek(0)?'ЭТА НЕДЕЛЯ':'НЕДЕЛЯ ДЛЯ ПЕРЕНОСА'}</span><strong>{lessonDateLabel(week)} — {lessonDateLabel(addCalendarDays(week,6))}</strong></div><button aria-label="Следующая неделя" disabled={week>=rescheduleWeek(12)||busy} onClick={()=>setWeek(w=>addCalendarDays(w,7))}><ChevronRight size={19}/></button></div>
      <div className="lr-periods" aria-label="Часть дня">{[['morning','Утро','08–12'],['day','День','12–17'],['evening','Вечер','17–24']].map(([id,label,hours])=><button key={id} aria-pressed={period===id} onClick={()=>setPeriod(id)}>{label}<small>{hours}</small></button>)}</div>
      <p className="lr-hint">Только свободное время на выбранной неделе. Каждая карточка — весь урок{source?` на ${source.durationMinutes} минут`:''}.</p>
      {loading?<div className="lr-loading"><Loader2 className="animate-spin" size={23}/>Проверяем календарь преподавателя…</div>:source&&<>
        <nav className="lr-mobile-days" aria-label="День для переноса">{AVAILABILITY_DAYS.map((d,i)=><button key={d} aria-pressed={day===i} onClick={()=>setDay(i)}>{d}</button>)}</nav>
        <div className="lr-days">{data.days.map((d,i)=>{const times=d.slots.filter(t=>period==='morning'?t<'12:00':period==='day'?t>='12:00'&&t<'17:00':t>='17:00');return <section key={d.date} className={day===i?'is-active':''} aria-label={lessonDateLabel(d.date)}><header><strong>{AVAILABILITY_DAYS[i]}</strong><span>{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</span></header><div>{times.map(time=><button key={time} disabled={!!pending||busy} aria-pressed={target?.date===d.date&&target?.time===time} onClick={()=>setTarget({date:d.date,time,durationMinutes:source.durationMinutes})}><strong>{lessonTimeLabel({time,durationMinutes:source.durationMinutes})}</strong><span>{target?.date===d.date&&target?.time===time?'Выбрано':'Свободно'}</span></button>)}{!times.length&&<p>Нет свободного времени</p>}</div></section>;})}</div>
      </>}

    </>}
    {rows.length>0&&!sent&&<details className="lr-history"><summary>Мои запросы на перенос · {rows.length}</summary>{rows.slice(0,12).map(r=><article key={r.id}><strong>{rescheduleStatus[r.status]}</strong><span>{lessonDateLabel(r.source.date)}, {r.source.time} → {lessonDateLabel(r.target.date)}, {r.target.time}</span>{r.resolutionNote&&<p>{r.resolutionNote}</p>}</article>)}</details>}
  </div></Dialog>;
}

const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
function DayPreview({date,busy,highlight,before,range,afterLabel="Станет"}) {
  const events=busy.filter(e=>e.date===date&&!e.source);const [min,max]=range;
  return <section className="lr-preview-day"><header><small>{before?'БЫЛО':afterLabel.toUpperCase()}</small><strong>{lessonDateLabel(date)}</strong></header><div className="lr-day-grid" style={{height:(max-min)*32}}>
    {Array.from({length:max-min+1},(_,i)=><div className="lr-hour" key={i} style={{top:i*32}}><span>{String(i+min).padStart(2,'0')}:00</span></div>)}
    {events.map((e,i)=><div key={i} className="lr-busy-event" style={{top:(minute(e.time)/60-min)*32,height:Math.max(18,e.durationMinutes/60*32)}}><span>Занято · {lessonTimeLabel(e)}</span></div>)}
    <div className={`lr-highlight ${before?'lr-old':'lr-new'}`} style={{top:(minute(highlight.time)/60-min)*32,height:Math.max(26,highlight.durationMinutes/60*32)}}><strong>{before?'Исходное занятие':afterLabel==='Стало'?'Новое время':'Предложенное время'}</strong><span>{lessonTimeLabel(highlight)}</span></div>
  </div></section>;
}

export function TeacherRescheduleInbox({userId,showEmpty=false}) {
  const {rows,error:loadError,reload}=useRequests();const [open,setOpen]=useState(false);const [selected,setSelected]=useState('');const [preview,setPreview]=useState(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);const [notice,setNotice]=useState('');const [note,setNote]=useState('');
  const pending=rows.filter(r=>['pending','applying'].includes(r.status));
  const afterLabel=preview?.request.status==='approved'?'Стало':['rejected','cancelled'].includes(preview?.request.status)?'Предлагалось':'Станет';
  const timeline=preview?[...preview.busy,preview.request.source,preview.request.target]:[];
  const range=[Math.max(0,Math.floor(Math.min(...timeline.map(e=>minute(e.time)))/60)-1),Math.min(24,Math.ceil(Math.max(...timeline.map(e=>minute(e.time)+e.durationMinutes))/60)+1)];
  useEffect(()=>{if(!selected)return;let alive=true;setLoading(true);setPreview(null);setError('');setNote('');api.lessonReschedules(`/${selected}/preview`).then(v=>{if(alive)setPreview(v);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[selected]);
  const resolve=async action=>{setBusy(true);setError('');try{await api.lessonReschedules(`/${selected}/${action}`,{note});setNotice(action==='approve'?'Перенесено в Google Календаре и на платформе.':'Запрос отклонён. Прежнее расписание сохранено.');setSelected('');await reload();}catch(e){setError(e.message);await reload();}finally{setBusy(false);}};
  if(!userId || (!pending.length && !showEmpty && !open))return null;
  return <><button className={`lr-notification ${pending.length?'has-requests':''}`} onClick={()=>{setOpen(true);setNotice('');void reload();}} aria-label={`Запросы на перенос занятий: ${pending.length}`}><CalendarClock size={18}/><span>Переносы занятий</span>{pending.length>0&&<b>{pending.length}</b>}</button>{open&&<Dialog title="Запросы на перенос" onClose={()=>{if(!busy){setOpen(false);setSelected('');}}}><div className="lr-body">
    {(error||loadError)&&<div className="lr-error" role="alert">{error||loadError}</div>}{notice&&<div className="lr-pending" role="status">{notice}</div>}
    {!selected?<><p className="lr-intro">Сначала посмотрите, как изменится календарь, затем подтвердите перенос одного занятия.</p>{!pending.length&&<p className="lr-empty">Новых запросов пока нет.</p>}{rows.slice(0,30).map(r=><button className="lr-request" key={r.id} onClick={()=>setSelected(r.id)}><span className="lr-request-avatar">{r.studentName.slice(0,1)}</span><span><strong>{r.studentName}</strong><small>{lessonDateLabel(r.source.date)}, {r.source.time} → {lessonDateLabel(r.target.date)}, {r.target.time}</small><em>{rescheduleStatus[r.status]}</em></span><ChevronRight size={20}/></button>)}</>:<>
      <button className="lr-back" disabled={busy} onClick={()=>setSelected('')}><ChevronLeft size={16}/>Все запросы</button>
      {loading&&<div className="lr-loading"><Loader2 className="animate-spin"/>Проверяем актуальный календарь…</div>}
      {preview&&<><h3 className="lr-student-name">{preview.request.studentName}</h3><p className="lr-hint">{rescheduleStatus[preview.request.status]}{preview.request.resolutionNote&&` · ${preview.request.resolutionNote}`}</p>{preview.request.comment&&<p className="lr-quote">«{preview.request.comment}»</p>}<MoveSummary source={preview.request.source} target={preview.request.target} targetLabel={afterLabel}/><div className="lr-preview"><DayPreview date={preview.request.source.date} busy={preview.busy} highlight={preview.request.source} range={range} before/><DayPreview date={preview.request.target.date} busy={preview.busy} highlight={preview.request.target} range={range} afterLabel={afterLabel}/></div>
        {preview.conflict&&<div className="lr-error" role="alert">{preview.conflict}</div>}
        {['pending','applying'].includes(preview.request.status)&&<><label className="lr-field">Ответ ученику <small>необязательно</small><input value={note} maxLength={400} onChange={e=>setNote(e.target.value)}/></label><div className="lr-decision"><button disabled={busy||preview.request.status==='applying'} onClick={()=>resolve('reject')}>Отклонить</button><button className="lr-primary" disabled={busy||!!preview.conflict} onClick={()=>resolve('approve')}>{busy?<Loader2 className="animate-spin" size={18}/>:<Check size={18}/>}Подтвердить и перенести</button></div><p className="lr-hint">Повторно проверим свободное время и изменим только это занятие в Google Календаре.</p></>}
      </>}
    </>}
  </div></Dialog>}</>;
}
