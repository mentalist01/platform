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
const frozenCancellationIndexes = new WeakMap();
const cancellationScopeKey = (teacherId, sourceId, scopeId, time) => (
  JSON.stringify([teacherId, sourceId, scopeId, time])
);
const getCancellationIndex = (marks) => {
  const frozen = Object.isFrozen(marks);
  if (frozen && frozenCancellationIndexes.has(marks)) return frozenCancellationIndexes.get(marks);
  const index = new Map();
  Object.keys(marks).forEach((key) => {
    if (!key.startsWith(`${CANCELLATION_MARK_PREFIX}|`)) return;
    const mark = parseTeacherCalendarCancellationMarkKey(key);
    if (!mark) return;
    const scope = cancellationScopeKey(mark.teacherId, mark.sourceId, mark.scopeId, mark.time);
    if (!index.has(scope)) index.set(scope, new Set());
    index.get(scope).add(mark.dayKey);
  });
  const result = new Map([...index].map(([key, dates]) => [key, [...dates].sort((a, b) => a.localeCompare(b))]));
  if (frozen) frozenCancellationIndexes.set(marks, result);
  return result;
};
export const getTeacherCalendarCancelledDates = (teacherId, entry, marks = {}) => {
  const normalizedMarks = marks && typeof marks === 'object' && !Array.isArray(marks) ? marks : {};
  const scope = cancellationScopeKey(normalizeText(teacherId), getSourceId(entry), getScopeId(entry), normalizeTime(entry?.time));
  return [...(getCancellationIndex(normalizedMarks).get(scope) || [])];
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

export const filterTeacherCalendarCancelledSchedule = (teacherId, entries = [], marks = {}) => {
  // One snapshot/index for the whole schedule; callers may edit their marks later.
  const snapshot = marks && typeof marks === 'object' && !Array.isArray(marks)
    ? (Object.isFrozen(marks) ? marks : Object.freeze({ ...marks }))
    : Object.freeze({});
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => annotateTeacherCalendarCancellation(teacherId, entry, snapshot))
    .map((entry) => {
      const explicitDayKey = normalizeDayKey(entry?.date || entry?.dayKey);
      if (explicitDayKey && isTeacherCalendarLessonCancelled(teacherId, entry, explicitDayKey, snapshot)) {
        return null;
      }
      const cancelledDates = getTeacherCalendarCancelledDates(teacherId, entry, snapshot);
      if (cancelledDates.length === 0) return entry;
      return {
        ...entry,
        excludedDates: Array.from(new Set([
          ...(Array.isArray(entry?.excludedDates) ? entry.excludedDates.map(normalizeDayKey).filter(Boolean) : []),
          ...cancelledDates,
        ])).sort((left, right) => left.localeCompare(right)),
      };
    })
    .filter(Boolean);
};
