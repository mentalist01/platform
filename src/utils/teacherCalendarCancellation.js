const CANCELLATION_MARK_PREFIX = 'calendar-cancelled';
const CANCELLATION_STATUS_VALUES = new Set(['cancelled', 'canceled']);

const normalizeText = (value) => String(value ?? '').trim();

const normalizeDayKey = (value) => {
  const text = normalizeText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) return '';
  return text;
};

const normalizeTime = (value) => {
  const match = normalizeText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const encodePart = (value) => encodeURIComponent(normalizeText(value));

const decodePart = (value) => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return '';
  }
};

const getSourceId = (entry) => normalizeText(entry?.externalEventId || entry?.id);

const getScopeId = (entry) => {
  const groupId = normalizeText(entry?.groupId);
  if (groupId) return `group:${groupId}`;
  const studentId = normalizeText(entry?.studentId);
  if (studentId) return `student:${studentId}`;
  return 'teacher';
};

export const buildTeacherCalendarCancellationMarkKey = (
  teacherId,
  entry,
  dayKey = entry?.dayKey || entry?.date
) => {
  const normalizedTeacherId = normalizeText(teacherId);
  const sourceId = getSourceId(entry);
  const normalizedDayKey = normalizeDayKey(dayKey);
  const time = normalizeTime(entry?.time);
  if (!normalizedTeacherId || !sourceId || !normalizedDayKey || !time) return '';
  return [
    CANCELLATION_MARK_PREFIX,
    encodePart(normalizedTeacherId),
    encodePart(sourceId),
    normalizedDayKey,
    encodePart(getScopeId(entry)),
    time,
  ].join('|');
};

export const parseTeacherCalendarCancellationMarkKey = (value) => {
  const parts = normalizeText(value).split('|');
  if (parts.length !== 6 || parts[0] !== CANCELLATION_MARK_PREFIX) return null;
  const teacherId = decodePart(parts[1]);
  const sourceId = decodePart(parts[2]);
  const dayKey = normalizeDayKey(parts[3]);
  const scopeId = decodePart(parts[4]);
  const time = normalizeTime(parts[5]);
  if (!teacherId || !sourceId || !dayKey || !scopeId || !time) return null;
  return { teacherId, sourceId, dayKey, scopeId, time };
};

export const isCalendarLessonCancelledStatus = (entry) => Boolean(
  entry?.cancelled
  || entry?.isCancelled
  || CANCELLATION_STATUS_VALUES.has(normalizeText(entry?.status || entry?.lessonStatus).toLowerCase())
);
export const getTeacherCalendarCancelledDates = (teacherId, entry, marks = {}) => {
  const normalizedMarks = marks && typeof marks === 'object' && !Array.isArray(marks) ? marks : {};
  return Array.from(new Set(
    Object.keys(normalizedMarks)
      .map(parseTeacherCalendarCancellationMarkKey)
      .filter(Boolean)
      .filter((mark) => (
        mark.teacherId === normalizeText(teacherId)
        && mark.sourceId === getSourceId(entry)
        && mark.scopeId === getScopeId(entry)
        && mark.time === normalizeTime(entry?.time)
      ))
      .map((mark) => mark.dayKey)
  )).sort((left, right) => left.localeCompare(right));
};

export const isTeacherCalendarLessonCancelled = (teacherId, entry, dayKey, marks = {}) => {
  if (isCalendarLessonCancelledStatus(entry)) return true;
  const normalizedDayKey = normalizeDayKey(dayKey || entry?.dayKey || entry?.date);
  if (!normalizedDayKey) return false;
  const key = buildTeacherCalendarCancellationMarkKey(teacherId, entry, normalizedDayKey);
  if (key && marks?.[key]) return true;
  const cancelledDates = Array.isArray(entry?.cancelledDates) ? entry.cancelledDates : [];
  return cancelledDates.some((value) => normalizeDayKey(value) === normalizedDayKey);
};

export const annotateTeacherCalendarCancellation = (teacherId, entry, marks = {}) => {
  if (!entry || typeof entry !== 'object') return entry;
  const cancelledDates = getTeacherCalendarCancelledDates(teacherId, entry, marks);
  const explicitDayKey = normalizeDayKey(entry?.date || entry?.dayKey);
  const cancelled = isCalendarLessonCancelledStatus(entry)
    || Boolean(explicitDayKey && cancelledDates.includes(explicitDayKey));
  return {
    ...entry,
    ...(cancelledDates.length > 0 ? { cancelledDates } : {}),
    ...(cancelled ? { cancelled: true, isCancelled: true, status: 'cancelled' } : {}),
  };
};

export const filterTeacherCalendarCancelledSchedule = (teacherId, entries = [], marks = {}) => (
  (Array.isArray(entries) ? entries : [])
    .map((entry) => annotateTeacherCalendarCancellation(teacherId, entry, marks))
    .map((entry) => {
      const explicitDayKey = normalizeDayKey(entry?.date || entry?.dayKey);
      if (explicitDayKey && isTeacherCalendarLessonCancelled(teacherId, entry, explicitDayKey, marks)) {
        return null;
      }
      const cancelledDates = getTeacherCalendarCancelledDates(teacherId, entry, marks);
      if (cancelledDates.length === 0) return entry;
      return {
        ...entry,
        excludedDates: Array.from(new Set([
          ...(Array.isArray(entry?.excludedDates) ? entry.excludedDates.map(normalizeDayKey).filter(Boolean) : []),
          ...cancelledDates,
        ])).sort((left, right) => left.localeCompare(right)),
      };
    })
    .filter(Boolean)
);
