import crypto from 'node:crypto';
import { withTeacherCalendarLock } from './calendarMutations.js';
import { expandRescheduleOccurrences } from './lessonReschedule.js';
import { addCalendarDays } from '../src/utils/groupAvailability.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const startAt = value => new Date(`${value.date}T${value.time}:00+03:00`).toISOString();
export const calendarEditGoogleId = (teacherId, uid, date, time) => `google-ical-${crypto.createHash('sha1')
  .update(`${teacherId}:${uid}:${startAt({ date, time })}`).digest('hex').slice(0, 18)}`;

export function calendarEditTargetEntry(row) {
  const uid = row.googleResult.iCalUID;
  return { ...(row.source || {}), ...row.target,
    id: calendarEditGoogleId(row.teacherId, uid, row.target.date, row.target.time),
    subject: row.target.title, studentName: row.target.studentName || row.target.title,
    studentId: row.target.studentId || '', groupId: row.target.groupId || '',
    ...(row.target.groupId ? { isLearningGroupEvent: true, groupName: row.target.studentName || row.target.title } : {}),
    source: 'google-ical', isExternalCalendarEvent: true, isGoogleCalendarSync: true,
    calendarPersonalEvent: !row.target.studentId && !row.target.groupId && row.target.kind !== 'trial',
    externalEventId: uid, externalCalendarProvider: 'Google Calendar',
    startAt: startAt(row.target), excludedDates: [],
    calendarOriginalStartAt: row.source ? startAt(row.source) : '',
    calendarMovedFromId: row.source?.id || '', calendarIsRecurring: row.target.repeatMode === 'weekly' || Boolean(row.source?.calendarIsRecurring),
    calendarEditProjected: true,
  };
}

// Applied before group-session projection, so a lagging Google feed cannot move
// the real group lesson back to its former time. Bindings also preserve custom titles.
export function projectCalendarEditEntry(entry, teacherId, store) {
  let next = entry;
  for (const row of store.all().filter(value => value.teacherId === teacherId && value.googleResult)) {
    const uid = row.googleResult.iCalUID;
    if (next.externalEventId !== uid) continue;
    const isTarget = next.date === row.target.date && next.time === row.target.time;
    if (isTarget && !next.calendarEditProjected && !row.feedObserved) store.put({ ...row, feedObserved: true });
    const isOld = row.source && next.date === row.source.date && next.time === row.source.time;
    if (isOld && !row.feedObserved) next = { ...next, ...calendarEditTargetEntry(row) };
    if ((isTarget || isOld && !row.feedObserved) && row.source?.lessonId) next = { ...next, lessonId: row.source.lessonId };
    next = { ...next, calendarPlatformOwner: { studentId: row.target.studentId || '', groupId: row.target.groupId || '' } };
  }
  return next;
}

export function overlayCalendarEdits(entries, teacherId, store) {
  const result = entries.map(entry => projectCalendarEditEntry(entry, teacherId, store));
  const rows = store.all().filter(value => value.teacherId === teacherId && value.googleResult);
  for (const row of rows.filter(value => !value.feedObserved && !rows.some(next => next.id !== value.id
    && next.source?.externalEventId === value.googleResult.iCalUID && next.source.date === value.target.date && next.source.time === value.target.time))) {
    const target = projectCalendarEditEntry(calendarEditTargetEntry(row), teacherId, store);
    if (!result.some(entry => entry.externalEventId === target.externalEventId && entry.date === target.date && entry.time === target.time)) result.push(target);
  }
  return result.filter((entry, index) => !entry.externalEventId || result.findIndex(value => value.externalEventId === entry.externalEventId && value.date === entry.date && value.time === entry.time) === index);
}

export function registerTeacherCalendarEdits(app, { store, getTeacher, getStudent, getGroup, getEntries, prepareSource = value => value, googleChange, applyLocal, notify = () => {} }) {
  const teacherAccess = (auth, requested) => {
    if (!['teacher', 'admin'].includes(auth?.role)) fail('Нет доступа', 403);
    const id = auth.role === 'teacher' ? auth.id : String(requested || '').trim();
    if (!id || !getTeacher(id)) fail('Преподаватель не найден', 404);
    return id;
  };
  const checkOwners = row => {
    if (row.target.studentId) {
      const pupil = getStudent(row.target.studentId);
      if (!pupil || pupil.deletedAt || pupil.teacherId !== row.teacherId) fail('Ученик больше не закреплён за преподавателем.', 403);
    }
    if (row.target.groupId) {
      const group = getGroup(row.target.groupId);
      if (!group || group.deletedAt || group.teacherId !== row.teacherId) fail('Группа больше не принадлежит преподавателю.', 403);
    }
  };
  const serialize = row => ({ id: row.id, operation: row.operation, status: row.status, title: row.target.title,
    date: row.target.date, time: row.target.time, error: row.lastError || '',
    ...(row.status === 'done' ? { entry: { ...calendarEditTargetEntry(row), ...row.appliedIdentity } } : {}) });
  const apply = async (row, { fresh = false } = {}) => {
    if (row.status === 'done') return row;
    if (row.status === 'cancelled') fail('Это изменение отменено. Создайте новое.', 409);
    checkOwners(row);
    if (row.status === 'applying' && !row.googleResult) {
      const result = await googleChange(row, { recoverOnly: true });
      checkOwners(row);
      if (result) row = store.put({ ...row, googleResult: result });
    }
    if (!row.googleResult) {
      row = store.put({ ...row, status: 'applying', lastError: '' });
      try {
        const result = await googleChange(row, { skipRecoveryLookup: fresh });
        if (!result?.iCalUID) throw new Error('Google did not return an event identity');
        row = store.put({ ...row, googleResult: result });
      } catch (error) {
        store.put({ ...row, status: error.definite ? 'pending' : 'applying', lastError: error.message || 'Нет подтверждения Google.' });
        throw error;
      }
    }
    checkOwners(row);
    const entry = await applyLocal(row); // Must be idempotent: Google may have committed before a restart.
    const appliedIdentity = entry?.lessonId ? { lessonId: entry.lessonId, participantIds: entry.participantIds || [] } : {};
    row = store.put({ ...row, appliedIdentity, status: 'done', lastError: '', completedAt: Date.now() });
    notify(row);
    return row;
  };
  const route = action => async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try { res.json(await action(req)); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Не удалось завершить сохранение в Google. Изменение сохранено для безопасного повтора.' }); }
  };
  app.get('/api/teacher-calendar/edits', route(req => {
    const teacherId = teacherAccess(req.auth, req.query.teacherId);
    return { edits: store.all().filter(row => row.teacherId === teacherId && ['pending', 'applying'].includes(row.status)).map(serialize) };
  }));
  app.post('/api/teacher-calendar/edits/:id/cancel', route(req => {
    const teacherId = teacherAccess(req.auth, req.body?.teacherId);
    return withTeacherCalendarLock(teacherId, async () => {
      const row = store.get(req.params.id);
      if (!row || row.teacherId !== teacherId) fail('Изменение не найдено.', 404);
      if (row.status !== 'pending' || row.googleResult) fail('Google мог уже принять изменение. Сначала завершите синхронизацию.', 409);
      return serialize(store.put({ ...row, status: 'cancelled' }));
    });
  }));
  app.post('/api/teacher-calendar/edits/:id/retry', route(req => {
    const teacherId = teacherAccess(req.auth, req.body?.teacherId);
    return withTeacherCalendarLock(teacherId, async () => {
      const row = store.get(req.params.id);
      if (!row || row.teacherId !== teacherId) fail('Изменение не найдено.', 404);
      return serialize(await apply(row));
    });
  }));
  app.post('/api/teacher-calendar/edits', route(req => {
    const teacherId = teacherAccess(req.auth, req.body?.teacherId);
    const body = req.body || {};
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(body.id || '')) fail('Не удалось определить запрос сохранения.');
    if (!['create', 'move'].includes(body.operation)) fail('Неизвестное действие календаря.');
    const target = { date: body.target?.date, time: body.target?.time, durationMinutes: Number(body.target?.durationMinutes) };
    if (!validDate(target.date) || !validTime(target.time) || !Number.isInteger(target.durationMinutes) || target.durationMinutes < 15 || target.durationMinutes > 1440
      || Number(target.time.slice(0, 2)) * 60 + Number(target.time.slice(3)) + target.durationMinutes > 1440) fail('Событие должно полностью помещаться в выбранный день.');
    return withTeacherCalendarLock(teacherId, async () => {
      const previous = store.get(body.id);
      const signature = JSON.stringify({ operation: body.operation, source: body.source || null, target: body.target });
      if (previous) {
        if (previous.teacherId !== teacherId) fail('Этот запрос уже использован для другого изменения.', 409);
        if (previous.signature === signature) return serialize(await apply(previous));
        if (previous.status !== 'pending' || previous.googleResult) fail('Сначала завершите начатую синхронизацию. Затем можно изменить событие ещё раз.', 409);
      }
      let source = null;
      if (body.operation === 'move') {
        if (!validDate(body.source?.date) || !validTime(body.source?.time) || !body.source?.id) fail('Не удалось определить исходное событие.');
        const first = [body.source.date, target.date].sort()[0], last = [body.source.date, target.date].sort().at(-1);
        const entries = await getEntries(teacherId, true, addCalendarDays(last, 1), { fromDay: addCalendarDays(first, -1) });
        const occurrences = expandRescheduleOccurrences(entries, body.source.date, 1);
        const matches = occurrences.filter(entry => entry.id === body.source.id && entry.date === body.source.date && entry.time === body.source.time);
        if (matches.length !== 1 || matches[0].durationMinutes !== Number(body.source.durationMinutes)) fail('Событие уже изменилось. Обновите календарь и повторите перенос.', 409);
        source = prepareSource(matches[0], teacherId);
        if (source.cancelled || source.isCancelled || source.status === 'cancelled') fail('Отменённое событие сначала нужно восстановить.', 409);
        if (target.durationMinutes !== source.durationMinutes) fail('Перетаскивание сохраняет длительность события.');
        if (source.date === target.date && source.time === target.time) fail('Событие уже находится в этом времени.');
        if (store.all().some(row => row.id !== body.id && row.teacherId === teacherId && ['pending', 'applying'].includes(row.status) && row.source?.id === source.id && row.source.date === source.date && row.source.time === source.time)) fail('Для события уже есть незавершённое изменение. Повторите его синхронизацию.', 409);
        target.studentId = source.studentId || ''; target.groupId = source.groupId || '';
        target.studentName = source.groupName || source.studentName || '';
        target.title = source.googleCalendarTitle || source.subject || source.studentName || 'Событие';
        target.kind = !target.studentId && !target.groupId && !source.calendarPersonalEvent ? 'trial' : 'event';
        target.repeatMode = 'once'; target.note = source.note || '';
      } else {
        target.studentId = String(body.target?.studentId || '').trim(); target.groupId = String(body.target?.groupId || '').trim();
        if (target.studentId && target.groupId) fail('Выберите ученика или группу.');
        target.title = String(body.target?.title || '').trim().slice(0, 500) || 'Событие';
        target.note = String(body.target?.note || '').trim().slice(0, 6000);
        target.repeatMode = body.target?.repeatMode === 'weekly' ? 'weekly' : 'once';
        target.kind = body.target?.kind === 'trial' ? 'trial' : 'event';
        target.studentName = target.studentId ? getStudent(target.studentId)?.name || '' : target.groupId ? getGroup(target.groupId)?.name || '' : target.title;
      }
      const row = { id: body.id, teacherId, operation: body.operation, source, target, signature, status: 'pending', createdAt: Date.now() };
      checkOwners(row);
      // Ownership is checked again after the asynchronous calendar read and before every write.
      teacherAccess(req.auth, teacherId);
      return serialize(await apply(store.put(row), { fresh: true }));
    });
  }));
  return { retry: row => withTeacherCalendarLock(row.teacherId, () => apply(store.get(row.id))) };
}
