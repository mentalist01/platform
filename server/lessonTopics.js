const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const LESSON_TOPIC_TEXT_MAX_LENGTH = 320;
export const LESSON_NOTE_ACTIVITY_LIMIT = 20000;
export const LESSON_NOTE_LEAD_MS = 10 * MINUTE_MS;
export const LESSON_NOTE_TAIL_MS = 20 * MINUTE_MS;

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const normalizeLessonDayKey = (value) => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return '';
  }
  return normalized;
};

export const normalizeLessonTime = (value) => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const normalizeLessonTopicText = (value) => (
  String(value || '')
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, LESSON_TOPIC_TEXT_MAX_LENGTH)
);

const normalizeStudentId = (value) => String(value || '').trim();

export const buildLessonTopicOccurrenceKey = ({ studentId, dayKey, time, durationMinutes = 60 } = {}) => {
  const normalizedStudentId = normalizeStudentId(studentId);
  const normalizedDayKey = normalizeLessonDayKey(dayKey);
  const normalizedTime = normalizeLessonTime(time);
  const rawDuration = Number(durationMinutes);
  const normalizedDuration = Number.isFinite(rawDuration) && rawDuration >= 15
    ? Math.min(360, Math.round(rawDuration))
    : 60;
  if (!normalizedStudentId || !normalizedDayKey || !normalizedTime) return '';
  return [normalizedStudentId, normalizedDayKey, normalizedTime, normalizedDuration].join('|');
};

const normalizeIsoTimestamp = (value) => {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
};

export const normalizeLessonTopicRecord = (value) => {
  if (!isPlainObject(value)) return null;
  const studentId = normalizeStudentId(value.studentId);
  const dayKey = normalizeLessonDayKey(value.dayKey);
  const time = normalizeLessonTime(value.time);
  const durationMinutes = Number.isFinite(Number(value.durationMinutes))
    ? Math.min(360, Math.max(15, Math.round(Number(value.durationMinutes))))
    : 60;
  const text = normalizeLessonTopicText(value.text ?? value.topic);
  if (!studentId || !dayKey || !time || !text) return null;
  const key = buildLessonTopicOccurrenceKey({ studentId, dayKey, time, durationMinutes });
  if (!key) return null;
  return {
    key,
    studentId,
    teacherId: String(value.teacherId || '').trim(),
    dayKey,
    time,
    durationMinutes,
    text,
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt) || normalizeIsoTimestamp(value.createdAt),
    updatedById: String(value.updatedById || '').trim(),
    updatedByName: String(value.updatedByName || '').trim(),
  };
};

export const normalizeLessonNoteActivity = (value) => {
  if (!isPlainObject(value)) return null;
  const id = String(value.id || '').trim();
  const studentId = normalizeStudentId(value.studentId);
  const taskNumber = Number(value.taskNumber);
  const occurredAt = normalizeIsoTimestamp(value.occurredAt || value.createdAt);
  if (!id || !studentId || !Number.isFinite(taskNumber) || !occurredAt) return null;
  return {
    id,
    studentId,
    teacherId: String(value.teacherId || '').trim(),
    taskNumber,
    fileId: String(value.fileId || '').trim(),
    source: String(value.source || 'notes-save').trim().slice(0, 80) || 'notes-save',
    occurredAt,
  };
};

export const normalizeLessonTopicsStore = (value) => {
  const source = isPlainObject(value) ? value : {};
  const topicsSource = isPlainObject(source.topics) ? source.topics : source;
  const topics = {};
  Object.values(topicsSource).forEach((rawRecord) => {
    const record = normalizeLessonTopicRecord(rawRecord);
    if (record) topics[record.key] = record;
  });
  const seenActivities = new Set();
  const activities = (Array.isArray(source.activities) ? source.activities : [])
    .map((entry) => normalizeLessonNoteActivity(entry))
    .filter((entry) => {
      if (!entry || seenActivities.has(entry.id)) return false;
      seenActivities.add(entry.id);
      return true;
    })
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    .slice(-LESSON_NOTE_ACTIVITY_LIMIT);
  return { topics, activities };
};

const dayKeyToNumber = (value) => {
  const normalized = normalizeLessonDayKey(value);
  if (!normalized) return NaN;
  const [year, month, day] = normalized.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
};

const numberToDayKey = (value) => {
  if (!Number.isFinite(value)) return '';
  const date = new Date(Math.round(value) * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const getWeekdayOrder = (dayKey) => {
  const dayNumber = dayKeyToNumber(dayKey);
  if (!Number.isFinite(dayNumber)) return 0;
  const weekday = new Date(dayNumber * DAY_MS).getUTCDay();
  return weekday === 0 ? 7 : weekday;
};

const getScheduleWeekdayOrder = (entry) => {
  const explicit = Number(entry?.weekdayOrder);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 7) return Math.round(explicit);
  const byKey = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };
  const key = String(entry?.weekdayKey || '').trim().toLowerCase();
  if (byKey[key]) return byKey[key];
  return getWeekdayOrder(entry?.date);
};

const getTimeZoneOffsetMs = (timestampMs, timeZone) => {
  const date = new Date(timestampMs);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return zonedAsUtc - timestampMs;
};

export const zonedLessonDateTimeToUtcMs = (dayKey, time, timeZone = 'Europe/Moscow') => {
  const normalizedDayKey = normalizeLessonDayKey(dayKey);
  const normalizedTime = normalizeLessonTime(time);
  if (!normalizedDayKey || !normalizedTime) return NaN;
  const [year, month, day] = normalizedDayKey.split('-').map(Number);
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  let result = utcGuess - offset;
  const adjustedOffset = getTimeZoneOffsetMs(result, timeZone);
  if (adjustedOffset !== offset) {
    offset = adjustedOffset;
    result = utcGuess - offset;
  }
  return result;
};

export const expandLessonScheduleOccurrences = ({
  studentId,
  schedule = [],
  fromDayKey,
  toDayKey,
  timeZone = 'Europe/Moscow',
} = {}) => {
  const normalizedStudentId = normalizeStudentId(studentId);
  const fromNumber = dayKeyToNumber(fromDayKey);
  const toNumber = dayKeyToNumber(toDayKey);
  if (!normalizedStudentId || !Number.isFinite(fromNumber) || !Number.isFinite(toNumber) || toNumber < fromNumber) {
    return [];
  }
  const cappedToNumber = Math.min(toNumber, fromNumber + 186);
  const occurrences = [];
  const seen = new Set();
  (Array.isArray(schedule) ? schedule : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const time = normalizeLessonTime(entry.time);
    if (!time) return;
    const durationMinutes = Number.isFinite(Number(entry.durationMinutes))
      ? Math.min(360, Math.max(15, Math.round(Number(entry.durationMinutes))))
      : 60;
    const explicitDayKey = normalizeLessonDayKey(entry.date || entry.dayKey);
    const weekdayOrder = getScheduleWeekdayOrder(entry);
    const excludedDates = new Set(
      (Array.isArray(entry.excludedDates) ? entry.excludedDates : [])
        .map((value) => normalizeLessonDayKey(value))
        .filter(Boolean)
    );
    for (let dayNumber = fromNumber; dayNumber <= cappedToNumber; dayNumber += 1) {
      const dayKey = numberToDayKey(dayNumber);
      if (explicitDayKey ? dayKey !== explicitDayKey : getWeekdayOrder(dayKey) !== weekdayOrder) continue;
      if (excludedDates.has(dayKey)) continue;
      const key = buildLessonTopicOccurrenceKey({
        studentId: normalizedStudentId,
        dayKey,
        time,
        durationMinutes,
      });
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const startMs = zonedLessonDateTimeToUtcMs(dayKey, time, timeZone);
      if (!Number.isFinite(startMs)) continue;
      occurrences.push({
        key,
        studentId: normalizedStudentId,
        dayKey,
        time,
        durationMinutes,
        startMs,
        endMs: startMs + (durationMinutes * MINUTE_MS),
        sourceEntryId: String(entry.id || entry.externalEventId || '').trim(),
      });
    }
  });
  return occurrences.sort((left, right) => left.startMs - right.startMs);
};

const getLegacyFileStudentId = (file) => {
  const explicit = String(file?.lessonStudentId || file?.originalStudentId || '').trim();
  if (explicit) return explicit;
  if (file?.isLessonShared || file?.sharedScope) return '';
  return String(file?.studentId || '').trim();
};

const getLegacyFileActivityAt = (file) => {
  const candidates = [
    file?.lessonSavedAt,
    file?.memory?.boardSnapshot?.createdAt,
    file?.createdAt,
  ];
  let latest = '';
  let latestMs = NaN;
  candidates.forEach((value) => {
    const timestamp = Date.parse(String(value || '').trim());
    if (!Number.isFinite(timestamp) || (Number.isFinite(latestMs) && timestamp <= latestMs)) return;
    latestMs = timestamp;
    latest = new Date(timestamp).toISOString();
  });
  return latest;
};

const getDerivedTopicText = (taskNumbers) => {
  const values = (Array.isArray(taskNumbers) ? taskNumbers : []).map((value) => Number(value)).filter(Number.isFinite);
  if (values.length === 0) return '';
  if (values.length === 1) return `Задание №${values[0] === 19 ? '19–21' : values[0]}`;
  const visible = values.slice(0, 2).map((value) => (value === 19 ? '19–21' : String(value)));
  const rest = values.length - visible.length;
  return `Задания №${visible.join(', ')}${rest > 0 ? ` и ещё ${rest}` : ''}`;
};

export const resolveLessonTopicsForOccurrences = ({
  occurrences = [],
  manualTopics = {},
  activities = [],
  files = [],
} = {}) => {
  const manualByKey = isPlainObject(manualTopics) ? manualTopics : {};
  const normalizedActivities = (Array.isArray(activities) ? activities : [])
    .map((entry) => normalizeLessonNoteActivity(entry))
    .filter(Boolean);
  const storedActivitySignatures = new Set(
    normalizedActivities.map((entry) => [entry.fileId, entry.taskNumber, entry.occurredAt].join('|'))
  );
  const legacyActivities = (Array.isArray(files) ? files : [])
    .filter((file) => String(file?.category || '').trim() === 'class')
    .map((file) => {
      const studentId = getLegacyFileStudentId(file);
      const taskNumber = Number(file?.taskNumber);
      const occurredAt = getLegacyFileActivityAt(file);
      if (!studentId || !Number.isFinite(taskNumber) || !occurredAt) return null;
      return {
        id: `legacy:${String(file?.id || '').trim()}:${occurredAt}`,
        studentId,
        taskNumber,
        fileId: String(file?.id || '').trim(),
        source: 'legacy-file',
        occurredAt,
      };
    })
    .filter((entry) => (
      entry
      && !storedActivitySignatures.has([entry.fileId, entry.taskNumber, entry.occurredAt].join('|'))
    ));
  const allActivities = [...normalizedActivities, ...legacyActivities];
  const resolved = {};

  (Array.isArray(occurrences) ? occurrences : []).forEach((occurrence) => {
    const key = String(occurrence?.key || '').trim();
    if (!key) return;
    const manual = normalizeLessonTopicRecord(manualByKey[key]);
    if (manual) {
      resolved[key] = {
        text: manual.text,
        source: 'teacher',
        taskNumbers: [],
        updatedAt: manual.updatedAt || manual.createdAt || '',
      };
      return;
    }

    const startMs = Number(occurrence?.startMs);
    const endMs = Number(occurrence?.endMs);
    const studentId = String(occurrence?.studentId || '').trim();
    if (!studentId || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const taskActivity = new Map();
    allActivities.forEach((activity) => {
      if (activity.studentId !== studentId) return;
      const occurredAtMs = Date.parse(activity.occurredAt);
      if (
        !Number.isFinite(occurredAtMs)
        || occurredAtMs < startMs - LESSON_NOTE_LEAD_MS
        || occurredAtMs > endMs + LESSON_NOTE_TAIL_MS
      ) {
        return;
      }
      const taskNumber = Number(activity.taskNumber);
      if (!Number.isFinite(taskNumber)) return;
      const previous = taskActivity.get(taskNumber) || { count: 0, latestMs: 0 };
      taskActivity.set(taskNumber, {
        count: previous.count + 1,
        latestMs: Math.max(previous.latestMs, occurredAtMs),
      });
    });
    const taskNumbers = Array.from(taskActivity.entries())
      .sort((left, right) => (
        right[1].count - left[1].count
        || right[1].latestMs - left[1].latestMs
        || left[0] - right[0]
      ))
      .map(([taskNumber]) => taskNumber);
    if (taskNumbers.length === 0) return;
    const latestMs = Math.max(...Array.from(taskActivity.values()).map((entry) => entry.latestMs));
    resolved[key] = {
      text: getDerivedTopicText(taskNumbers),
      source: 'notes',
      taskNumbers,
      updatedAt: Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : '',
    };
  });

  return resolved;
};
