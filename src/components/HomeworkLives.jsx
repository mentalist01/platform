import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X, MessageCircle, RotateCcw } from 'lucide-react';
import { homeworkLivesRequest, teacherHomeworkLives, notifyHomeworkLivesUpdated } from '../services/homeworkLives';
import { formatLives, lifeFractions, nextLivesMonth } from '../utils/homeworkLives';
import './HomeworkLives.css';
const StudentParentContact = React.lazy(() => import('./StudentParentContact'));

const dateLabel = value => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });
const monthLabel = month => new Date(`${month}-15T12:00:00+03:00`).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', month: 'long', year: 'numeric' });

export function PixelLives({ remaining, size = 'normal' }) {
  return <span className={`homework-pixel-lives homework-pixel-lives--${size}`} aria-hidden="true">
    {lifeFractions(remaining).map((fraction, index) => <span key={index} className={`homework-pixel-life${fraction === 0 ? ' homework-pixel-life--empty' : ''}`}>
      <span className="homework-pixel-life__shape"><span className="homework-pixel-life__fill" style={{ height: `${fraction * 100}%` }} /></span>
    </span>)}
  </span>;
}

function useHomeworkLives(studentId) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const generation = useRef(0);
  const currentStudent = useRef(studentId);
  currentStudent.current = studentId;
  const refresh = useCallback(async () => {
    if (!studentId) return;
    const current = generation.current;
    try {
      const value = await homeworkLivesRequest(`?studentId=${encodeURIComponent(studentId)}`);
      if (current === generation.current && currentStudent.current === studentId) { setData(value); setError(''); }
    } catch (failure) { if (current === generation.current && currentStudent.current === studentId) setError(failure.message); }
  }, [studentId]);
  useEffect(() => {
    generation.current += 1; setData(null); setError('');
    let inFlight = false;
    const update = async () => {
      if (document.visibilityState === 'hidden' || inFlight) return;
      inFlight = true; try { await refresh(); } finally { inFlight = false; }
    };
    void update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    window.addEventListener('homework-lives-updated', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      generation.current += 1; window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('homework-lives-updated', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);
  return { data, error, refresh };
}

export function HomeworkLivesRules({ data }) {
  const settlingIn = data.adapting;
  return <>
    <h3>Три жизни на месяц</h3>
    <p>После срока сдачи невыполненная часть обязательной домашки по ЕГЭ уменьшает запас. Python — практика для разбора на уроке: сердца за неё не списываются. Дополнительные задания тоже не учитываются.</p>
    <p>Твой план: <b>{data.plannedCount} домашних работ в месяц</b>. За полностью пропущенную работу — до <b>{formatLives(data.maxLossPerHomework)} жизни</b>. Если выполнена половина — списывается половина этой суммы.</p>
    {settlingIn && <p className="homework-lives-rules__adaptation">Сейчас вводный период. Первые списания — за работы, выданные с {dateLabel(data.effectiveSince)}.</p>}
    <h4>Если все сердца закончатся</h4>
    <p>Преподаватель обсудит с тобой и родителями, что мешает выполнять домашку. Вместе вы договоритесь о посильном плане на следующий месяц.</p>
    <p>Если договорённости снова регулярно не выполняются, преподаватель может предложить паузу в занятиях.</p>
    <p className="homework-lives-rules__foot">Первого числа запас восстанавливается. История и договорённости сохраняются. Ошибочное списание преподаватель может отменить.</p>
  </>;
}

export function HomeworkLivesBadgeView({ data, error = '' }) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 12, width: 380 });
  const trigger = useRef(null), panel = useRef(null), pinned = useRef(false), leaveTimer = useRef(null);
  const id = useId();
  const hide = useCallback(() => { window.clearTimeout(leaveTimer.current); pinned.current = false; setOpen(false); }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
      const width = Math.min(380, window.innerWidth - 24), height = Math.min(panel.current?.offsetHeight || 420, window.innerHeight - 24);
      setPosition({ width, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - height - 12)) });
    };
    reposition(); window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition, true);
    const observer = new ResizeObserver(reposition);
    if (panel.current) observer.observe(panel.current);
    const onKey = event => { if (event.key === 'Escape') hide(); };
    const outside = event => { if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) hide(); };
    document.addEventListener('keydown', onKey); document.addEventListener('pointerdown', outside);
    return () => { observer.disconnect(); window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', outside); };
  }, [open, hide]);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  if (!data) return error ? <span className="homework-lives-unavailable">Жизни временно недоступны</span> : null;
  if (!data.enabled) return null;
  const show = () => { window.clearTimeout(leaveTimer.current); setOpen(true); };
  const leave = () => { if (!pinned.current) leaveTimer.current = window.setTimeout(()=>setOpen(false), 180); };
  return <div className="homework-lives-badge">
    <button type="button" className="homework-lives-badge__trigger" ref={trigger} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      aria-label={`Жизни: ${formatLives(data.remaining)} из 3. Правила и последствия`}
      onPointerEnter={event=>{if(event.pointerType==='mouse')show();}} onPointerLeave={leave} onFocus={show}
      onBlur={event=>{if(!panel.current?.contains(event.relatedTarget))leave();}}
      onClick={()=>{pinned.current=!pinned.current;setOpen(pinned.current);}}>
      <PixelLives remaining={data.remaining} />
      <span className="homework-lives-badge__caption"><b>{formatLives(data.remaining)} / 3</b><Info size={12} /><span>Правила</span></span>
    </button>
    {data.pendingReviews.length > 0 && <small className="homework-lives-badge__review">Нужен разговор с преподавателем</small>}
    {error && <small className="homework-lives-badge__error">Не удалось обновить данные</small>}
    {open && createPortal(<section ref={panel} id={id} role="dialog" aria-label="Жизни: правила и последствия" className="homework-lives-rules" style={position}
      onPointerEnter={show} onPointerLeave={leave} onBlur={event=>{if(!panel.current?.contains(event.relatedTarget)&&event.relatedTarget!==trigger.current)leave();}}>
      <button type="button" className="homework-lives-rules__close" aria-label="Закрыть правила" onClick={hide}><X size={17} /></button>
      <HomeworkLivesRules data={data} />
      {data.history.length > 0 && <div className="homework-lives-rules__last"><b>Последняя проверка</b><span>{data.history[0].title}</span>
        <small>{data.history[0].waivedAt ? (data.history[0].waivedById === 'python-practice-policy' ? 'Python: сердца не списываются' : 'Списание отменено преподавателем') : !data.history[0].reliable ? 'Преподавателю нужно проверить результат' : `${Math.round(data.history[0].percent)}% к сроку сдачи · −${formatLives(data.history[0].deducted)} жизни`}</small></div>}
    </section>, document.body)}
  </div>;
}

export default function HomeworkLivesBadge({ studentId }) {
  const { data, error } = useHomeworkLives(studentId);
  return <HomeworkLivesBadgeView data={data} error={error} />;
}

export function TeacherHomeworkLivesPanel({ studentId, studentName = '' }) {
  const { data, error, refresh } = useHomeworkLives(studentId);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [count, setCount] = useState(4), [waiver, setWaiver] = useState(null), [reason, setReason] = useState('');
  useEffect(()=>{setCount((data?.planLocked ? data.nextPlannedCount : data?.plannedCount) || 4);setWaiver(null);setReason('');setActionError('');},[data?.studentId,data?.plannedCount,data?.nextPlannedCount,data?.planLocked]);
  const act = async (route, body, method) => {
    setBusy(true); setActionError('');
    try { await homeworkLivesRequest(route, body, method); await refresh(); notifyHomeworkLivesUpdated(); setWaiver(null);setReason(''); }
    catch(failure){setActionError(failure.message);}finally{setBusy(false);}
  };
  if (!studentId || (!data&&!error)) return null;
  if (!data) return <div className="homework-lives-panel"><p role="alert">{error}</p></div>;
  if (!data.enabled) return <section className="homework-lives-panel"><b>Три жизни за выполнение домашки по ЕГЭ</b><p>Система будет включена для ваших учеников. Старые домашки не отнимут жизни.</p>
    {(actionError||error)&&<p role="alert">{actionError||error}</p>}<button type="button" disabled={busy} onClick={()=>act('/settings',{enabled:true},'PATCH')}>Включить систему жизней</button></section>;
  const planMonth=data.planLocked?nextLivesMonth(data.month):data.month;
  return <section className="homework-lives-panel" aria-label="Жизни ученика">
    <div className="homework-lives-panel__heading"><div><b>Жизни{studentName ? ` · ${studentName}` : ' ученика'}</b><small>Восстановление {dateLabel(data.resetsAt)}</small></div><PixelLives remaining={data.remaining} size="small" /><strong>{formatLives(data.remaining)} / 3</strong></div>
    <div className="homework-lives-panel__plan"><label>План ДЗ по ЕГЭ · {monthLabel(planMonth)}<input type="number" min="1" max="60" value={count} onChange={event=>setCount(Number(event.target.value))} /></label>
      <button type="button" disabled={busy||!Number.isInteger(count)||count<1||count>60} onClick={()=>act(`/${encodeURIComponent(studentId)}/plan`,{count,month:planMonth})}>Сохранить план</button></div>
    <small>Текущий план по ЕГЭ: {data.plannedCount}. Полностью пропущенная работа — до {formatLives(data.maxLossPerHomework)} жизни. План действует и в следующих месяцах, пока вы его не измените.</small>
    {data.planLocked&&<small>Текущий месяц уже рассчитан: новый план начнёт действовать со следующего.</small>}
    {data.pendingReviews.map(review=><div className="homework-lives-panel__review" key={review.month}><div><b>Нужен разговор</b><small>Жизни закончились · {monthLabel(review.month)}</small></div>
      <React.Suspense fallback={null}><StudentParentContact studentId={studentId} studentName={studentName} compact /></React.Suspense>
      <button type="button" disabled={busy} onClick={()=>act(`/${encodeURIComponent(studentId)}/review`,{month:review.month})}>Разговор проведён</button></div>)}
    {data.needsReview&&<p className="homework-lives-panel__warning">Есть работы без достоверного результата к дедлайну. За них жизни не списаны; проверьте историю.</p>}
    {(actionError||error)&&<p className="homework-lives-panel__error" role="alert">{actionError||error}</p>}
    <details><summary>История проверок ({data.history.length})</summary><div className="homework-lives-panel__history">
      {data.history.slice(0,20).map(event=><div className="homework-lives-history-entry" key={`${event.month}-${event.id}`}><div><b>{event.title}</b><small>{dateLabel(event.dueAt)} · {event.percent==null?'Нужна проверка':`${Math.round(event.percent)}% к сроку сдачи`}</small>
        {event.waivedAt&&<small>Отменено: {event.waiverReason}</small>}</div><span>{event.waivedAt?'Отменено':event.reliable?`−${formatLives(event.deducted)}`:'Без списания'}</span>
        {!event.waivedAt&&(event.loss>0||!event.reliable)&&<button type="button" disabled={busy} onClick={()=>{setWaiver(event.id);setReason('');}}><RotateCcw size={13}/> Отменить списание</button>}
      </div>)}
      {!data.history.length&&<p>Первые проверки появятся после срока сдачи новой домашки.</p>}
    </div></details>
    {waiver&&<form className="homework-lives-panel__waiver" onSubmit={event=>{event.preventDefault();void act(`/${encodeURIComponent(studentId)}/waive`,{eventId:waiver,reason});}}><label>Причина отмены<input value={reason} onChange={event=>setReason(event.target.value)} maxLength="300" placeholder="Например, домашка не отображалась" required /></label><button type="submit" disabled={busy||!reason.trim()}>Сохранить отмену</button><button type="button" onClick={()=>setWaiver(null)}>Закрыть</button></form>}
  </section>;
}

export function TeacherHomeworkLivesNotice({ userId, paused, onOpen }) {
  const [students,setStudents]=useState([]);
  useEffect(()=>{
    let cancelled=false,inFlight=false;setStudents([]);
    if(paused)return;
    const refresh=async()=>{if(inFlight||document.visibilityState==='hidden')return;inFlight=true;try{const value=await teacherHomeworkLives();if(!cancelled)setStudents(value.students.filter(s=>s.pendingReviews.length));}catch{/* Keep the last known notice during a temporary outage. */}finally{inFlight=false;}};
    void refresh();const timer=window.setInterval(refresh,60_000);window.addEventListener('homework-lives-updated',refresh);window.addEventListener('focus',refresh);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('homework-lives-updated',refresh);window.removeEventListener('focus',refresh);};
  },[userId,paused]);
  if(paused||!students.length)return null;
  return <aside className="homework-lives-notice"><MessageCircle size={19}/><div><b>Нужен разговор с учеником</b><small>{students[0].name}: запас жизней закончился{students.length>1?` · ещё ${students.length-1}`:''}</small></div><React.Suspense fallback={null}><StudentParentContact studentId={students[0].studentId} studentName={students[0].name} compact /></React.Suspense><button type="button" onClick={()=>onOpen(students[0].studentId)}>Открыть ученика</button></aside>;
}
