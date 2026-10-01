import {LearningGroupDomainError} from './learningGroups.js';
import {isGroupLessonAssigned, normalizeParticipationPlans, participationDay, participationOccurrence} from '../src/utils/groupParticipation.js';

const invalid = (message, statusCode = 400) => {throw new LearningGroupDomainError(message, {code:'invalid_participation', statusCode});};
export function participationSlots(group, lessons) {
  return [...new Set([...(group.schedule || []), ...lessons.filter(l => l.groupId === group.id && l.status !== 'cancelled')]
    .map(l => participationOccurrence(l).slot).filter(s => /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\|([01]\d|2[0-3]):[0-5]\d$/.test(s)))].sort();
}
export function registerGroupParticipation(app, {handle, manageGroup, lessons, saveGroup, saveLesson, payment, notify}) {
  const member = (group, id) => {
    const value = group.members.find(m => m.studentId === id && m.status === 'active');
    if (!value) invalid('Ученик не состоит в группе', 404);
    return value;
  };
  const plan = (group, body, future = false) => {
    const from = body.from || participationDay(Date.now());
    const date = new Date(`${from}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== from) invalid('Выберите корректную дату');
    if (future && from < participationDay(Date.now())) invalid('План действует с сегодняшнего дня или позже. Прошлые начисления исправляются отдельно.');
    if (!['all','selected'].includes(body.mode)) invalid('Выберите все занятия или выбранные занятия');
    const slots = [...new Set(Array.isArray(body.slots) ? body.slots : [])];
    const available = participationSlots(group, lessons());
    if (body.mode === 'selected' && (!slots.length || slots.some(s => !available.includes(s)))) invalid('Выберите хотя бы одно занятие из расписания группы');
    return {from, mode:body.mode, slots:body.mode === 'all' ? [] : slots};
  };
  const base = '/api/learning-groups/:groupId';
  app.get(`${base}/participation`, handle((req,res) => {
    const group = manageGroup(req,res,req.params.groupId); if (!group) return;
    res.set('Cache-Control','no-store').json({slots:participationSlots(group,lessons())});
  }));
  app.put(`${base}/members/:studentId/participation`, handle((req,res) => {
    const group = manageGroup(req,res,req.params.groupId); if (!group) return;
    if (group.status === 'completed') invalid('Группа завершена',409);
    const current = member(group,req.params.studentId);
    const next = {...plan(group, req.body || {}, true), updatedAt:new Date().toISOString(),updatedById:req.auth.id};
    next.effectiveAt = next.from === participationDay(Date.now()) ? next.updatedAt : `${next.from}T00:00:00+03:00`;
    const updated = {...group, members:group.members.map(m => m.studentId === current.studentId ? {...m,
      participationPlans:normalizeParticipationPlans([...(m.participationPlans || []).filter(p=>p.from!==next.from || Date.parse(p.effectiveAt || `${p.from}T00:00:00+03:00`)<=Date.now()),next])} : m),updatedAt:next.updatedAt};
    saveGroup(updated); notify(updated);
    res.json({member:updated.members.find(m=>m.studentId===current.studentId)});
  }));
  app.post(`${base}/members/:studentId/participation/review`, handle(async (req,res) => {
    const group = manageGroup(req,res,req.params.groupId); if (!group) return;
    const current = member(group,req.params.studentId);
    const proposed = {...plan(group,req.body || {}),from:'0000-01-01'};
    const preview = {...group,members:group.members.map(m=>m.studentId===current.studentId?{...m,participationPlans:[proposed]}:m)};
    const candidates = lessons().filter(l => l.groupId===group.id && l.participantIds.includes(current.studentId)
      && l.status!=='cancelled' && Date.parse(l.startAt)+l.durationMinutes*60000<Date.now()
      && isGroupLessonAssigned(group,current.studentId,l)
      && !isGroupLessonAssigned(preview,current.studentId,{...l,participationOverrides:{}}));
    const states = await Promise.all(candidates.map(l=>payment(group,current.studentId,l)));
    const rows = candidates.filter((_l,index)=>states[index]?.status==='unpaid')
      .map(l=>({id:l.id,startAt:l.startAt,topic:l.topic,amount:group.pricePerLesson}));
    res.set('Cache-Control','no-store').json({lessons:rows});
  }));
  app.put(`${base}/lessons/:lessonId/participation`, handle(async (req,res) => {
    const group = manageGroup(req,res,req.params.groupId); if (!group) return;
    if (group.status === 'completed') invalid('Группа завершена',409);
    const lesson = lessons().find(l=>l.id===req.params.lessonId && l.groupId===group.id);
    const studentId = String(req.body?.studentId || '');
    if (!lesson || !lesson.participantIds.includes(studentId)) invalid('Ученик не является участником этого занятия',404);
    const assigned = req.body?.assigned;
    if (assigned !== null && typeof assigned !== 'boolean') invalid('Выберите участие в занятии');
    const participationOverrides = {...lesson.participationOverrides};
    if (assigned === null) delete participationOverrides[studentId]; else participationOverrides[studentId]=assigned;
    if (!isGroupLessonAssigned(group,studentId,{...lesson,participationOverrides}) && (await payment(group,studentId,lesson)).paid) invalid('Урок уже оплачен. Сначала отдельно согласуйте возврат или перенос оплаты.',409);
    const latest = lessons().find(l=>l.id===lesson.id && l.groupId===group.id);
    if (!latest || !latest.participantIds.includes(studentId)) invalid('Участник занятия изменился. Обновите страницу.',409);
    const latestOverrides = {...latest.participationOverrides};
    if (assigned === null) delete latestOverrides[studentId]; else latestOverrides[studentId]=assigned;
    const updated = {...latest,participationOverrides:latestOverrides,updatedAt:new Date().toISOString()};
    saveLesson(updated); notify(group);
    res.json({lesson:updated});
  }));
}
