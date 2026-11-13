import { participationOccurrence } from '../src/utils/groupParticipation.js';

const weekOf = day => {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  return midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * 86_400_000;
};

export function groupHomeworkReviewUntil(entry, teacherId, lessons, liveEndAt, findScheduledSlot = () => null) {
  if (entry.source !== 'learning-group' || !entry.learningGroupId) return '';
  const due = Date.parse(entry.dueAt);
  if (!Number.isFinite(due)) return '';
  const groupLessons = lessons.filter(lesson => lesson.teacherId === teacherId && lesson.groupId === entry.learningGroupId);
  const matches = entry.learningAssignmentLessonId ? [] : groupLessons.filter(lesson => Date.parse(lesson.startAt) === due);
  let lesson = entry.learningAssignmentLessonId
    ? groupLessons.find(lesson => lesson.id === entry.learningAssignmentLessonId)
    : matches.find(lesson => lesson.status === 'active') || matches.find(lesson => lesson.status === 'scheduled') || matches[0];
  // Weekly assignments can be issued before the actual lesson row exists.
  if (!lesson && !entry.learningAssignmentLessonId) {
    const { day, time, slot } = participationOccurrence({ startAt: entry.dueAt });
    const scheduled = Date.parse(`${day}T${time}:00+03:00`) === due && findScheduledSlot(entry.learningGroupId, day, time);
    if (scheduled) {
      lesson = groupLessons.find(known => (known.scheduleEntryId === scheduled.id || known.participationSlot === slot)
        && weekOf(participationOccurrence(known).day) === weekOf(day))
        || { status: 'scheduled', startAt: entry.dueAt, durationMinutes: scheduled.durationMinutes };
    }
  }
  if (!lesson || !['scheduled', 'active'].includes(lesson.status)) return '';
  const scheduledEnd = Date.parse(lesson.startAt) + Number(lesson.durationMinutes) * 60_000;
  const end = (lesson.status === 'active' ? liveEndAt(lesson) : null) ?? scheduledEnd;
  return Number.isFinite(end) && end > due ? new Date(end).toISOString() : '';
}
