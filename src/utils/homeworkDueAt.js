const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKAHEAD_WEEKS = 16;

export const HOMEWORK_DUE_AT_MODE_MANUAL = 'manual';
export const HOMEWORK_DUE_AT_MODE_NEXT_LESSON = 'next-lesson';

const WEEKDAY_ORDER_BY_KEY = Object.freeze({
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
  'понедельник': 1,
  'вторник': 2,
  'среда': 3,
  'четверг': 4,
  'пятница': 5,
  'суббота': 6,
  'воскресенье': 7,
});

const parseDayKey = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const formatDayKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekdayOrder = (date) => {
  const weekday = date.getDay();
  return weekday === 0 ? 7 : weekday;
};

const resolveEntryWeekdayOrder = (entry) => {
  const numeric = Number(entry?.weekdayOrder);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) return numeric;
  const key = String(entry?.weekdayKey || entry?.day || '').trim().toLowerCase();
  return WEEKDAY_ORDER_BY_KEY[key] || null;
};

const parseEntryTime = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
};

const isEntryOnDay = (entry, date, dayKey) => {
  const explicitDay = String(entry?.date || '').trim();
  if (explicitDay) return Boolean(parseDayKey(explicitDay)) && explicitDay === dayKey;
  const weekdayOrder = resolveEntryWeekdayOrder(entry);
  if (weekdayOrder !== getWeekdayOrder(date)) return false;
  const excludedDates = Array.isArray(entry?.excludedDates) ? entry.excludedDates : [];
  return !excludedDates.some((value) => String(value || '').trim() === dayKey);
};

export const normalizeHomeworkDueAtMode = (value) => (
  String(value || '').trim().toLowerCase() === HOMEWORK_DUE_AT_MODE_NEXT_LESSON
    ? HOMEWORK_DUE_AT_MODE_NEXT_LESSON
    : HOMEWORK_DUE_AT_MODE_MANUAL
);

export const isLessonStartInSchedule = (entries, value) => {
  const target = value instanceof Date ? new Date(value) : new Date(value || '');
  if (Number.isNaN(target.getTime())) return false;
  const targetDayKey = formatDayKey(target);
  return (Array.isArray(entries) ? entries : []).some((entry) => {
    if (!entry || typeof entry !== 'object' || !isEntryOnDay(entry, target, targetDayKey)) return false;
    const time = parseEntryTime(entry.time);
    return Boolean(
      time
      && time.hours === target.getHours()
      && time.minutes === target.getMinutes()
    );
  });
};

export const resolveNextLessonStart = (
  entries,
  { now = new Date(), lookaheadWeeks = DEFAULT_LOOKAHEAD_WEEKS } = {}
) => {
  const reference = now instanceof Date ? new Date(now) : new Date(now || '');
  if (Number.isNaN(reference.getTime())) return null;
  const schedule = Array.isArray(entries) ? entries : [];
  const normalizedWeeks = Number.isFinite(Number(lookaheadWeeks))
    ? Math.max(0, Math.trunc(Number(lookaheadWeeks)))
    : DEFAULT_LOOKAHEAD_WEEKS;
  const lastDayOffset = (normalizedWeeks * 7) + 6;
  const startOfToday = new Date(reference);
  startOfToday.setHours(0, 0, 0, 0);
  let nearest = null;

  for (let dayOffset = 0; dayOffset <= lastDayOffset; dayOffset += 1) {
    const date = new Date(startOfToday);
    date.setDate(startOfToday.getDate() + dayOffset);
    const dayKey = formatDayKey(date);
    schedule.forEach((entry) => {
      if (!entry || typeof entry !== 'object' || !isEntryOnDay(entry, date, dayKey)) return;
      const time = parseEntryTime(entry.time);
      if (!time) return;
      const start = new Date(date);
      start.setHours(time.hours, time.minutes, 0, 0);
      if (start.getTime() <= reference.getTime()) return;
      if (!nearest || start.getTime() < nearest.getTime()) nearest = start;
    });
    if (nearest) break;
  }

  return nearest;
};

export const buildHomeworkDueAtFromSchedule = (
  entries,
  { now = new Date(), fallbackDays = 7, lookaheadWeeks = DEFAULT_LOOKAHEAD_WEEKS } = {}
) => {
  const reference = now instanceof Date ? new Date(now) : new Date(now || '');
  const safeReference = Number.isNaN(reference.getTime()) ? new Date() : reference;
  const nextLesson = resolveNextLessonStart(entries, { now: safeReference, lookaheadWeeks });
  if (nextLesson) return nextLesson;
  const days = Number(fallbackDays);
  const normalizedDays = Number.isFinite(days) && days > 0 ? days : 7;
  return new Date(safeReference.getTime() + (normalizedDays * DAY_MS));
};
