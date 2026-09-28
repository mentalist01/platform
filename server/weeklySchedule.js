import crypto from 'node:crypto';
import { withTeacherCalendarLock } from './calendarMutations.js';
import { availabilityConfig, busySlots } from './groupAvailability.js';
import { availabilitySlots, addCalendarDays, moscowDay, AVAILABILITY_WEEKDAYS, AVAILABILITY_DAY_NAMES } from '../src/utils/groupAvailability.js';
import { lessonStart } from '../src/utils/lessonReschedule.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const managed = entry => entry.source === 'weekly-request' && !entry.date;
export const weeklyScheduleSignature = entries => JSON.stringify(entries.filter(managed).map(e => ({
  id: e.id, weekdayKey: e.weekdayKey, time: e.time, durationMinutes: e.durationMinutes,
  repeatFrom: e.repeatFrom, repeatUntil: e.repeatUntil, excludedDates: e.excludedDates,
})).sort((a, b) => a.id.localeCompare(b.id)));

export function applyWeeklySchedule(schedule, row, now = Date.now()) {
  const existing = schedule.filter(e => e.weeklyRequestId === row.id && managed(e));
  if (existing.length === row.slots.length) return schedule; // Retry after a committed write.
  if (weeklyScheduleSignature(schedule) !== row.baseSignature) fail('Расписание уже изменилось. Попросите ученика выбрать время заново.', 409);
  const until = addCalendarDays(row.config.startDate, -1);
  const result = schedule.map(e => managed(e) && (!e.repeatUntil || e.repeatUntil > until) ? { ...e, repeatUntil: until } : e);
  for (const slot of availabilitySlots(row.config).filter(s => row.slots.includes(s.id))) {
    result.push({ id: `weekly-${row.id}-${slot.id}`, weeklyRequestId: row.id, source: 'weekly-request',
      date: null, repeatFrom: row.config.startDate, repeatUntil: '', weekdayKey: AVAILABILITY_WEEKDAYS[slot.day],
      weekdayOrder: slot.day + 1, day: AVAILABILITY_DAY_NAMES[slot.day], time: slot.time,
      durationMinutes: row.config.durationMinutes, subject: 'Индивидуальное занятие', excludedDates: [],
      createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), createdByRole: 'teacher', createdById: row.teacherId });
  }
  return result;
}

export function weeklyReservations(store, teacherId) {
  return store.all().filter(r => r.teacherId === teacherId && r.status === 'applying').flatMap(row =>
    availabilitySlots(row.config).filter(s => row.slots.includes(s.id)).map(s => ({
      source: 'weekly-request-reservation', weeklyRequestId: row.id, studentId: row.studentId,
      weekdayKey: AVAILABILITY_WEEKDAYS[s.day], time: s.time, durationMinutes: row.config.durationMinutes, repeatFrom: row.config.startDate,
    })));
}

export function registerWeeklySchedules(app, { store, getStudent, getSchedule, getEntries, applyLocal, notify = () => {}, now = Date.now }) {
  const studentAccess = auth => {
    if (auth?.role !== 'student') fail('Нет доступа', 403);
    const s = getStudent(auth.id);
    if (!s || s.deletedAt || !s.teacherId) fail('Преподаватель не назначен', 403);
    return { ...s };
  };
  const access = (auth, id) => {
    const row = store.get(id); if (!row) fail('Запрос не найден', 404);
    const s = getStudent(row.studentId);
    if (!s || s.deletedAt || s.teacherId !== row.teacherId) fail('Ученик больше не закреплён за преподавателем', 403);
    if (!(auth?.role === 'student' && auth.id === s.id) && !(auth?.role === 'teacher' && auth.id === row.teacherId)) fail('Нет доступа', 403);
    return row;
  };
  const serialize = row => ({ id: row.id, kind: 'weekly', studentId: row.studentId,
    studentName: getStudent(row.studentId)?.name || 'Ученик', config: row.config, slots: row.slots,
    status: row.status, comment: row.comment, createdAt: row.createdAt, resolvedAt: row.resolvedAt, resolutionNote: row.resolutionNote || '' });
  const configFor = body => availabilityConfig({ startDate: body?.startDate ?? addCalendarDays(moscowDay(now()), 1),
    durationMinutes: body?.durationMinutes ?? 60, startMinute: 480, endMinute: 1440, days: [0,1,2,3,4,5,6] }, now());
  const validateSlots = (config, slots) => {
    if (!Array.isArray(slots) || !slots.length || slots.length > 7 || new Set(slots).size !== slots.length) fail('Выберите от одного до семи занятий');
    const allowed = availabilitySlots(config);
    if (slots.some(id => !allowed.some(s => s.id === id)) || new Set(slots.map(id => allowed.find(s => s.id === id).day)).size !== slots.length) fail('Выберите занятия в разные дни недели');
  };
  const filteredEntries = (entries, studentId, requestId) => entries.filter(e => !(e.studentId === studentId && managed(e)) && !(requestId && e.weeklyRequestId === requestId));
  const check = (row, entries) => {
    if (row.config.startDate < moscowDay(now())) fail('Дата начала уже прошла. Отмените запрос и выберите новую дату.', 409);
    for (const s of availabilitySlots(row.config).filter(s => row.slots.includes(s.id))) {
      const weekday = (new Date(`${row.config.startDate}T12:00:00Z`).getUTCDay() + 6) % 7;
      const date = addCalendarDays(row.config.startDate, (s.day - weekday + 7) % 7);
      if (lessonStart({date,time:s.time}) <= now()) fail('Первое занятие уже началось. Выберите новую дату начала.', 409);
    }
    const blocked = busySlots(row.config, filteredEntries(entries, row.studentId, row.id), now());
    if (row.slots.some(id => blocked[id])) fail('Выбранное время уже занято в ближайшие восемь недель. Попросите выбрать другой вариант.', 409);
    if (weeklyScheduleSignature(getSchedule(row.studentId)) !== row.baseSignature
      && !getSchedule(row.studentId).some(e => e.weeklyRequestId === row.id)) fail('Расписание уже изменилось. Попросите ученика выбрать время заново.', 409);
  };
  const route = fn => async (req, res) => { res.setHeader('Cache-Control', 'no-store'); try { res.json(await fn(req)); }
    catch (e) { res.status(e.status || 503).json({ error: e.status ? e.message : 'Не удалось проверить или сохранить расписание. Попробуйте ещё раз.' }); } };
  app.get('/api/weekly-schedules', route(async req => {
    if (!['student', 'teacher'].includes(req.auth?.role)) fail('Нет доступа', 403);
    return { requests: store.all().filter(r => req.auth.role === 'student' ? r.studentId === req.auth.id : r.teacherId === req.auth.id)
      .filter(r => { const s = getStudent(r.studentId); return s && !s.deletedAt && s.teacherId === r.teacherId; })
      .sort((a,b) => b.createdAt - a.createdAt).slice(0,100).map(serialize) };
  }));
  app.get('/api/weekly-schedules/availability', route(async req => {
    const student = studentAccess(req.auth); const config = configFor(req.query);
    const entries = await getEntries(student.teacherId, true, addCalendarDays(config.startDate, 56));
    if (studentAccess(req.auth).teacherId !== student.teacherId) fail('Преподаватель изменился', 409);
    return { config, blocked: busySlots(config, filteredEntries(entries, student.id), now()),
      baseSignature: weeklyScheduleSignature(getSchedule(student.id)) };
  }));
  app.post('/api/weekly-schedules', route(async req => {
    const student = studentAccess(req.auth);
    return withTeacherCalendarLock(student.teacherId, async () => {
      if (store.all().some(r => r.studentId === student.id && ['pending','applying'].includes(r.status))) fail('Запрос уже отправлен. Дождитесь ответа или отмените его.', 409);
      const config = configFor(req.body); const slots = req.body?.slots; validateSlots(config, slots);
      const entries = await getEntries(student.teacherId, true, addCalendarDays(config.startDate, 56));
      if (studentAccess(req.auth).teacherId !== student.teacherId) fail('Преподаватель изменился', 409);
      const row = { id: crypto.randomUUID(), teacherId: student.teacherId, studentId: student.id, studentName: student.name || 'Ученик',
        config, slots, baseSignature: req.body?.baseSignature, status: 'pending', comment: String(req.body?.comment || '').trim().slice(0,400), createdAt: now() };
      check(row, entries); store.put(row); notify(row, 'created'); return serialize(row);
    });
  }));
  app.get('/api/weekly-schedules/:id/preview', route(async req => {
    const row = access(req.auth, req.params.id); if (req.auth.role !== 'teacher') fail('Нет доступа', 403);
    let conflict = '';
    if (row.status === 'pending') {
      const entries = await getEntries(row.teacherId, true, addCalendarDays(row.config.startDate, 56)); access(req.auth, row.id);
      try { check(row, entries); } catch (e) { conflict = e.message; }
    }
    return { request: serialize(row), conflict };
  }));
  app.post('/api/weekly-schedules/:id/:action', route(async req => {
    const first = access(req.auth, req.params.id); const action = req.params.action;
    if (!['approve','reject','cancel'].includes(action)) fail('Неизвестное действие');
    if (req.auth.role !== (action === 'cancel' ? 'student' : 'teacher')) fail('Нет доступа', 403);
    return withTeacherCalendarLock(first.teacherId, async () => {
      let row = access(req.auth, first.id);
      if (row.status === 'approved' && action === 'approve') return serialize(row);
      if (!['pending','applying'].includes(row.status)) fail('Запрос уже обработан', 409);
      if (action === 'approve') {
        if (!getSchedule(row.studentId).some(e => e.weeklyRequestId === row.id)) {
          const entries = await getEntries(row.teacherId, true, addCalendarDays(row.config.startDate, 56)); access(req.auth, row.id); check(row, entries);
          row = store.put({ ...row, status: 'applying' });
        }
        // Synchronous, idempotent local write; no remote calendar mutation is required.
        applyLocal(row);
      } else if (row.status === 'applying') fail('Подтверждение уже начато. Учителю нужно завершить его.', 409);
      row = store.put({ ...row, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled',
        resolvedAt: now(), resolutionNote: String(req.body?.note || '').trim().slice(0,400) });
      notify(row, row.status); return serialize(row);
    });
  }));
}
