import crypto from 'node:crypto';
import { normalizeLessonDayKey, normalizeLessonTime, zonedLessonDateTimeToUtcMs } from './lessonTopics.js';

const digest = value => crypto.createHash('sha1').update(value).digest('hex').slice(0, 18);

// Calendar occurrence IDs include their start time. Recover the stable Google
// identity for older recordings before following a moved instance. Never bind
// by pupil name, proximity, or the next occurrence of a weekly series.
export function refreshedRecordingOccurrence(job, schedule, timeZone = 'Europe/Moscow') {
  const bound = job?.occurrence;
  if (!bound?.key || !bound.studentId || bound.lessonId || !Number.isFinite(bound.startMs)) return null;
  const matches = [];
  for (const entry of schedule || []) {
    if (!entry || entry.cancelled || entry.cancelledAt || ['cancelled', 'deleted'].includes(entry.status)
      || entry.studentId && entry.studentId !== bound.studentId) continue;
    const date = normalizeLessonDayKey(entry.date || entry.dayKey || bound.dayKey);
    const time = normalizeLessonTime(entry.time);
    const startMs = zonedLessonDateTimeToUtcMs(date, time, timeZone);
    const durationMinutes = Number(entry.durationMinutes) || 60;
    if (!Number.isFinite(startMs) || durationMinutes < 15 || durationMinutes > 360) continue;
    if ((entry.excludedDates || []).includes(date)) continue;
    const uid = String(entry.externalEventId || '').trim();
    const recurring = Boolean(entry.calendarIsRecurring);
    const original = Date.parse(entry.calendarOriginalStartAt || entry.startAt || '');
    const anchor = Date.parse(bound.calendarOriginalStartAt || '') || bound.startMs;
    if (recurring && (Number.isFinite(original) ? original !== anchor : date !== bound.dayKey)) continue;
    // A weekly local source ID is shared by all dates. Only its bound day is relevant.
    if (!entry.date && !entry.dayKey && date !== bound.dayKey) continue;
    let score = 0;
    if (uid && bound.calendarUid === uid) score = 40;
    else if (uid && [`google-ical-${digest(`${job.teacherId}:${uid}:${new Date(bound.startMs).toISOString()}`)}`,
      `google-student-${digest(`${job.teacherId}:${bound.studentId}:${uid}:${bound.dayKey}:${bound.time}`)}`].includes(bound.sourceEntryId)) score = 30;
    else if (bound.sourceEntryId && [entry.id, entry.calendarMovedFromId].includes(bound.sourceEntryId)
      && (entry.date || entry.dayKey || date === bound.dayKey)) score = 20;
    if (!score) continue;
    if (entry.source === 'google-ical') score += 5; // Live Google wins over its persisted student copy.
    matches.push({ entry, score, date, time, startMs, durationMinutes, uid });
  }
  const score = Math.max(0, ...matches.map(match => match.score));
  const best = [...new Map(matches.filter(match => match.score === score)
    .map(match => [`${match.uid || match.entry.id}:${match.startMs}:${match.durationMinutes}`, match])).values()];
  if (best.length !== 1) return null;
  const { entry, date, time, startMs, durationMinutes, uid } = best[0];
  return { ...bound, dayKey: date, time, startMs, durationMinutes, endMs: startMs + durationMinutes * 60_000,
    sourceEntryId: String(entry.id || bound.sourceEntryId),
    ...(uid ? { calendarUid: uid, calendarIsRecurring: Boolean(entry.calendarIsRecurring),
      calendarOriginalStartAt: entry.calendarOriginalStartAt || (entry.calendarIsRecurring ? new Date(startMs).toISOString() : '') } : {}) };
}
