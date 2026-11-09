import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Check, Clock3, Copy, LockKeyhole, Plus, RefreshCcw, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api } from '../services/api';
import useStudentNameAvailability from '../hooks/useStudentNameAvailability';
import { parentContacts } from '../services/studentParentContacts';
import { studentContacts } from '../services/studentContacts';
import { normalizeStudentParentContact, normalizeStudentContact, copyParentMessage } from '../utils/studentParentContact';
import { AVAILABILITY_DAY_NAMES, clockTime, weekdayIndex } from '../utils/groupAvailability';
import './TrialCalendarSlots.css';

const minute=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
function Dialog({title,subtitle,onClose,children}){
  return createPortal(<div className="trial-slots__backdrop" onClick={onClose}><section className="trial-slots__dialog" role="dialog" aria-modal="true" aria-label={title} onClick={event=>event.stopPropagation()}><header><span className="trial-slots__icon"><CalendarClock size={24}/></span><div><small>ПРОБНЫЕ ЗАНЯТИЯ</small><h2>{title}</h2><p>{subtitle}</p></div><button aria-label="Закрыть пробные слоты" onClick={onClose}><X size={20}/></button></header>{children}</section></div>,document.body);
}
function Configure({teacherId,plan,onSaved,onClose}){
  const [slots,setSlots]=useState(plan.slots),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const change=(index,patch)=>setSlots(old=>old.map((slot,i)=>i===index?{...slot,...patch}:slot));
  return <Dialog title="Время для пробных" subtitle="До четырёх постоянных слотов в разные дни. Москва · UTC+3" onClose={()=>!busy&&onClose()}><form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{onSaved(await api.saveTrialSlots(teacherId,{slots,revision:plan.revision}));onClose();}catch(failure){setError(failure.message);}finally{setBusy(false);}}}>
    <div className="trial-slots__body"><p className="trial-slots__explain"><LockKeyhole size={17}/>Эти часы защищены от других занятий. Пустой слот не создаёт урок и напоминание.</p>
      {slots.map((slot,index)=><div className="trial-slots__rule" key={slot.id || index}><span>{index+1}</span><label>День<select aria-label={`День слота ${index+1}`} value={slot.day} disabled={busy} onChange={event=>change(index,{day:Number(event.target.value)})}>{AVAILABILITY_DAY_NAMES.map((name,day)=><option key={name} value={day} disabled={slots.some((s,i)=>i!==index&&s.day===day)}>{name}</option>)}</select></label><label>Начало<input aria-label={`Время слота ${index+1}`} type="time" required value={slot.time} disabled={busy} onChange={event=>change(index,{time:event.target.value})}/></label><label>Минут<input aria-label={`Длительность слота ${index+1}`} type="number" min="15" max="180" required value={slot.durationMinutes} disabled={busy} onChange={event=>change(index,{durationMinutes:Number(event.target.value)})}/><div className="trial-slots__presets">{[30,40,60].map(duration=><button type="button" key={duration} disabled={busy} aria-pressed={slot.durationMinutes===duration} onClick={()=>change(index,{durationMinutes:duration})}>{duration}</button>)}</div></label><button type="button" aria-label={`Убрать слот ${index+1}`} disabled={busy} onClick={()=>setSlots(old=>old.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>)}
      {slots.length<4&&<button className="trial-slots__add-rule" type="button" disabled={busy} onClick={()=>setSlots(old=>[...old,{id:crypto.randomUUID(),day:[0,1,2,3,4,5,6].find(day=>!old.some(s=>s.day===day)),time:'12:00',durationMinutes:60}])}><Plus size={16}/>Добавить постоянный слот</button>}
      {!slots.length&&<p className="trial-slots__empty">Закрепите удобное время, а участников добавляйте прямо в сетке календаря на выбранную дату.</p>}
      {error&&<p role="alert" className="trial-slots__error">{error}</p>}
    </div><footer><button type="button" disabled={busy||!slots.length} onClick={async()=>{try{await copyParentMessage(slots.slice().sort((a,b)=>a.day-b.day).map(slot=>`${AVAILABILITY_DAY_NAMES[slot.day]} ${slot.time}–${clockTime(minute(slot.time)+slot.durationMinutes)}`).join('\n'));setCopied(true);}catch(failure){setError(failure.message);}}}><Copy size={15}/>{copied?'Скопировано':'Скопировать время'}</button><button className="trial-slots__primary" disabled={busy}>{busy?'Сохраняем…':'Сохранить слоты'}</button></footer>
  </form></Dialog>;
}
function Participants({teacherId,plan,selection,students,onSaved,onClose}){
  const slot=plan.slots.find(s=>s.id===selection.slotId),booking=plan.bookings.find(row=>row.slotId===selection.slotId&&row.date===selection.date);
  const [mode,setMode]=useState('existing'),[studentId,setStudentId]=useState(''),[created,setCreated]=useState(null);
  const [name,setName]=useState(''),[nickname,setNickname]=useState(''),[parentName,setParentName]=useState(''),[parentUrl,setParentUrl]=useState(''),[pupilUrl,setPupilUrl]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[codeCopied,setCodeCopied]=useState(false);
  const availability=useStudentNameAvailability(name,nickname,teacherId);
  const time=booking?.time || slot?.time,duration=booking?.durationMinutes || slot?.durationMinutes;
  const future=time && Date.parse(`${selection.date}T${time}:00+03:00`)>Date.now();
  const run=async action=>{setBusy(true);setError('');try{onSaved(await action());}catch(failure){setError(failure.message);}finally{setBusy(false);}};
  const add=async event=>{
    event.preventDefault();setBusy(true);setError('');
    try{
      let pupil=created;
      if(mode==='new'){
        // Validate contacts before creating an account; retain the account for safe retry.
        const parent=parentUrl.trim()?normalizeStudentParentContact({name:parentName,url:parentUrl}):null;
        const contact=pupilUrl.trim()?normalizeStudentContact({name,url:pupilUrl}):null;
        if(parentName.trim()&&!parent)throw Error('Добавьте телефон или ссылку для указанного родителя.');
        if(!pupil){pupil=await api.createStudent(name,teacherId,{nickname});setCreated(pupil);}
        if(parent)await parentContacts.save(pupil.id,parent);
        if(contact)await studentContacts.save(pupil.id,contact);
      }else pupil={id:studentId};
      onSaved(await api.addTrialParticipant(teacherId,selection.slotId,selection.date,{studentId:pupil.id,revision:booking?.revision || 0}));
      setStudentId('');
    }catch(failure){setError(failure.message);}finally{setBusy(false);}
  };
  const enrolled=booking?.participants || [];
  const createdEnrolled=!!created&&enrolled.some(person=>person.id===created.id);
  return <Dialog title={enrolled.length?'Участники пробного':'Кто придёт на пробное?'} subtitle={`${new Date(`${selection.date}T12:00:00`).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})} · ${time}–${time?clockTime(minute(time)+duration):''} · Москва`} onClose={()=>!busy&&onClose()}><div className="trial-slots__body">
    <div className={`trial-slots__attendance ${enrolled.length?'has-people':''}`}><Users size={22}/><div><strong>{enrolled.length?`Записано: ${enrolled.length}`:'Пока никого нет'}</strong><p>{enrolled.length?'Все участники придут в одно и то же время.':'Резерв занят в расписании, но урока и уведомления пока нет.'}</p></div></div>
    {enrolled.map(person=><div className="trial-slots__person" key={person.id}><span>{person.name?.[0]}</span><strong>{person.name}</strong>{future&&<button type="button" disabled={busy} onClick={()=>run(()=>api.removeTrialParticipant(teacherId,selection.slotId,selection.date,person.id,booking.revision))}>Снять запись</button>}</div>)}
    {booking?.syncStatus==='pending'&&<div className="trial-slots__sync" role="status"><span>{booking.syncError || 'Обновляем Google Calendar…'}</span><button disabled={busy} onClick={()=>run(()=>api.syncTrialBooking(teacherId,selection.slotId,selection.date))}><RefreshCcw size={14}/>Повторить</button></div>}
    {booking?.syncStatus==='synced'&&<p className="trial-slots__synced"><Check size={14}/>{enrolled.length?'Есть в Google Calendar · напоминания как обычно':'Событие убрано из Google · резерв остаётся'}</p>}
    {future&&slot&&<><div className="trial-slots__tabs"><button disabled={busy||!!created&&!createdEnrolled} aria-pressed={mode==='existing'} onClick={()=>setMode('existing')}>Существующий ученик</button><button disabled={busy||!!created&&!createdEnrolled} aria-pressed={mode==='new'} onClick={()=>setMode('new')}><UserPlus size={15}/>Новый ученик</button></div>{!(mode==='new'&&createdEnrolled)&&<form onSubmit={add}>
      {mode==='existing'?<label>Ученик<select required value={studentId} disabled={busy} onChange={event=>setStudentId(event.target.value)}><option value="">Выберите ученика</option>{students.filter(pupil=>!pupil.deletedAt&&!enrolled.some(p=>p.id===pupil.id)).map(pupil=><option value={pupil.id} key={pupil.id}>{pupil.name}{pupil.nickname?` · ${pupil.nickname}`:''}</option>)}</select></label>:<>
        <div className="trial-slots__fields"><label>Имя ученика<input autoComplete="off" required disabled={busy||!!created} value={name} onChange={event=>setName(event.target.value)} maxLength={60}/></label><label>Подпись для различения<input disabled={busy||!!created} value={nickname} onChange={event=>setNickname(event.target.value)} placeholder="Если есть тёзка" maxLength={60}/></label></div>
        {!created&&name&&<p className={availability.canCreate?'trial-slots__synced':'trial-slots__hint'}>{availability.pending?'Проверяем имя…':availability.message || (availability.canCreate?'Имя свободно':'Укажите другое имя или подпись')}</p>}
        {availability.error&&<button type="button" onClick={availability.retry}>Повторить проверку имени</button>}
        <div className="trial-slots__fields"><label>Имя родителя<input disabled={busy} value={parentName} onChange={event=>setParentName(event.target.value)} maxLength={80}/></label><label>Контакт родителя<input disabled={busy} value={parentUrl} onChange={event=>setParentUrl(event.target.value)} placeholder="Телефон, @username или ссылка"/></label></div><label>Контакт ученика · необязательно<input disabled={busy} value={pupilUrl} onChange={event=>setPupilUrl(event.target.value)} placeholder="Телефон, @username или ссылка"/></label>
      </>}
      <button className="trial-slots__primary trial-slots__submit" disabled={busy || (mode==='new'?!created&&!availability.canCreate:!studentId)}><Plus size={16}/>{busy?'Сохраняем…':created?'Записать созданного ученика':mode==='new'?'Создать и записать на пробное':'Добавить участника'}</button>
    </form>}</>}
    {created&&<div className="trial-slots__credentials"><strong>{createdEnrolled?'Создан и записан':'Аккаунт создан'}: {created.name}</strong><span>Код входа: <b>{created.code}</b></span><button type="button" onClick={async()=>{try{await copyParentMessage(created.code);setCodeCopied(true);}catch(failure){setError(failure.message);}}}><Copy size={14}/>{codeCopied?'Скопировано':'Скопировать код'}</button></div>}
    {createdEnrolled&&<button type="button" onClick={()=>{setCreated(null);setName('');setNickname('');setParentName('');setParentUrl('');setPupilUrl('');setCodeCopied(false);setMode('new');}}><UserPlus size={15}/>Создать ещё одного ученика</button>}
    {error&&<p role="alert" className="trial-slots__error">{error}</p>}
  </div><footer><small>Участники записаны только на эту дату.</small><button onClick={()=>!busy&&onClose()} disabled={busy}>Готово</button></footer></Dialog>;
}
export function TrialSlotDialogs({teacherId,plan,selection,configure,students,onSaved,onClose}){
  const [roster,setRoster]=useState(students);
  useEffect(()=>{
    let cancelled=false;
    if(selection)api.getStudents(teacherId).then(list=>{if(!cancelled)setRoster(list);}).catch(()=>{/* Keep the current roster if refresh is unavailable. */});
    return ()=>{cancelled=true;};
  },[teacherId,selection]);
  if(!plan)return null;
  return configure?<Configure teacherId={teacherId} plan={plan} onSaved={onSaved} onClose={onClose}/>:selection?<Participants key={`${selection.slotId}:${selection.date}`} teacherId={teacherId} plan={plan} selection={selection} students={roster || students} onSaved={onSaved} onClose={onClose}/>:null;
}
export function TrialSlotDay({plan,date,dayStartMinutes,hourHeight,onOpen}){
  if(!plan)return null;
  const slots=plan.slots.filter(slot=>slot.day===weekdayIndex(date)&&date>=slot.repeatFrom);
  const cards=slots.map(slot=>({...slot,booking:plan.bookings.find(row=>row.slotId===slot.id&&row.date===date)}));
  for(const booking of plan.bookings.filter(row=>row.date===date&&row.studentIds.length&&!slots.some(slot=>slot.id===row.slotId)))cards.push({id:booking.slotId,time:booking.time,durationMinutes:booking.durationMinutes,booking});
  return cards.map(slot=>{
    const names=slot.booking?.participants?.map(p=>p.name) || [];
    return <button key={slot.id} type="button" className={`trial-slot-grid ${names.length?'has-people':''}`} style={{top:(minute(slot.time)-dayStartMinutes)/60*hourHeight,height:Math.max(27,slot.durationMinutes/60*hourHeight-3)}}
      onClick={event=>{event.stopPropagation();onOpen({slotId:slot.id,date});}} onDragOver={event=>{event.preventDefault();event.stopPropagation();}} onDrop={event=>{event.preventDefault();event.stopPropagation();onOpen({slotId:slot.id,date});}}
      aria-label={`Пробное ${date} ${slot.time}: ${names.length?names.join(', '):'никого нет'}`} title={`${slot.time} · ${slot.durationMinutes} мин · ${names.length?names.join(', '):'Никого нет — только резерв'}`}>
      <span><LockKeyhole size={11}/><strong>{names.length?`Пробное · ${names.length} уч.`:'Пробное · никого нет'}</strong></span><small>{slot.time} · {names.length?names.join(', '):'Добавить участника'}</small>
    </button>;
  });
}
