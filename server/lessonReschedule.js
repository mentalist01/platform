import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withTeacherCalendarLock } from './calendarMutations.js';
import { addCalendarDays, moscowDay, weekdayIndex, AVAILABILITY_WEEKDAYS, clockTime } from '../src/utils/groupAvailability.js';
import { rescheduleWeek, lessonStart, lessonEnd } from '../src/utils/lessonReschedule.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const isTime = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const isGroup = e => !!(e.groupId || e.isLearningGroupEvent);
export const occurrenceKey = e => `${e.externalEventId || e.id}|${e.date}|${e.time}`;
const publicLesson = e => ({ key: occurrenceKey(e), date: e.date, time: e.time, durationMinutes: e.durationMinutes });
const overlaps = (a, b) => lessonStart(a) < lessonEnd(b) && lessonEnd(a) > lessonStart(b);

export function createRescheduleStore(file) {
  let db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return {
    all: () => structuredClone(Object.values(db)),
    get: id => db[id] ? structuredClone(db[id]) : null,
    put(row) {
      const next = { ...db, [row.id]: row };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file); db = next; return structuredClone(row);
    },
  };
}

export function expandRescheduleOccurrences(entries, from, days = 7) {
  const result = [];
  for (let n = -1; n < days; n++) {
    const date = addCalendarDays(from, n);
    for (const e of entries) {
      if (e.cancelled || e.isCancelled || ['cancelled', 'canceled'].includes(e.status) || e.excludedDates?.includes(date) || e.cancelledDates?.includes(date)) continue;
      if (e.date ? e.date !== date : e.weekdayKey !== AVAILABILITY_WEEKDAYS[weekdayIndex(date)]) continue;
      if (!isTime(e.time)) continue;
      result.push({ ...e, date, durationMinutes: Math.max(15, Number(e.durationMinutes) || 60) });
    }
  }
  return result;
}

// Google iCal feeds can lag behind a successful API write. Keep the accepted
// occurrence visible until the feed confirms it, then let future Google edits win.
export function overlayReschedules(entries, teacherId, store) {
  let result = entries;
  for (const row of store.all().filter(r => r.teacherId === teacherId && r.googleResult && !r.feedObserved)) {
    const uid = row.googleResult.iCalUID || row.source.externalEventId;
    const visible = result.find(e => e.externalEventId === uid && e.date === row.target.date && e.time === row.target.time);
    if (visible) { store.put({ ...row, feedObserved: true }); continue; }
    result = result.filter(e => !(e.externalEventId === row.source.externalEventId && e.date === row.source.date && e.time === row.source.time));
    result = [...result, { ...row.source, ...row.target, id: movedGoogleEntryId(row), externalEventId: uid,
      source: 'google-calendar', isGoogleCalendarSync: true, excludedDates: [],
      subject: row.source.externalEventId ? row.source.subject : row.studentName,
      startAt: new Date(lessonStart(row.target)).toISOString(), studentId: row.studentId, studentName: row.studentName }];
  }
  return result;
}

export const movedGoogleEntryId = row => `google-ical-${crypto.createHash('sha1').update(`${row.teacherId}:${row.googleResult.iCalUID || row.source.externalEventId}:${new Date(lessonStart(row.target)).toISOString()}`).digest('hex').slice(0,18)}`;

export function registerLessonReschedules(app, { store, getStudent, getEntries, googleMove, applyLocal, notify = () => {}, now = Date.now }) {
  const studentAccess = auth => {
    if (auth?.role !== 'student') fail('Нет доступа', 403);
    const student = getStudent(auth.id);
    if (!student || student.deletedAt || !student.teacherId) fail('Преподаватель не назначен', 403);
    return student;
  };
  const requestAccess = (auth, id) => {
    const row = store.get(id); if (!row) fail('Запрос не найден', 404);
    const student = getStudent(row.studentId);
    if (!student || student.deletedAt || student.teacherId !== row.teacherId) fail('Ученик больше не закреплён за преподавателем', 403);
    if (!(auth?.role === 'student' && auth.id === row.studentId) && !(auth?.role === 'teacher' && auth.id === row.teacherId)) fail('Нет доступа', 403);
    return row;
  };
  const serialize = row => ({ id: row.id, studentName: row.studentName, studentId: row.studentId, status: row.status,
    source: publicLesson(row.source), target: publicLesson(row.target), comment: row.comment, createdAt: row.createdAt, resolvedAt: row.resolvedAt,
    error: row.lastError || '', resolutionNote: row.resolutionNote || '' });
  const ownLessons = (entries, student) => {
    const all = expandRescheduleOccurrences(entries, moscowDay(now()), 85).filter(e => e.studentId === student.id && !isGroup(e) && lessonStart(e) > now());
    // Imported and manual copies at the same time describe one lesson. Prefer
    // Google's identity so approval updates the real event instead of duplicating it.
    return [...new Map(all.sort((a,b) => Number(!!a.externalEventId)-Number(!!b.externalEventId))
      .map(e => [`${e.date}|${e.time}`, e])).values()].sort((a,b) => lessonStart(a)-lessonStart(b));
  };
  const reservations = teacherId => store.all().filter(r => r.teacherId === teacherId && (r.status === 'applying' || (r.googleResult && !r.feedObserved)));
  const checkTarget = (target, source) => {
    if (!isDate(target?.date) || !isTime(target?.time) || target.date < moscowDay(now()) || target.date > addCalendarDays(rescheduleWeek(12, now()), 6)
      || ![0,30].includes(Number(target.time.slice(3))) || Number(target.time.slice(0,2)) < 8
      || Number(target.time.slice(0,2))*60 + Number(target.time.slice(3)) + source.durationMinutes > 1440
      || lessonStart(target) <= now() || lessonStart(target) === lessonStart(source)) fail('Выберите другое будущее время с 08:00 до 24:00');
  };
  const checkFree = (entries, source, target, teacherId, requestId, retry = false) => {
    const occupied = expandRescheduleOccurrences(entries, target.date, 1)
      .filter(e => !(e.studentId === source.studentId && !isGroup(e) && ((e.date === source.date && e.time === source.time)
        || (retry && source.externalEventId && e.externalEventId === source.externalEventId && e.date === target.date && e.time === target.time))));
    if (occupied.some(e => overlaps(e, target)) || reservations(teacherId).some(r => r.id !== requestId && overlaps(r.target, target))) fail('Это время уже занято. Выберите другой вариант.', 409);
  };
  const route = fn => async (req, res) => { res.setHeader('Cache-Control','no-store'); try { res.json(await fn(req)); } catch(e) { res.status(e.status || 503).json({error:e.status ? e.message : 'Не удалось проверить календарь или завершить перенос. Попробуйте ещё раз.'}); } };
  app.get('/api/lesson-reschedules', route(async req => {
    if (!['student','teacher'].includes(req.auth?.role)) fail('Нет доступа',403);
    return { requests: store.all().filter(r => req.auth.role === 'student' ? r.studentId === req.auth.id : r.teacherId === req.auth.id)
      .filter(r => { const s=getStudent(r.studentId); return s && !s.deletedAt && s.teacherId === r.teacherId; })
      .sort((a,b) => b.createdAt-a.createdAt).slice(0,100).map(serialize) };
  }));
  app.get('/api/lesson-reschedules/availability', route(async req => {
    const student = studentAccess(req.auth); const week = req.query.week || rescheduleWeek(1, now());
    if (!isDate(week) || weekdayIndex(week)!==0 || week < rescheduleWeek(0,now()) || week > rescheduleWeek(12,now())) fail('Выберите неделю в ближайшие три месяца');
    const entries=await getEntries(student.teacherId, true);
    if(studentAccess(req.auth).teacherId!==student.teacherId) fail('Преподаватель изменился',409);
    const lessons=ownLessons(entries, student); const source=lessons.find(e=>occurrenceKey(e)===req.query.lessonKey) || (!req.query.lessonKey ? lessons[0] : null);
    if (req.query.lessonKey && !source) fail('Занятие уже изменилось. Выберите его заново.',409);
    const occupied=expandRescheduleOccurrences(entries,week);
    const days=Array.from({length:7},(_,n)=>{const date=addCalendarDays(week,n); const slots=[];
      if(source) for(let m=480;m+source.durationMinutes<=1440;m+=30) {
        const target={date,time:clockTime(m),durationMinutes:source.durationMinutes};
        if(lessonStart(target)<=now() || lessonStart(target)===lessonStart(source)) continue;
        if(occupied.some(e=>overlaps(e,target) && !(e.studentId===source.studentId && e.date===source.date && e.time===source.time && !isGroup(e))) || reservations(student.teacherId).some(r=>overlaps(r.target,target))) continue;
        slots.push(target.time);
      }
      return {date,slots};
    });
    return {week,lessons:lessons.map(publicLesson),selectedKey:source?occurrenceKey(source):'',days};
  }));
  app.post('/api/lesson-reschedules', route(async req => {
    const student=studentAccess(req.auth);
    return withTeacherCalendarLock(student.teacherId,async()=>{
      const entries=await getEntries(student.teacherId,true); const fresh=studentAccess(req.auth);
      if(fresh.teacherId!==student.teacherId) fail('Преподаватель изменился',409);
      const source=ownLessons(entries,student).find(e=>occurrenceKey(e)===req.body?.lessonKey); if(!source) fail('Занятие уже изменилось. Выберите его заново.',409);
      const target={date:req.body?.date,time:req.body?.time,durationMinutes:source.durationMinutes}; checkTarget(target,source); checkFree(entries,source,target,student.teacherId);
      const existing=store.all().find(r=>r.studentId===student.id && occurrenceKey(r.source)===occurrenceKey(source) && ['pending','applying'].includes(r.status));
      if(existing) fail('Для этого занятия уже отправлен запрос. Сначала отмените его или дождитесь ответа.',409);
      const row=store.put({id:crypto.randomUUID(),teacherId:student.teacherId,studentId:student.id,studentName:student.name||'Ученик',source,target,
        status:'pending',comment:String(req.body.comment||'').trim().slice(0,400),createdAt:now()});
      notify(row,'created');return serialize(row);
    });
  }));
  app.get('/api/lesson-reschedules/:id/preview', route(async req => {
    const row=requestAccess(req.auth,req.params.id); if(req.auth.role!=='teacher')fail('Нет доступа',403);
    const entries=await getEntries(row.teacherId,true); requestAccess(req.auth,row.id);
    const days=[...new Set([row.source.date,row.target.date])];
    const busy=days.flatMap(date=>expandRescheduleOccurrences(entries,date,1).filter(e=>e.date===date).map(e=>({date:e.date,time:e.time,durationMinutes:e.durationMinutes,
      source:e.studentId===row.studentId&&e.date===row.source.date&&e.time===row.source.time})));
    let conflict=''; try{if(row.status==='pending'){checkTarget(row.target,row.source);checkFree(entries,row.source,row.target,row.teacherId,row.id);}}catch(e){conflict=e.message;}
    return {request:serialize(row),busy,conflict};
  }));
  app.post('/api/lesson-reschedules/:id/:action', route(async req => {
    const first=requestAccess(req.auth,req.params.id); const action=req.params.action;
    if(!['approve','reject','cancel'].includes(action)) fail('Неизвестное действие');
    if(action==='cancel' ? req.auth.role!=='student' : req.auth.role!=='teacher') fail('Нет доступа',403);
    return withTeacherCalendarLock(first.teacherId,async()=>{
      let row=requestAccess(req.auth,first.id);
      if(row.status==='approved'&&action==='approve')return serialize(row);
      if(!['pending','applying'].includes(row.status))fail('Запрос уже обработан',409);
      if(action!=='approve'){
        if(row.status==='applying')fail('Перенос уже начат. Сначала завершите синхронизацию.',409);
        row=store.put({...row,status:action==='cancel'?'cancelled':'rejected',resolvedAt:now(),resolutionNote:String(req.body?.note||'').trim().slice(0,400)});
      }else{
        if(row.status==='applying' && !row.googleResult){
          // Recover a committed Google write before consulting the feed: it may
          // already contain the moved lesson, including a newly created UID.
          const recovered=await googleMove(row,{recoverOnly:true});
          requestAccess(req.auth,row.id);
          if(recovered) row=store.put({...row,googleResult:recovered});
        }
        if(!row.googleResult){
          const entries=await getEntries(row.teacherId,true); requestAccess(req.auth,row.id);
          if(row.status==='pending' && !ownLessons(entries,getStudent(row.studentId)).some(e=>occurrenceKey(e)===occurrenceKey(row.source)&&e.durationMinutes===row.source.durationMinutes))fail('Исходное занятие изменилось. Отклоните запрос и попросите выбрать заново.',409);
          checkTarget(row.target,row.source);checkFree(entries,row.source,row.target,row.teacherId,row.id,row.status==='applying');
          row=store.put({...row,status:'applying',lastError:''});
          try { row=store.put({...row,googleResult:await googleMove(row)}); }
          catch(e){store.put({...row,status:e.definite?'pending':'applying',lastError:'Не удалось завершить перенос в Google. Проверьте подключение и повторите подтверждение.'});throw e;}
        }
        await applyLocal(row); // Idempotent after a restart or a lost HTTP response.
        row=store.put({...row,status:'approved',resolvedAt:now(),lastError:'',resolutionNote:String(req.body?.note||'').trim().slice(0,400)});
      }
      notify(row,row.status);return serialize(row);
    });
  }));
}
