import crypto from 'node:crypto';
import { calendarEditTargetEntry } from './teacherCalendarEdits.js';

// Writes only after Google's durable acknowledgement. Each stage is repeatable
// so a crash between the schedule, payment markers and journal does not duplicate a lesson.
export function createTeacherCalendarEditApplier(deps) {
  const removeSource = (schedule, source, groupId = '') => schedule.flatMap(entry => {
    if (!source) return [entry];
    const same = entry.id === source.id || (entry.time === source.time && (entry.date ? entry.date === source.date : entry.weekdayKey === source.weekdayKey)
      && (groupId ? entry.groupId === groupId : !entry.groupId));
    if (!same) return [entry];
    return entry.date ? [] : [{ ...entry, excludedDates: [...new Set([...(entry.excludedDates || []), source.date])] }];
  });
  return async row => {
    let target = calendarEditTargetEntry(row);
    if (row.target.groupId) {
      const group = deps.getGroup(row.target.groupId);
      const lessons = deps.readLessons();
      const id = row.source?.lessonId || row.source?.id?.replace(/^learning-group-session-/, '')
        || crypto.createHash('sha256').update(`calendar-edit:${row.id}`).digest('hex').slice(0, 32);
      const existing = lessons.find(lesson => lesson.groupId === group.id && (lesson.id === id
        || row.source && Date.parse(lesson.startAt) === Date.parse(`${row.source.date}T${row.source.time}:00+03:00`) && lesson.status !== 'cancelled'));
      const lesson = existing ? deps.updateLesson(existing, { startAt: target.startAt, durationMinutes: target.durationMinutes }, { actorId: row.teacherId })
        : deps.createLesson(group, { startAt: target.startAt, durationMinutes: target.durationMinutes, topic: target.subject,
          note: row.target.note, source: 'google-calendar', externalEventId: target.externalEventId, externalOccurrenceId: target.id }, { id, actorId: row.teacherId, allowBeforeStart: true });
      const updated = deps.normalizeLesson({ ...lesson, source: 'google-calendar', externalEventId: target.externalEventId,
        externalOccurrenceId: target.id, externalCalendarProvider: 'Google Calendar' });
      deps.writeLessons([...lessons.filter(value => value.id !== updated.id), updated]);
      deps.writeRoster(deps.createRoster(updated));
      target = { ...target, lessonId: updated.id, participantIds: updated.participantIds };
      for (const studentId of updated.participantIds || []) {
        const student = deps.getStudent(studentId);
        if (!student || student.deletedAt || student.teacherId !== row.teacherId) continue;
        const data = deps.getStudentData(studentId);
        const moved = deps.buildStudentGoogle(target, student);
        deps.setStudentSchedule(studentId, data, [...removeSource(data.schedule || [], row.source, group.id).filter(entry => entry.id !== moved.id), moved]);
      }
    } else if (row.target.studentId) {
      const student = deps.getStudent(row.target.studentId), data = deps.getStudentData(student.id);
      const moved = deps.buildStudentGoogle(target, student);
      deps.setStudentSchedule(student.id, data, [...removeSource(data.schedule || [], row.source).filter(entry => entry.id !== moved.id), moved]);
    } else {
      const teachers = deps.readTeachers(), index = teachers.findIndex(teacher => teacher.id === row.teacherId);
      if (index < 0) throw new Error('Teacher no longer exists');
      const previous = teachers[index].calendarSchedule || [];
      // Personal events have no student profile in which to retain a local mirror.
      teachers[index] = { ...teachers[index], calendarSchedule: [...removeSource(previous, row.source).filter(entry => entry.id !== target.id), { ...target, isTeacherSlot: true, calendarEditGoogleMirror: true }] };
      deps.writeTeachers(teachers);
    }
    if (row.source) await deps.movePaymentMarks(row, target);
    deps.invalidate(row.teacherId);
    return target;
  };
}
