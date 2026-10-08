import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isScheduleEntryInDateRange } from '../src/utils/scheduleDateRange.js';
import { calendarMutationLocks } from './calendarMutations.js';
import { availabilitySlots, addCalendarDays, moscowDay, weekdayIndex, AVAILABILITY_WEEKDAYS, AVAILABILITY_END_MINUTE } from '../src/utils/groupAvailability.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, limit = 400) => String(value ?? '').trim().slice(0, limit);
const membersOf = group => group.members.filter(m => m.status === 'active').map(m => m.studentId);
export function availabilityConfig(value, now = Date.now()) {
  const startDate = value?.startDate;
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(`${startDate}T00:00:00Z`))
    || new Date(`${startDate}T00:00:00Z`).toISOString().slice(0, 10) !== startDate || startDate < moscowDay(now) || startDate > addCalendarDays(moscowDay(now), 90)) fail('Выберите дату начала в ближайшие 90 дней');
  const durationMinutes = Number(value.durationMinutes);
  const startMinute = Number(value.startMinute); const endMinute = Number(value.endMinute);
  const days = [...new Set(Array.isArray(value.days) ? value.days : [])];
  if (![30, 45, 60, 90, 120].includes(durationMinutes) || !Number.isInteger(startMinute) || !Number.isInteger(endMinute)
    || startMinute < 0 || endMinute > AVAILABILITY_END_MINUTE || startMinute % 30 || endMinute % 30 || endMinute - startMinute < durationMinutes
    || days.length < 2 || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) fail('Проверьте длительность, рабочие часы и выберите хотя бы два дня');
  return { startDate, durationMinutes, startMinute, endMinute, days, weeks: 8, timezone: 'Europe/Moscow' };
}
const minuteOf = time => { const m = /^(\d{1,2}):(\d{2})$/.exec(time || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
// A poll can remain open for several days. Past occurrences are not conflicts
// with the future weekly plan; continue checking a full eight-week horizon.
export function currentAvailabilityConfig(config, now = Date.now()) {
  const today = moscowDay(now);
  return { ...config, startDate: config.startDate < today ? addCalendarDays(today, 1) : config.startDate };
}
export function busySlots(config, entries, now = Date.now()) {
  config = currentAvailabilityConfig(config, now);
  const busy = [];
  // Include the previous day, so a lesson crossing midnight blocks its tail.
  for (let offset = -1; offset < config.weeks * 7; offset++) {
    const date = addCalendarDays(config.startDate, offset); const day = weekdayIndex(date);
    for (const entry of entries) {
      if (entry.cancelled || entry.isCancelled || ['cancelled', 'canceled'].includes(entry.status)
        || entry.excludedDates?.includes(date) || entry.cancelledDates?.includes(date)) continue;
      if (entry.date ? entry.date !== date : entry.weekdayKey !== AVAILABILITY_WEEKDAYS[day]) continue;
      if (!isScheduleEntryInDateRange(entry, date)) continue;
      const minutes = minuteOf(entry.time);
      if (!Number.isFinite(minutes)) continue;
      const start = Date.parse(`${date}T00:00:00+03:00`) + minutes * 60000;
      busy.push({ start, end: start + (Number(entry.durationMinutes) || 60) * 60000, date });
    }
  }
  const blocked = {};
  for (const slot of availabilitySlots(config)) {
    const dates = [];
    for (let offset = 0; offset < config.weeks * 7; offset++) {
      const date = addCalendarDays(config.startDate, offset);
      if (weekdayIndex(date) !== slot.day) continue;
      const start = Date.parse(`${date}T${slot.time}:00+03:00`); const end = start + config.durationMinutes * 60000;
      if (start > now && busy.some(b => start < b.end && end > b.start)) dates.push(date);
    }
    if (dates.length) blocked[slot.id] = dates;
  }
  return blocked;
}

// Group identity comes from the server's calendar importer, never from a
// matching title, participant list or coincident start time.
export function groupAvailabilityBusyEntries(group, entries) {
  if (!group?.id) return entries;
  return entries.filter(entry => entry.groupId !== group.id || entry.learningGroupMatchAmbiguous
    || (entry.teacherId && entry.teacherId !== group.teacherId));
}

export function createAvailabilityStore(file) {
  // A single file atomically commits the approved plan and the discussion.
  // Lesson instances are idempotently derived from that durable plan.
  let db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return {
    get: id => db[id] ? structuredClone(db[id]) : null,
    all: () => structuredClone(db),
    acceptCommitted: value => { db = structuredClone(value); },
    polls: () => Object.entries(db).map(([groupId, poll]) => ({ groupId, ...structuredClone(poll) })),
    plans: () => Object.entries(db).filter(([, p]) => p.plan).map(([groupId, p]) => ({ groupId, ...structuredClone(p.plan) })),
    put(id, value) {
      const next = { ...db, [id]: value }; fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 }); fs.renameSync(tmp, file); db = next;
    },
  };
}

export function materializeAvailabilityPlans(plans, groups, lessons, createLesson, now = Date.now()) {
  let changed = false; const result = lessons.map(l => ({ ...l }));
  for (const plan of plans) {
    const group = groups.find(g => g.id === plan.groupId && !g.deletedAt && g.status !== 'completed');
    if (!group) continue;
    const startDate = plan.config.startDate;
    // Old occurrences retain rooms, work and history; only future instances
    // generated by an earlier plan may be superseded.
    for (const lesson of result) if (lesson.groupId === group.id && lesson.source === 'availability-plan' && lesson.status === 'scheduled'
      && !String(lesson.scheduleEntryId || '').startsWith(`${plan.id}:`) && Date.parse(lesson.startAt) >= Math.max(now, Date.parse(`${startDate}T00:00:00+03:00`))) {
      Object.assign(lesson, { status: 'cancelled', cancelledAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() }); changed = true;
    }
    const from = startDate > moscowDay(now) ? startDate : moscowDay(now);
    for (const slot of availabilitySlots(plan.config).filter(s => plan.slots.includes(s.id))) for (let d = 0; d < 56; d++) {
      const date = addCalendarDays(from, d); if (weekdayIndex(date) !== slot.day) continue;
      const startAt = `${date}T${slot.time}:00+03:00`; if (Date.parse(startAt) <= now) continue;
      const id = crypto.createHash('sha256').update(`${group.id}|${plan.id}|${date}|${slot.id}`).digest('hex').slice(0, 32);
      if (result.some(l => l.id === id)) continue; // Includes manually cancelled instances.
      if (result.some(l => l.groupId === group.id && l.source === 'google-calendar'
        && l.status !== 'cancelled' && Date.parse(l.startAt) === Date.parse(startAt)
        && Number(l.durationMinutes) === plan.config.durationMinutes)) continue;
      result.push(createLesson(group, { startAt, durationMinutes: plan.config.durationMinutes, topic: group.name,
        source: 'availability-plan', scheduleEntryId: `${plan.id}:${slot.id}` }, { id, allowBeforeStart: true })); changed = true;
    }
  }
  return { lessons: result, changed };
}

export function registerGroupAvailability(app, deps) {
  const { store, getGroup, canManage, getStudentName, getBusyEntries, materialize } = deps;
  const busyEntries = async (group, config, force = false) => groupAvailabilityBusyEntries(group, await getBusyEntries(group, config, force));
  const locks = calendarMutationLocks;
  const access = (req, manage = false) => {
    const group = getGroup(req.params.groupId);
    if (!group || group.deletedAt) fail('Группа не найдена', 404);
    if (!canManage(req.auth, group) && (manage || req.auth?.role !== 'student' || !membersOf(group).includes(req.auth.id))) fail('Нет доступа к подбору времени', 403);
    return group;
  };
  const snapshot = async (group, poll, auth) => {
    const memberIds = membersOf(group);
    const canEdit = canManage(auth, group);
    if (!poll) return { poll: null, canManage: canEdit, closed: group.status === 'completed' };
    let blocked = {}; let calendarError = '';
    const includeBusyTimes = poll.includeBusyTimes !== false;
    // All-hours mode collects preferences independently of the calendar.
    // Free-hours mode needs conflicts for pupils as well as the teacher.
    try { if ((canEdit || !includeBusyTimes) && poll.status === 'open') blocked = busySlots(poll.config, await busyEntries(group, poll.config)); }
    catch { calendarError = includeBusyTimes
      ? 'Не удалось проверить календарь преподавателя. Ответы можно собирать, но утверждение временно недоступно. Попробуйте обновить позже.'
      : 'Не удалось проверить свободное время. Выбор и утверждение временно недоступны. Попробуйте обновить позже.'; }
    const publicPoll = { ...poll };
    // Internal transfer receipts preserve replaced answers for recovery, but
    // must not expose answers of former participants to the group.
    delete publicPoll.memberTransfers;
    return { canManage: canEdit, closed: group.status === 'completed', blocked, calendarError,
      poll: { ...publicPoll, includeBusyTimes, members: memberIds.map(id => ({ id, name: getStudentName(id, auth) })),
        answers: Object.fromEntries(memberIds.filter(id => poll.answers[id]).map(id => [id, poll.answers[id]])),
        proposal: poll.proposal ? { ...poll.proposal,
          // Rebuild old saved names for this viewer; historical proposals may contain a private teacher label.
          authorName: poll.proposal.authorRole === 'teacher' || poll.proposal.authorName === 'Преподаватель'
            ? 'Преподаватель' : getStudentName(poll.proposal.authorId, auth),
          votes: Object.fromEntries(memberIds.filter(id => poll.proposal.votes[id]).map(id => [id, poll.proposal.votes[id]])) } : null } };
  };
  const route = action => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let release; let tail; let lockKey; let answerNotification = null;
    try {
      let group = access(req, ['open', 'reopen', 'approve', 'settings'].includes(action));
      if (action !== 'get') {
        lockKey = group.teacherId;
        const previous = locks.get(lockKey) || Promise.resolve();
        tail = new Promise(resolve => { release = resolve; }); locks.set(lockKey, tail);
        await previous; group = access(req, ['open', 'reopen', 'approve', 'settings'].includes(action));
        if (group.status === 'completed') fail('Группа завершена', 409);
      }
      let poll = store.get(group.id); const body = req.body || {};
      if (poll?.status === 'open') {
        // Expand old rounds without discarding answers or changing their plan.
        if (poll.hoursVersion !== 1) { poll.config = { ...poll.config, endMinute: AVAILABILITY_END_MINUTE }; poll.hoursVersion = 1; }
        poll.config = currentAvailabilityConfig(poll.config);
      }
      if (action === 'open') {
        if ((poll?.id || '') !== (body.previousRoundId || '')) fail('Подбор уже изменился. Обновите страницу.', 409);
        const config = availabilityConfig(body);
        if (body.includeBusyTimes !== undefined && typeof body.includeBusyTimes !== 'boolean') fail('Выберите режим подбора времени');
        const includeBusyTimes = body.includeBusyTimes ?? (poll?.includeBusyTimes !== false);
        poll = { id: crypto.randomUUID(), config, includeBusyTimes, hoursVersion: 1, status: 'open', answers: {}, proposal: null,
          plan: poll?.plan || null, updatedAt: Date.now(),
          ...(poll?.memberTransfers ? { memberTransfers: poll.memberTransfers } : {}) };
      } else if (action === 'reopen') {
        if (!poll || poll.id !== body.roundId || poll.status !== 'approved') fail('Расписание уже изменилось. Обновите страницу.', 409);
        const config = currentAvailabilityConfig(poll.hoursVersion === 1 ? poll.config : { ...poll.config, endMinute: AVAILABILITY_END_MINUTE });
        // Availability is independent of the approved pair. Preserve every
        // pupil's saved choices; a new round invalidates stale confirmations.
        poll = { ...poll, id: crypto.randomUUID(), config, hoursVersion: 1, status: 'open', proposal: null };
      } else if (action === 'settings') {
        if (!poll || poll.id !== body.roundId || !['open','approved'].includes(poll.status)) fail('Подбор уже изменился. Обновите страницу.', 409);
        if (typeof body.includeBusyTimes !== 'boolean' || typeof body.previousIncludeBusyTimes !== 'boolean') fail('Выберите режим подбора времени');
        if ((poll.includeBusyTimes !== false) !== body.previousIncludeBusyTimes) fail('Режим уже изменён в другой вкладке. Обновите страницу.', 409);
        // Keep answers, proposal, votes and the approved schedule intact.
        poll.includeBusyTimes = body.includeBusyTimes;
      } else if (action !== 'get') {
        if (!poll || poll.id !== body.roundId || poll.status !== 'open') fail('Этот подбор уже завершён или изменился. Обновите страницу.', 409);
        if (action === 'answer') {
          if (req.auth.role !== 'student' || !membersOf(group).includes(req.auth.id)) fail('Свободное время отмечает сам ученик', 403);
          const old = poll.answers[req.auth.id];
          if ((old?.version || 0) !== body.version) fail('Ваш ответ уже изменён в другой вкладке. Обновите страницу.', 409);
          if (!body.choices || Array.isArray(body.choices) || typeof body.choices !== 'object') fail('Выберите удобное время');
          const allowed = new Set(availabilitySlots(poll.config).map(s => s.id));
          const blocked = poll.includeBusyTimes === false ? busySlots(poll.config, await busyEntries(group, poll.config, true)) : {};
          const choices = {};
          for (const [id, value] of Object.entries(body.choices)) {
            if (!allowed.has(id) || !['yes', 'maybe'].includes(value)) fail('Некорректное время');
            if (blocked[id]) fail('Часть выбранного времени уже занята. Обновите календарь и выберите свободные часы.', 409);
            choices[id] = value;
          }
          const changed = !old || Object.keys(old.choices || {}).length !== Object.keys(choices).length
            || Object.entries(choices).some(([id, value]) => old.choices?.[id] !== value);
          const version = (old?.version || 0) + 1;
          const updatedAt = Date.now();
          const teacherNotification = changed ? {
            id: `group-availability:${poll.id}:${req.auth.id}:${version}`,
            occurredAt: new Date(updatedAt).toISOString(), updated: Boolean(old),
          } : old.teacherNotification;
          poll.answers[req.auth.id] = { version, choices, updatedAt, ...(teacherNotification ? { teacherNotification } : {}) };
          if (changed) answerNotification = { studentId: req.auth.id, answer: poll.answers[req.auth.id] };
          if (poll.proposal) delete poll.proposal.votes[req.auth.id];
        } else if (action === 'propose') {
          if ((poll.proposal?.id || '') !== (body.previousProposalId || '')) fail('В группе уже другое предложение. Обновите страницу.', 409);
          const slots = [...new Set(Array.isArray(body.slots) ? body.slots : [])];
          const all = availabilitySlots(poll.config);
          if (slots.length !== 2 || slots.some(id => !all.some(s => s.id === id)) || new Set(slots.map(id => all.find(s => s.id === id).day)).size !== 2) fail('Выберите два занятия в разные дни');
          if (poll.includeBusyTimes === false) {
            const blocked = busySlots(poll.config, await busyEntries(group, poll.config, true));
            if (slots.some(id => blocked[id])) fail('Это время уже занято. Выберите свободные часы.', 409);
          }
          poll.proposal = { id: crypto.randomUUID(), slots, authorId: req.auth.id, authorRole: canManage(req.auth, group) ? 'teacher' : 'student',
            authorName: canManage(req.auth, group) ? 'Преподаватель' : getStudentName(req.auth.id, req.auth),
            comment: text(body.comment), votes: {}, createdAt: Date.now() };
        } else if (action === 'vote') {
          if (req.auth.role !== 'student' || !membersOf(group).includes(req.auth.id)) fail('Подтверждение нужно от ученика', 403);
          if (!poll.proposal || poll.proposal.id !== body.proposalId) fail('Предложение изменилось. Обновите страницу.', 409);
          if (!['yes', 'maybe', 'no'].includes(body.choice)) fail('Выберите ответ');
          poll.proposal.votes[req.auth.id] = { choice: body.choice, comment: text(body.comment), updatedAt: Date.now() };
        } else if (action === 'approve') {
          const proposal = poll.proposal;
          if (!proposal || proposal.id !== body.proposalId) fail('Предложение изменилось. Обновите страницу.', 409);
          const allowed = new Set(availabilitySlots(poll.config).map(slot => slot.id));
          if (proposal.slots.some(id => !allowed.has(id))) fail('Выбранное занятие выходит за часы подбора. Предложите время с окончанием до 23:00.', 409);
          // Fetch remote calendar, then reread roster: an added pupil must not
          // be silently omitted while waiting for a network response.
          const busy = await busyEntries(group, poll.config, true);
          group = access(req, true);
          const members = membersOf(group);
          if (!members.length || members.some(id => !['yes', 'maybe'].includes(proposal.votes[id]?.choice))) fail('Дождитесь согласия каждого участника группы', 409);
          const blocked = busySlots(poll.config, busy);
          if (proposal.slots.some(id => blocked[id])) fail('Время занято у преподавателя. Сначала перенесите пересекающиеся занятия или предложите другое время.', 409);
          poll.plan = { id: proposal.id, config: poll.config, slots: proposal.slots, approvedAt: Date.now() };
          poll.status = 'approved';
        }
      }
      group = access(req, ['open', 'reopen', 'approve', 'settings'].includes(action));
      if (action !== 'get') {
        if (group.status === 'completed') fail('Группа завершена', 409);
        poll.updatedAt = Date.now(); store.put(group.id, poll); if (action === 'approve') materialize();
        if (answerNotification && deps.notifyAnswer) {
          try { await deps.notifyAnswer(group, poll, answerNotification); }
          catch (error) { console.warn('[group-availability] answer notification failed:', error.message); }
        }
      }
      res.json(await snapshot(group, poll, req.auth));
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Не удалось проверить или сохранить расписание. Попробуйте ещё раз.' }); }
    finally { if (release) { release(); if (locks.get(lockKey) === tail) locks.delete(lockKey); } }
  };
  app.get('/api/learning-groups/:groupId/availability', route('get'));
  for (const action of ['open', 'reopen', 'settings', 'answer', 'propose', 'vote', 'approve']) app.post(`/api/learning-groups/:groupId/availability/${action}`, route(action));
}
