import crypto from 'node:crypto';
import { availabilitySlots, AVAILABILITY_WEEKDAYS, addCalendarDays, moscowDay, weekdayIndex } from '../src/utils/groupAvailability.js';
import { busySlots, groupAvailabilityBusyEntries } from './groupAvailability.js';

export const placementConfig = durationMinutes => ({ durationMinutes: Number(durationMinutes), startMinute: 0, endMinute: 1380,
  days: [0, 1, 2, 3, 4, 5, 6], startDate: addCalendarDays(moscowDay(), 1), weeks: 8, timezone: 'Europe/Moscow' });
const durations = [30, 45, 60, 90, 120];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const revision = record => crypto.createHash('sha256').update(JSON.stringify(record.slots)).digest('hex');
const minuteOf = time => /^\d{2}:\d{2}$/.test(time || '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
const choiceAt = (record, id) => record?.slots?.[id]?.choice || 'pending';
const slotFrom = (day, minutes, durationMinutes) => ({ id: `${day}-${minutes}`, day, minutes, durationMinutes,
  time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  end: `${String(Math.floor((minutes + durationMinutes) / 60)).padStart(2, '0')}:${String((minutes + durationMinutes) % 60).padStart(2, '0')}` });

export function rankPlacementGroups({ groups, polls, records, studentId, entries = [], calendarError = false, now = Date.now() }) {
  const result = [];
  for (const group of groups.filter(group => !group.deletedAt && group.status !== 'completed')) {
    const members = group.members.filter(member => member.status === 'active');
    const poll = polls[group.id];
    const base = { id: group.id, name: group.name, memberCount: members.length, status: group.status,
      alreadyMember: members.some(member => member.studentId === studentId), slots: [], matchedCount: 0, totalCount: 0,
      availableDays: 0, pendingMembers: 0, calendarUnverified: calendarError };
    let fixed = [];
    if (poll?.plan) fixed = availabilitySlots(poll.plan.config).filter(slot => poll.plan.slots.includes(slot.id))
      .map(slot => ({ ...slot, durationMinutes: poll.plan.config.durationMinutes }));
    else if (group.schedule?.length) fixed = group.schedule.filter(entry => (!entry.date || entry.date >= moscowDay(now))
      && !entry.cancelled && !entry.isCancelled && !['cancelled', 'canceled', 'completed'].includes(entry.status))
      .map(entry => slotFrom(entry.date ? weekdayIndex(entry.date) : AVAILABILITY_WEEKDAYS.indexOf(entry.weekdayKey), minuteOf(entry.time), entry.durationMinutes || 60));
    if (!fixed.length) fixed = entries.filter(entry => entry.groupId === group.id && !entry.learningGroupMatchAmbiguous
      && (!entry.teacherId || entry.teacherId === group.teacherId) && entry.date >= moscowDay(now) && entry.date <= addCalendarDays(moscowDay(now), 56)
      && !entry.cancelled && !entry.isCancelled && !['cancelled', 'canceled', 'completed'].includes(entry.status))
      .map(entry => slotFrom(weekdayIndex(entry.date), minuteOf(entry.time), entry.durationMinutes || 60));
    fixed = [...new Map(fixed.filter(slot => slot.day >= 0 && slot.day <= 6 && Number.isFinite(slot.minutes))
      .map(slot => [`${slot.id}-${slot.durationMinutes}`, slot])).values()];
    if (fixed.length) {
      base.mode = 'schedule'; base.totalCount = fixed.length;
      base.slots = fixed.map(slot => ({ ...slot, choice: choiceAt(records[slot.durationMinutes], slot.id) }));
      base.matchedCount = base.slots.filter(slot => ['yes', 'maybe'].includes(slot.choice)).length;
      base.availableDays = new Set(base.slots.filter(slot => ['yes', 'maybe'].includes(slot.choice)).map(slot => slot.day)).size;
      base.fit = base.slots.some(slot => slot.choice === 'no') ? 'conflict'
        : base.slots.some(slot => slot.choice === 'pending') ? 'unanswered'
          : base.slots.some(slot => slot.choice === 'maybe') ? 'flexible' : 'exact';
    } else if (poll?.config && poll.status === 'open') {
      base.mode = 'forming';
      const peers = members.filter(member => member.studentId !== studentId);
      const blocked = calendarError ? {} : busySlots(poll.config, groupAvailabilityBusyEntries(group, entries), now);
      const candidates = availabilitySlots(poll.config).map(slot => {
        const choice = choiceAt(records[poll.config.durationMinutes], slot.id);
        const answers = peers.map(peer => poll.answers?.[peer.studentId]?.choices?.[slot.id] || (poll.answers?.[peer.studentId] ? 'no' : 'pending'));
        return { ...slot, durationMinutes: poll.config.durationMinutes, choice, pending: answers.filter(answer => answer === 'pending').length,
          flexible: choice === 'maybe' || answers.includes('maybe'), rejected: answers.includes('no'), blocked: !!blocked[slot.id] };
      }).filter(slot => ['yes', 'maybe'].includes(slot.choice) && !slot.rejected && !slot.blocked);
      const confirmed = candidates.filter(slot => !slot.pending);
      const exact = confirmed.filter(slot => !slot.flexible);
      base.pendingMembers = peers.filter(peer => !poll.answers?.[peer.studentId]).length;
      base.availableDays = new Set(confirmed.map(slot => slot.day)).size;
      const exactDays = new Set(exact.map(slot => slot.day)).size;
      const unknown = availabilitySlots(poll.config).some(slot => choiceAt(records[poll.config.durationMinutes], slot.id) === 'pending');
      base.fit = calendarError ? 'unverified' : exactDays >= 2 ? 'exact' : base.availableDays >= 2 ? 'flexible'
        : new Set(candidates.map(slot => slot.day)).size >= 2 ? 'waiting' : candidates.length ? 'partial' : unknown ? 'unanswered' : 'conflict';
      const ordered = candidates.sort((a, b) => a.pending - b.pending || Number(a.flexible) - Number(b.flexible) || a.day - b.day || a.minutes - b.minutes);
      const byDay = new Map();
      for (const slot of ordered) if (!byDay.has(slot.day)) byDay.set(slot.day, slot);
      const firstPerDay = [...byDay.values()];
      base.slots = [...firstPerDay, ...ordered.filter(slot => !firstPerDay.includes(slot))].slice(0, 8);
      base.totalCount = 2; base.matchedCount = Math.min(2, base.availableDays);
    } else { base.mode = 'unknown'; base.fit = 'no-schedule'; }
    if (base.alreadyMember) base.fit = 'member';
    result.push(base);
  }
  const score = { exact: 0, flexible: 1, waiting: 2, partial: 3, unanswered: 4, unverified: 5, 'no-schedule': 6, conflict: 7, member: 8 };
  return result.sort((a, b) => score[a.fit] - score[b.fit] || b.matchedCount - a.matchedCount || b.availableDays - a.availableDays || a.memberCount - b.memberCount || a.name.localeCompare(b.name, 'ru'));
}

export function registerGroupPlacement(app, deps) {
  const { store, getStudent, groups, polls, getEntries } = deps;
  const access = (auth, id, teacherOnly = false) => {
    if (!auth || !['teacher', 'student'].includes(auth.role) || teacherOnly && auth.role !== 'teacher') fail('Нет доступа', 403);
    const student = getStudent(id);
    if (!student || student.deletedAt) fail('Ученик не найден', 404);
    if (auth.role === 'teacher' ? student.teacherId !== auth.id : student.id !== auth.id) fail('Нет доступа', 403);
    if (!student.teacherId) fail('У ученика пока нет преподавателя', 409);
    return student;
  };
  const snapshot = (student, duration) => {
    if (!durations.includes(Number(duration))) fail('Выберите длительность занятия');
    const config = placementConfig(duration);
    const record = store.record({ teacherId: student.teacherId, studentId: student.id, durationMinutes: duration });
    const allowed = new Set(availabilitySlots(config).map(slot => slot.id));
    return { config, revision: revision(record), answer: Object.keys(record.slots).length ? {
      choices: Object.fromEntries(Object.entries(record.slots).filter(([id,slot]) => allowed.has(id) && slot.choice !== 'no').map(([id,slot]) => [id,slot.choice])),
      updatedAt: Math.max(...Object.values(record.slots).map(slot => slot.updatedAt)) } : null };
  };
  const route = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await fn(req)); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Не удалось сохранить или проверить свободное время. Попробуйте ещё раз.' }); }
  };
  app.get('/api/student-availability', route(req => {
    if (req.auth?.role !== 'student') fail('Нет доступа', 403);
    return snapshot(access(req.auth, req.auth.id), req.query.durationMinutes || 60);
  }));
  app.post('/api/student-availability/answer', route(req => {
    if (req.auth?.role !== 'student') fail('Только ученик может изменить свои отметки', 403);
    const student = access(req.auth, req.auth.id);
    const current = snapshot(student, req.body?.durationMinutes || 60);
    if (req.body?.revision !== current.revision) fail('Отметки изменились в другой вкладке или группе. Обновите анкету перед сохранением.', 409);
    const choices = req.body?.choices;
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) fail('Проверьте выбранное время');
    const allowed = new Set(availabilitySlots(current.config).map(slot => slot.id));
    if (Object.entries(choices).some(([id,choice]) => !allowed.has(id) || !['yes','maybe'].includes(choice))) fail('Проверьте выбранное время');
    store.remember({ teacherId: student.teacherId, studentId: student.id, config: current.config,
      answer: { choices, updatedAt: Math.max(Date.now(), (current.answer?.updatedAt || 0) + 1) }, sourceRoundId: 'personal' });
    deps.notify?.(student);
    return snapshot(student, current.config.durationMinutes);
  }));
  app.get('/api/students/:studentId/group-placement', route(async req => {
    const student = access(req.auth, req.params.studentId, true);
    let entries = [], calendarError = false;
    const ownPolls = polls();
    const starts = groups().filter(group => group.teacherId === student.teacherId && !group.deletedAt && group.status !== 'completed')
      .flatMap(group => [ownPolls[group.id]?.config?.startDate, ownPolls[group.id]?.plan?.config?.startDate]).filter(Boolean);
    const from = [moscowDay(), ...starts].sort().at(-1);
    try { entries = await getEntries(student.teacherId, addCalendarDays(from, 56)); }
    catch { calendarError = true; }
    const fresh = access(req.auth, student.id, true);
    if (fresh.teacherId !== student.teacherId) fail('Преподаватель изменился. Обновите страницу.', 409);
    const records = Object.fromEntries(durations.map(durationMinutes => [durationMinutes,
      store.record({ teacherId: fresh.teacherId, studentId: fresh.id, durationMinutes })]));
    const answers = durations.map(duration => ({ durationMinutes: duration, ...snapshot(fresh, duration) }));
    return { student: { id: fresh.id, name: fresh.name, nickname: fresh.nickname || '' }, answers, calendarError,
      groups: rankPlacementGroups({ groups: groups().filter(group => group.teacherId === fresh.teacherId), polls: polls(), records, studentId: fresh.id, entries, calendarError }) };
  }));
}
