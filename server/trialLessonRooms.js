import {normalizeLearningGroup, normalizeLearningLessonSession} from './learningGroups.js';

export const trialRoomId = bookingId => `trial-${bookingId}`;
export const isTrialLesson = lesson => lesson?.source === 'trial-booking';

// Trial rooms reuse the persisted lesson board and code without enrolling
// anybody in a paid group or creating recurring lessons/subscriptions.
export function trialRoomGroup(lesson, students = []) {
  if (!isTrialLesson(lesson)) return null;
  const current = new Map(students.filter(student => !student.deletedAt).map(student => [student.id, student]));
  return normalizeLearningGroup({
    id: lesson.groupId, teacherId: lesson.teacherId, name: 'Пробное занятие',
    createdAt: lesson.createdAt, startedAt: lesson.createdAt || lesson.startAt,
    members: lesson.participantIds.filter(id => current.get(id)?.teacherId === lesson.teacherId)
      .map(studentId => ({studentId, joinedAt: lesson.createdAt || lesson.startAt, status: 'active'})),
    schedule: [],
  });
}

export function trialRoomSession(booking, previous = null, nowMs = Date.now()) {
  const startAt = new Date(`${booking.date}T${booking.time}:00+03:00`).toISOString();
  const finished = previous && ['completed', 'cancelled'].includes(previous.status);
  return normalizeLearningLessonSession({
    ...previous, id: trialRoomId(booking.id), groupId: trialRoomId(booking.id), teacherId: booking.teacherId,
    source: 'trial-booking', externalOccurrenceId: booking.id,
    participantIds: finished ? previous.participantIds : booking.studentIds,
    startAt: finished ? previous.startAt : startAt,
    durationMinutes: finished ? previous.durationMinutes : booking.durationMinutes,
    topic: 'Пробное занятие', telemostUrl: booking.meetingUrl,
    status: previous?.status || 'scheduled', createdAt: previous?.createdAt || new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  });
}

export const trialRoomPayload = lesson => ({
  ...lesson, lessonId: lesson.id, startsAt: lesson.startAt, groupName: 'Пробное занятие',
  trialBookingId: lesson.externalOccurrenceId, surface: 'board',
  readOnly: ['completed', 'cancelled'].includes(lesson.status),
});
