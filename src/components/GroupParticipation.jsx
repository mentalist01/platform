import {useEffect, useState} from 'react';
import {participationDay, participationPlanAt, participationSlotLabel} from '../utils/groupParticipation.js';
import {groupParticipationApi} from '../services/groupParticipationApi.js';
import './GroupParticipation.css';
export function GroupParticipationPanel({group, onSaved, transport = groupParticipationApi}) {
  const [available,setAvailable]=useState([]), [studentId,setStudentId]=useState('');
  const [from,setFrom]=useState(participationDay(Date.now())), [mode,setMode]=useState('all'), [slots,setSlots]=useState([]);
  const [error,setError]=useState(''), [busy,setBusy]=useState(false), [review,setReview]=useState(null), [success,setSuccess]=useState('');
  useEffect(()=>{let alive=true; transport.getLearningGroupParticipation(group.id).then(r=>{if(alive)setAvailable(r.slots);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[group.id,transport]);
  const choose = (id, date = participationDay(Date.now())) => {
    const plan = participationPlanAt(group.members.find(m=>m.studentId===id),date);
    setStudentId(id);setFrom(date);setMode(plan.mode);setSlots(plan.slots);setReview(null);setError('');setSuccess('');
  };
  const act = async fn => {setBusy(true);setError('');setSuccess('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
  const changed = () => {setReview(null);setSuccess('');};
  return <details className="group-participation"><summary>Индивидуальные планы участия</summary>
    <p>Закреплённый урок учитывается в оплате и при пропуске. Заранее согласуйте это условие с родителем.</p>
    <label>Ученик<select value={studentId} disabled={busy} onChange={e=>choose(e.target.value)}><option value="">Выберите ученика</option>{group.members.filter(m=>m.status!=='removed').map(m=><option key={m.studentId} value={m.studentId}>{m.name}</option>)}</select></label>
    {studentId && <><div className="group-participation-fields"><label>Действует с<input type="date" min={participationDay(Date.now())} value={from} disabled={busy} onChange={e=>{setFrom(e.target.value);changed();}}/></label>
      <label>Участие<select value={mode} disabled={busy} onChange={e=>{setMode(e.target.value);changed();}}><option value="all">Все занятия группы</option><option value="selected">Только выбранные занятия</option></select></label></div>
      {mode==='selected' && <fieldset><legend>Обязательные занятия ученика</legend>{available.length ? available.map(slot=><label className="group-participation-slot" key={slot}><input type="checkbox" checked={slots.includes(slot)} disabled={busy} onChange={e=>{setSlots(current=>e.target.checked?[...current,slot]:current.filter(s=>s!==slot));changed();}}/>{participationSlotLabel(slot)}</label>):<p>Сначала добавьте занятия в расписание группы.</p>}</fieldset>}
      <div className="group-participation-actions"><button disabled={busy || !from || (mode==='selected'&&!slots.length)} onClick={()=>act(async()=>{await transport.saveLearningGroupParticipation(group.id,studentId,{from,mode,slots});await onSaved?.();setSuccess('План участия сохранён.');})}>Сохранить план</button>
      {mode==='selected' && <button className="is-secondary" disabled={busy || !slots.length} onClick={()=>act(async()=>setReview((await transport.reviewLearningGroupParticipation(group.id,studentId,{mode,slots})).lessons))}>Проверить прошлые начисления</button>}</div>
      {review && <section className="group-participation-review"><strong>Неоплаченные уроки вне выбранного плана</strong><p>Исключайте только занятия, на которые ученик не должен был приходить по вашей договорённости. Оплаченные уроки здесь не показаны.</p>{review.length ? review.map(l=><div key={l.id}><span>{new Date(l.startAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})} · {l.amount} ₽</span><button disabled={busy} className="is-secondary" onClick={()=>act(async()=>{await transport.saveLearningLessonParticipation(group.id,l.id,{studentId,assigned:false});setReview(current=>current.filter(row=>row.id!==l.id));await onSaved?.();setSuccess('Начисление за этот урок исключено.');})}>Исключить начисление</button></div>):<p>Таких начислений нет.</p>}</section>}
      {(group.members.find(m=>m.studentId===studentId)?.participationPlans || []).map(p=><p key={p.effectiveAt || p.from}>С {new Date(p.effectiveAt || `${p.from}T12:00:00+03:00`).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}: {p.mode==='all'?'все занятия группы':p.slots.map(participationSlotLabel).join(' · ')}</p>)}
    </>}{error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
  </details>;
}
export function LessonParticipationEditor({group,lesson,onSaved,transport=groupParticipationApi}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  const save=async(studentId,assigned)=>{setBusy(studentId);setError('');try{await transport.saveLearningLessonParticipation(group.id,lesson.id,{studentId,assigned});await onSaved?.();}catch(e){setError(e.message);}finally{setBusy('');}};
  return <details className="group-participation group-participation-lesson"><summary>Участие в этом занятии</summary><p>Разовое изменение применяется только к этому уроку.</p>{group.members.filter(m=>lesson.participantIds.includes(m.studentId)).map(m=>{
    const assigned=(lesson.requiredParticipantIds || lesson.participantIds).includes(m.studentId);
    return <div className="group-participation-lesson-row" key={m.studentId}><strong>{m.name}</strong><span>{assigned?'Обязательное занятие':'Не участвует по расписанию'}</span><button disabled={Boolean(busy)} className="is-secondary" onClick={()=>save(m.studentId,!assigned)}>{assigned?'Исключить участие':'Добавить участие'}</button>{typeof lesson.participationOverrides?.[m.studentId]==='boolean' && <button disabled={Boolean(busy)} className="is-secondary" onClick={()=>save(m.studentId,null)}>По обычному плану</button>}</div>;
  })}{error && <p role="alert">{error}</p>}</details>;
}
