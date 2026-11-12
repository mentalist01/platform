import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withTeacherCalendarLock } from './calendarMutations.js';
import { expandRescheduleOccurrences } from './lessonReschedule.js';
import { AVAILABILITY_WEEKDAYS, AVAILABILITY_DAY_NAMES, moscowDay, addCalendarDays, weekdayIndex } from '../src/utils/groupAvailability.js';
import { DEFAULT_TRIAL_INVITATION, normalizeTrialMeetingUrl, normalizeTrialInvitationTemplate } from '../src/utils/trialInvitation.js';

const fail = (message, status = 400) => { throw Object.assign(Error(message), {status}); };
export const validTrialDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
const minutes = time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? Number(time.slice(0,2))*60+Number(time.slice(3)) : NaN;
const overlaps = (a,b) => minutes(a.time) < minutes(b.time)+Number(b.durationMinutes) && minutes(a.time)+Number(a.durationMinutes) > minutes(b.time);
const active = entry => !entry.cancelled && !entry.isCancelled && entry.status !== 'cancelled';
const bookingKey = (slotId,date) => `${slotId}:${date}`;
export const trialBookingEntry = booking => ({id:`trial-booking-${booking.id}`, trialBookingId:booking.id, date:booking.date, time:booking.time,
  durationMinutes:booking.durationMinutes, weekdayKey:AVAILABILITY_WEEKDAYS[weekdayIndex(booking.date)], weekdayOrder:weekdayIndex(booking.date)+1,
  day:AVAILABILITY_DAY_NAMES[weekdayIndex(booking.date)], studentId:'', participantIds:booking.studentIds,
  subject:`Пробное · ${booking.studentNames.join(', ')}`, studentName:booking.studentNames.join(', '), isTrial:true,
  isTeacherSlot:true, source:'trial-booking', excludedDates:[], startAt:new Date(`${booking.date}T${booking.time}:00+03:00`).toISOString()});

export function createTrialSlotStore(file, now = Date.now) {
  let db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {teachers:{},bookings:{}};
  if (!db.teachers || !db.bookings) throw Error('Invalid trial slots store');
  let googleUids=null;
  const save = next => { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600}); fs.renameSync(file+'.tmp',file); db=next;googleUids=null; };
  const configuration = teacherId => structuredClone(db.teachers[teacherId] || {revision:0,slots:[]});
  const bookings = teacherId => structuredClone(Object.values(db.bookings).filter(row=>row.teacherId===teacherId));
  return {
    configuration, bookings,
    allBookings:()=>structuredClone(Object.values(db.bookings)),
    getBooking:(teacherId,slotId,date)=>structuredClone(db.bookings[`${teacherId}:${bookingKey(slotId,date)}`] || null),
    putBooking(row){save({...db,bookings:{...db.bookings,[`${row.teacherId}:${bookingKey(row.slotId,row.date)}`]:row}});return structuredClone(row);},
    setInvitationTemplate(teacherId,template,revision){
      const previous=configuration(teacherId);
      if(previous.revision!==revision)fail('Настройки пробных изменились в другом окне. Обновите окно.',409);
      let invitationTemplate;
      try{invitationTemplate=normalizeTrialInvitationTemplate(template);}catch(error){fail(error.message);}
      save({...db,teachers:{...db.teachers,[teacherId]:{...previous,revision:previous.revision+1,invitationTemplate}}});
    },
    setSlots(teacherId,slots,revision,{moveBookings=false}={}){
      const previous=configuration(teacherId);
      if (previous.revision!==revision) fail('Слоты изменились в другом окне. Обновите календарь.',409);
      if (!Array.isArray(slots) || slots.length>4) fail('Можно закрепить до четырёх пробных слотов.');
      const normalized=slots.map(slot=>{
        const old=previous.slots.find(value=>value.id===slot.id);
        const durationMinutes=Number(slot.durationMinutes),day=Number(slot.day);
        if (!Number.isInteger(day)||day<0||day>6||!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>180
          ||!Number.isFinite(minutes(slot.time))||minutes(slot.time)+durationMinutes>1440) fail('Выберите день, время и длительность от 15 до 180 минут в пределах дня.');
        return {id:old?.id || crypto.randomUUID(),day,time:slot.time,durationMinutes,repeatFrom:old?.repeatFrom || moscowDay(now())};
      });
      if (new Set(normalized.map(slot=>slot.day)).size!==normalized.length) fail('Выберите разные дни недели для пробных слотов.');
      const nextBookings={...db.bookings};
      for (const old of previous.slots) {
        const changed=!normalized.some(slot=>JSON.stringify(slot)===JSON.stringify(old));
        const upcoming=changed?bookings(teacherId).filter(row=>row.slotId===old.id && row.studentIds.length
          && Date.parse(`${row.date}T${row.time}:00+03:00`)+row.durationMinutes*60000>now()):[];
        const target=normalized.find(slot=>slot.id===old.id);
        if(upcoming.length && (!moveBookings || !target))fail(target
          ?'В этом слоте уже записаны ученики. Откройте его в календаре и нажмите «Изменить слот», чтобы перенести резерв вместе с будущими записями.'
          :'В этом слоте уже записаны ученики. Сначала снимите будущие записи, затем удалите резерв.',409);
        for(const row of upcoming){
          if(Date.parse(`${row.date}T${row.time}:00+03:00`)<=now())fail('Пробное уже началось. Перенесите резерв после окончания занятия.',409);
          const date=addCalendarDays(row.date,target.day-old.day);
          if(Date.parse(`${date}T${target.time}:00+03:00`)<=now())fail('Новое время ближайшей записи уже прошло. Выберите будущий день и время.',409);
          delete nextBookings[`${teacherId}:${bookingKey(old.id,row.date)}`];
          nextBookings[`${teacherId}:${bookingKey(old.id,date)}`]={...row,date,time:target.time,durationMinutes:target.durationMinutes,
            revision:row.revision+1,syncStatus:'pending',updatedAt:new Date(now()).toISOString()};
        }
      }
      const value={...previous,revision:previous.revision+1,slots:normalized};save({...db,teachers:{...db.teachers,[teacherId]:value},bookings:nextBookings});return value;
    },
    reservations(teacherId){return configuration(teacherId).slots.map(slot=>({id:`trial-reserve-${slot.id}`,trialReservation:true,
      weekdayKey:AVAILABILITY_WEEKDAYS[slot.day],weekdayOrder:slot.day+1,time:slot.time,durationMinutes:slot.durationMinutes,repeatFrom:slot.repeatFrom,subject:'Резерв для пробного'}));},
    entries(teacherId){return bookings(teacherId).filter(row=>row.studentIds.length).map(trialBookingEntry);},
    managesGoogle(teacherId,event){
      if(event.extendedProperties?.private?.ivan100TrialTeacher===teacherId)return true;
      if(!googleUids){googleUids=new Set(Object.values(db.bookings).filter(row=>row.google?.iCalUID).map(row=>`${row.teacherId}:${row.google.iCalUID}`));}
      return googleUids.has(`${teacherId}:${event.externalEventId || event.iCalUID || event.uid}`);
    },
    assertFree(teacherId,entry){
      if (!active(entry)) return;
      const day=entry.date ? weekdayIndex(entry.date) : AVAILABILITY_WEEKDAYS.indexOf(entry.weekdayKey);
      if(configuration(teacherId).slots.some(slot=>slot.day===day && (!entry.date||entry.date>=slot.repeatFrom)
        && (!entry.repeatUntil||entry.repeatUntil>=slot.repeatFrom) && overlaps(slot,entry)))
        fail('Это время закреплено под пробные занятия. Добавьте участника в пробный слот или выберите другое время.',409);
    },
  };
}

export function registerTrialSlots(app,{store,getTeacher,getStudent,getEntries,applyStudents,syncGoogle,notify=()=>{},now=Date.now}){
  const access=req=>{
    if(!['teacher','admin'].includes(req.auth?.role)) fail('Нет доступа',403);
    const teacherId=req.auth.role==='teacher'?req.auth.id:String(req.query?.teacherId || req.body?.teacherId || '');
    if(!getTeacher(teacherId)) fail('Преподаватель не найден',404);return teacherId;
  };
  const view=teacherId=>({...store.configuration(teacherId),invitationTemplate:store.configuration(teacherId).invitationTemplate || DEFAULT_TRIAL_INVITATION,bookings:store.bookings(teacherId).map(row=>({...row,
    participants:row.studentIds.map((id,index)=>({id,name:getStudent(id)?.teacherId===teacherId?getStudent(id)?.name || row.studentNames[index]:'Ученик недоступен'}))}))});
  const sync=async row=>{
    try{
      // Persist local schedules first, even if Google is temporarily unavailable.
      await applyStudents(row);
      const google=await syncGoogle(row);
      row=store.putBooking({...row,google,syncStatus:'synced',syncError:''});
    }catch(error){row=store.putBooking({...row,syncStatus:'pending',syncError:error.message || 'Не удалось обновить Google Calendar.'});}
    notify(row.teacherId);return row;
  };
  const route=action=>async(req,res)=>{res.setHeader('Cache-Control','private, no-store');try{res.json(await action(req));}
    catch(error){res.status(error.status||503).json({error:error.status?error.message:'Не удалось сохранить пробные слоты. Повторите попытку.'});}};
  app.get('/api/trial-slots',route(req=>view(access(req))));
  app.put('/api/trial-slots/invitation-template',route(req=>{
    const teacherId=access(req);
    return withTeacherCalendarLock(teacherId,async()=>{
      store.setInvitationTemplate(teacherId,req.body?.template,req.body?.revision);notify(teacherId);return view(teacherId);
    });
  }));
  app.patch('/api/trial-slots/:slotId/:date/meeting',route(req=>{
    const teacherId=access(req),{slotId,date}=req.params;
    return withTeacherCalendarLock(teacherId,async()=>{
      const slot=store.configuration(teacherId).slots.find(value=>value.id===slotId),previous=store.getBooking(teacherId,slotId,date);
      if(!validTrialDate(date)||(!previous&&(!slot||weekdayIndex(date)!==slot.day||date<slot.repeatFrom)))fail('Пробное занятие не найдено',404);
      if((previous?.revision || 0)!==req.body?.revision)fail('Пробное изменилось в другом окне. Обновите окно перед сохранением ссылки.',409);
      let meetingUrl;
      try{meetingUrl=normalizeTrialMeetingUrl(req.body?.meetingUrl);}catch(error){fail(error.message);}
      if(previous||meetingUrl)store.putBooking({...previous,id:previous?.id || crypto.randomUUID(),teacherId,slotId,date,
        time:previous?.time || slot.time,durationMinutes:previous?.durationMinutes || slot.durationMinutes,
        studentIds:previous?.studentIds || [],studentNames:previous?.studentNames || [],
        meetingUrl,revision:(previous?.revision || 0)+1,updatedAt:new Date(now()).toISOString()});
      notify(teacherId);return view(teacherId);
    });
  }));
  const assertSlotsAvailable=async(teacherId,slots)=>{
      if(!Array.isArray(slots) || slots.length>4)fail('Можно закрепить до четырёх пробных слотов.');
      // Check the complete upcoming year plus weekly rules before reserving time.
      const entries=await getEntries(teacherId,true,addCalendarDays(moscowDay(now()),366));
      const today=moscowDay(now());
      // Expand only weekly rules. Large Google feeds already contain dated
      // occurrences and do not need a full-year scan once per occurrence.
      const candidates=entries.filter(entry=>!entry.trialReservation && !entry.trialBookingId);
      const upcoming=[...candidates.filter(entry=>entry.date>=today && active(entry)
        && !entry.excludedDates?.includes(entry.date) && !entry.cancelledDates?.includes(entry.date)),
      ...expandRescheduleOccurrences(candidates.filter(entry=>!entry.date),today,367).filter(entry=>entry.date>=today)];
      for(const slot of slots){
        const conflict=upcoming.find(entry=>active(entry) && weekdayIndex(entry.date)===Number(slot.day) && overlaps(entry,slot));
        if(conflict) fail(`В это время уже есть занятие: ${conflict.subject || conflict.studentName || 'событие'}, ${conflict.date} в ${conflict.time}. Сначала перенесите его.`,409);
      }
  };
  app.put('/api/trial-slots',route(req=>{
    const teacherId=access(req);
    return withTeacherCalendarLock(teacherId,async()=>{
      await assertSlotsAvailable(teacherId,req.body?.slots);access(req);
      store.setSlots(teacherId,req.body?.slots,req.body?.revision);notify(teacherId);return view(teacherId);
    });
  }));
  app.post('/api/trial-slots/:slotId/move',route(req=>{
    const teacherId=access(req);
    return withTeacherCalendarLock(teacherId,async()=>{
      const plan=store.configuration(teacherId),old=plan.slots.find(slot=>slot.id===req.params.slotId);
      if(!old)fail('Пробный слот не найден',404);
      const slots=plan.slots.map(slot=>slot.id===old.id?{...slot,day:req.body?.day,time:req.body?.time,durationMinutes:req.body?.durationMinutes}:slot);
      await assertSlotsAvailable(teacherId,slots);access(req);
      const before=new Map(store.bookings(teacherId).map(row=>[row.id,row]));
      store.setSlots(teacherId,slots,req.body?.revision,{moveBookings:true});
      for(const row of store.bookings(teacherId))if(row.revision!==before.get(row.id)?.revision)await sync(row);
      notify(teacherId);return view(teacherId);
    });
  }));
  app.post('/api/trial-slots/:slotId/:date/participants',route(req=>{
    const teacherId=access(req),{slotId,date}=req.params;
    return withTeacherCalendarLock(teacherId,async()=>{
      const slot=store.configuration(teacherId).slots.find(value=>value.id===slotId);
      if(!slot||!validTrialDate(date)||weekdayIndex(date)!==slot.day||date<slot.repeatFrom) fail('Пробный слот не найден',404);
      if(Date.parse(`${date}T${slot.time}:00+03:00`)<=now()) fail('Выберите будущее пробное занятие.');
      const previous=store.getBooking(teacherId,slotId,date),studentId=String(req.body?.studentId || '');
      const pupil=getStudent(studentId);
      if(!pupil || pupil.deletedAt || pupil.teacherId!==teacherId) fail('Выберите своего ученика.',403);
      if(previous?.studentIds.includes(studentId)) return view(teacherId);
      if((previous?.revision || 0)!==req.body?.revision) fail('Список участников изменился. Обновите слот.',409);
      if((previous?.studentIds.length || 0)>=30) fail('В пробном слоте уже 30 участников.');
      const entries=await getEntries(teacherId,true,date,{fromDay:date});access(req);
      if(getStudent(studentId)?.teacherId!==teacherId || getStudent(studentId)?.deletedAt) fail('Ученик больше не закреплён за вами.',409);
      const conflict=expandRescheduleOccurrences(entries,date,1).find(entry=>entry.date===date && !entry.trialReservation && (!previous || entry.trialBookingId!==previous.id) && overlaps(entry,slot));
      if(conflict) fail('В это время появилось другое событие. Проверьте календарь перед записью.',409);
      const row={...previous,id:previous?.id || crypto.randomUUID(),teacherId,slotId,date,time:slot.time,durationMinutes:slot.durationMinutes,
        studentIds:[...(previous?.studentIds || []),studentId],studentNames:[...(previous?.studentNames || []),pupil.name],
        revision:(previous?.revision || 0)+1,syncStatus:'pending',updatedAt:new Date(now()).toISOString()};
      await sync(store.putBooking(row));return view(teacherId);
    });
  }));
  app.delete('/api/trial-slots/:slotId/:date/participants/:studentId',route(req=>{
    const teacherId=access(req),{slotId,date,studentId}=req.params;
    return withTeacherCalendarLock(teacherId,async()=>{
      const previous=store.getBooking(teacherId,slotId,date);if(!previous) fail('Запись не найдена',404);
      if(previous.revision!==req.body?.revision) fail('Список участников изменился. Обновите слот.',409);
      if(Date.parse(`${date}T${previous.time}:00+03:00`)<=now()) fail('Прошедшее пробное остаётся в истории.');
      const keep=previous.studentIds.map((id,index)=>({id,name:previous.studentNames[index]})).filter(person=>person.id!==studentId);
      await sync(store.putBooking({...previous,previousStudentIds:[...new Set([...(previous.previousStudentIds || []),...previous.studentIds])],studentIds:keep.map(p=>p.id),studentNames:keep.map(p=>p.name),revision:previous.revision+1,syncStatus:'pending'}));
      return view(teacherId);
    });
  }));
  app.post('/api/trial-slots/:slotId/:date/sync',route(req=>{
    const teacherId=access(req);
    return withTeacherCalendarLock(teacherId,async()=>{
      const row=store.getBooking(teacherId,req.params.slotId,req.params.date);if(!row) fail('Запись не найдена',404);
      await sync(row);return view(teacherId);
    });
  }));
  return {retryPending:async()=>{
    for(const row of store.allBookings().filter(value=>value.syncStatus==='pending').slice(0,20)) await withTeacherCalendarLock(row.teacherId,async()=>{
      const current=store.getBooking(row.teacherId,row.slotId,row.date);if(current?.syncStatus==='pending') await sync(current);
    });
  }};
}
