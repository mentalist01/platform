import { weeklyHomeworkDeadline, weeklyHomeworkLessonChoices } from './concurrentHomework.js';

const DAY = 86400000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const normalizeGroupStudyPlan = plan => ['split', 'ege-only'].includes(plan?.mode)
  ? { mode: plan.mode, pythonWeekday: plan.mode === 'split' && WEEKDAYS.includes(plan.pythonWeekday) ? plan.pythonWeekday : '' }
  : null;

export const groupLessonStudyTrack = (group, entry) => {
  const plan = normalizeGroupStudyPlan(group?.studyPlan);
  if (!plan) return '';
  const weekday = entry?.participationSlot?.split('|')[0] || entry?.weekdayKey;
  return plan.mode === 'split' && weekday === plan.pythonWeekday ? 'python' : 'ege';
};

const moscowDay = ms => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);
const weekOf = ms => {
  const local = new Date(ms + 3 * 3600000);
  return moscowDay(ms - ((local.getUTCDay() + 6) % 7) * DAY);
};

export const groupHomeworkStudyTrackAt = (group, nowMs = Date.now(), lessons = []) => {
  const plan = normalizeGroupStudyPlan(group?.studyPlan);
  if (plan?.mode !== 'split') return 'ege';
  const lesson = lessons.find(entry => (!entry.groupId || entry.groupId === group.id)
    && entry.status !== 'cancelled' && Number.isFinite(Date.parse(entry.startAt))
    && moscowDay(Date.parse(entry.startAt)) === moscowDay(Number(nowMs)));
  if (lesson) {
    const slot = lesson.participationSlot ? lesson : group.schedule?.find(entry => entry.id === lesson.scheduleEntryId);
    if (slot) return groupLessonStudyTrack(group, slot);
  }
  const weekday = WEEKDAYS[new Date(Number(nowMs) + 3 * 3600000).getUTCDay()];
  return weekday === plan.pythonWeekday ? 'python' : 'ege';
};

// Use the configured direction, not a lesson's editable title. Known cancelled
// or moved occurrences override their weekly slot without creating new lessons.
export const groupHomeworkLessonChoices = (group, track = 'ege', nowMs = Date.now(), lessons = []) => {
  const plan = normalizeGroupStudyPlan(group?.studyPlan);
  if (!plan) return weeklyHomeworkLessonChoices(group?.schedule, nowMs);
  const now = Number(nowMs);
  const local = new Date(now + 3 * 3600000);
  const choices = [];
  for (const entry of group?.schedule || []) {
    if (plan.mode === 'split' && groupLessonStudyTrack(group, entry) !== track) continue;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time || '')) continue;
    const weekday = WEEKDAYS.indexOf(entry.weekdayKey);
    if (!entry.date && weekday < 0) continue;
    const firstDay = entry.date || moscowDay(now + ((weekday - local.getUTCDay() + 7) % 7) * DAY);
    const first = Date.parse(`${firstDay}T${entry.time}:00+03:00`);
    if (!Number.isFinite(first)) continue;
    for (let week = 0; week < (entry.date ? 1 : 4); week += 1) {
      const nominal = first + week * 7 * DAY;
      const slot = `${entry.weekdayKey}|${entry.time}`;
      const known = lessons.find(lesson => (!lesson.groupId || lesson.groupId === group.id)
        && (lesson.scheduleEntryId === entry.id || lesson.participationSlot === slot)
        && Number.isFinite(Date.parse(lesson.startAt)) && weekOf(Date.parse(lesson.startAt)) === weekOf(nominal));
      if (known && ['cancelled', 'completed'].includes(known.status)) continue;
      const due = known ? Date.parse(known.startAt) : nominal;
      if (due <= now || moscowDay(due) === moscowDay(now)) continue;
      choices.push({ dueAt: new Date(due).toISOString(), subject: entry.subject || '', studyTrack: groupLessonStudyTrack(group, entry), lessonId: known?.id || '' });
    }
  }
  return choices.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .filter((choice, index, list) => !index || choice.dueAt !== list[index - 1].dueAt);
};

export const groupHomeworkDefaultDueAt = (group, track = 'ege', now = Date.now(), lessons = []) => (
  normalizeGroupStudyPlan(group?.studyPlan)
    ? groupHomeworkLessonChoices(group, track, now, lessons)[0]?.dueAt || ''
    : weeklyHomeworkDeadline(now)
);
