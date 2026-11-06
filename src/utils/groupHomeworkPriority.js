import { addCalendarDays, AVAILABILITY_WEEKDAYS, moscowDay, weekdayIndex } from './groupAvailability.js';
import { normalizeHomeworkStudyTrack } from './concurrentHomework.js';
import { isScheduleEntryInDateRange } from './scheduleDateRange.js';

function upcomingStart(entry, now) {
  if (entry.cancelled || entry.isCancelled || entry.isPaymentOverdueOccurrence
    || ['cancelled', 'canceled', 'completed'].includes(entry.status)) return NaN;
  const explicit = Date.parse(entry.startsAt || entry.startAt || '');
  if (Number.isFinite(explicit)) return explicit > now ? explicit : NaN;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.time || '')) return NaN;
  const startOn = day => Date.parse(`${day}T${entry.time}:00+03:00`);
  if (entry.date) return startOn(entry.date) > now ? startOn(entry.date) : NaN;
  const weekday = AVAILABILITY_WEEKDAYS.indexOf(entry.weekdayKey);
  if (weekday < 0) return NaN;
  const today = moscowDay(now);
  const anchor = entry.repeatFrom && entry.repeatFrom > today ? entry.repeatFrom : today;
  const firstDay = addCalendarDays(anchor, (weekday - weekdayIndex(anchor) + 7) % 7);
  for (let week = 0; week <= 16; week += 1) {
    const day = addCalendarDays(firstDay, 7 * week);
    if (isScheduleEntryInDateRange(entry, day) && !entry.excludedDates?.includes(day)
      && !entry.cancelledDates?.includes(day) && startOn(day) > now) return startOn(day);
  }
  return NaN;
}

export function getGroupHomeworkPriority(active, schedule, now) {
  const groupWork = active.filter(entry => entry.source === 'learning-group' && entry.learningGroupId);
  const next = schedule.filter(entry => entry.groupId && entry.groupHomeworkParticipant !== false)
    .map(entry => ({ entry, start: upcomingStart(entry, now) }))
    .filter(row => Number.isFinite(row.start))
    .sort((left, right) => left.start - right.start)[0];

  if (next) {
    const { entry: lesson, start } = next;
    const track = normalizeHomeworkStudyTrack(lesson.studyTrack);
    const matches = groupWork.filter(entry => {
      if (entry.learningGroupId !== lesson.groupId) return false;
      const entryTrack = normalizeHomeworkStudyTrack(entry.studyTrack);
      if (track && entryTrack && track !== entryTrack) return false;
      if (lesson.lessonId && lesson.lessonId === entry.learningAssignmentLessonId) return true;
      const deadline = Date.parse(entry.dueAt);
      return deadline === start || Boolean(track && entryTrack === track && deadline <= start);
    });
    if (matches.length || track) return { entries: matches, start, track };
  }

  // When the timetable cannot identify the direction, label only the deadline.
  const earliest = groupWork.find(entry => Number.isFinite(Date.parse(entry.dueAt)));
  return earliest ? { entries: [earliest], start: null, track: normalizeHomeworkStudyTrack(earliest.studyTrack) } : null;
}
