import crypto from 'node:crypto';
import { buildPreparationSchedule } from '../src/utils/preparationSchedule.js';
import { AVAILABILITY_WEEKDAYS, AVAILABILITY_DAY_NAMES, weekdayIndex } from '../src/utils/groupAvailability.js';
import { expandRescheduleOccurrences } from './lessonReschedule.js';
import { withTeacherCalendarLock } from './calendarMutations.js';
import { LearningGroupDomainError } from './learningGroups.js';

const start = lesson => Date.parse(`${lesson.date}T${lesson.time}:00+03:00`);
const fail = (message, statusCode = 409) => { throw new LearningGroupDomainError(message, { statusCode, code: 'invalid_preparation_schedule' }); };
export const preparationLessonEntry = (row, lesson) => ({
  id: lesson.id, preparationPlanId: row.planId, date: lesson.date, time: lesson.time, durationMinutes: lesson.durationMinutes,
  weekdayKey: AVAILABILITY_WEEKDAYS[weekdayIndex(lesson.date)], weekdayOrder: weekdayIndex(lesson.date) + 1,
  day: AVAILABILITY_DAY_NAMES[weekdayIndex(lesson.date)], subject: `${row.studentName} (предподготовка)`,
  studentId: row.id, studentName: row.studentName, source: 'preparation-plan', excludedDates: [],
});

// A durable finite plan is the source of truth. Each appointment has its own
// stable Google ID; cancellation can safely recover after an ambiguous timeout.
export function createPreparationLessons({ store, getStudent, getEntries, applyLocal, syncGoogle, notify = () => {}, now = Date.now }) {
  let googleUids = null;
  const persist = row => { googleUids = null; return store.put(row); };
  const owned = student => { const row = store.get(student.id); return row?.teacherId === student.teacherId ? row : null; };
  const view = student => {
    const row = owned(student);
    return row ? { config: row.config, lessons: row.lessons.map(lesson => ({ id: lesson.id, date: lesson.date, time: lesson.time,
      durationMinutes: lesson.durationMinutes, cancelled: Boolean(lesson.cancelled), syncStatus: lesson.syncStatus, syncError: lesson.syncError || '' })) } : null;
  };
  const sync = async initial => {
    let row = store.get(initial.id);
    const student = getStudent(row.id);
    if (!student || student.teacherId !== row.teacherId || student.deletedAt) return;
    if (row.localPending) {
      applyLocal(row);
      row.localPending = false;
      row = persist(row);
    }
    for (let index = 0; index < row.lessons.length; index++) {
      const lesson = row.lessons[index];
      if (lesson.syncStatus === 'synced') continue;
      try {
        lesson.google = await syncGoogle(row, lesson);
        lesson.syncStatus = 'synced'; lesson.syncError = '';
      } catch (error) {
        lesson.syncStatus = 'pending'; lesson.syncError = error.message || 'Google Calendar временно недоступен.';
        // Do not repeat a failing connection once for every appointment.
        persist(row); notify(row.teacherId); return;
      }
      row = persist(row);
    }
    notify(row.teacherId);
  };
  return {
    view,
    async validate(student, input) {
      if (owned(student)?.lessons.some(lesson => !lesson.cancelled && start(lesson) > now())) fail('Сначала завершите или снимите текущий план предподготовки.');
      let built;
      try { built = buildPreparationSchedule(input); } catch (error) { fail(error.message, 400); }
      if (built.lessons.some(lesson => start(lesson) <= now())) fail('Все занятия должны начинаться в будущем.', 400);
      const from = built.lessons[0].date, through = built.lessons.at(-1).date;
      const entries = await getEntries(student.teacherId, from, through);
      const days = Math.round((Date.parse(through) - Date.parse(from)) / 86400000) + 1;
      const dated = entries.filter(entry => entry.date >= from && entry.date <= through && !entry.cancelled && !entry.isCancelled
        && entry.status !== 'cancelled' && !entry.excludedDates?.includes(entry.date) && !entry.cancelledDates?.includes(entry.date));
      const occupied = [...dated, ...expandRescheduleOccurrences(entries.filter(entry => !entry.date), from, days)];
      for (const lesson of built.lessons) {
        const conflict = occupied.find(entry => start(entry) < start(lesson) + lesson.durationMinutes * 60000
          && start(entry) + (Number(entry.durationMinutes) || 60) * 60000 > start(lesson));
        if (conflict) fail(`${lesson.date}, ${lesson.time}: время занято — ${conflict.subject || conflict.studentName || 'событие'}. Выберите другое расписание.`);
      }
      return built;
    },
    async create(student, built) {
      const previous = owned(student);
      const row = persist({ id: student.id, teacherId: student.teacherId, studentName: student.name, planId: crypto.randomUUID(),
        config: built.config, localPending: true, lessons: [...(previous?.lessons || []), ...built.lessons.map(lesson => ({ ...lesson, id: `preparation-${crypto.randomUUID()}`, syncStatus: 'pending' }))] });
      await sync(row); return view(student);
    },
    async cancelFuture(student) {
      const row = owned(student); if (!row) return;
      row.lessons = row.lessons.map(lesson => !lesson.cancelled && start(lesson) > now()
        ? { ...lesson, cancelled: true, syncStatus: 'pending', syncError: '' } : lesson);
      row.localPending = true;
      persist(row); await sync(row);
    },
    future(student) { return (view(student)?.lessons || []).filter(lesson => !lesson.cancelled && start(lesson) > now()); },
    managesGoogle(teacherId, event) {
      if (event.extendedProperties?.private?.ivan100PreparationTeacher === teacherId) return true;
      const uid = event.externalEventId || event.iCalUID || event.uid;
      if (!uid) return false;
      if (!googleUids) googleUids = new Set(store.all().flatMap(row => row.lessons.filter(lesson => lesson.google?.iCalUID)
        .map(lesson => `${row.teacherId}:${lesson.google.iCalUID}`)));
      return googleUids.has(`${teacherId}:${uid}`);
    },
    async retryPending() {
      for (const row of store.all().filter(value => value.lessons.some(lesson => lesson.syncStatus !== 'synced'))) {
        await withTeacherCalendarLock(row.teacherId, () => sync(row));
      }
    },
  };
}
