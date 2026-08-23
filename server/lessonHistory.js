import {
  buildLessonTopicOccurrenceKey,
  normalizeLessonDayKey,
  normalizeLessonTime,
  normalizeLessonTopicText,
  zonedLessonDateTimeToUtcMs,
} from './lessonTopics.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_HISTORY_PAGE_SIZE = 12;
const MAX_HISTORY_PAGE_SIZE = 50;
const FALLBACK_HISTORY_DAYS = 10 * 366;

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeDurationMinutes = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 15
    ? Math.min(360, Math.round(parsed))
    : 60;
};

const dayKeyToNumber = (value) => {
  const dayKey = normalizeLessonDayKey(value);
  if (!dayKey) return NaN;
  const [year, month, day] = dayKey.split('-').map(Number);
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
  const normalized = String(entry?.weekdayKey || '').trim().toLowerCase();
  return byKey[normalized] || getWeekdayOrder(entry?.date || entry?.dayKey);
};

const timestampToDayKey = (value, timeZone) => {
  const timestamp = Date.parse(String(value || '').trim());
  if (!Number.isFinite(timestamp)) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp)).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return normalizeLessonDayKey(`${parts.year}-${parts.month}-${parts.day}`);
};

const isCancelledScheduleEntry = (entry) => Boolean(
  entry?.cancelled
  || entry?.isCancelled
  || String(entry?.status || '').trim().toLowerCase() === 'cancelled'
  || String(entry?.status || '').trim().toLowerCase() === 'canceled'
);

const normalizeTopicSnapshot = (value) => {
  if (!isPlainObject(value)) return null;
  const text = normalizeLessonTopicText(value.text);
  if (!text) return null;
  const source = value.source === 'teacher' ? 'teacher' : (value.source === 'notes' ? 'notes' : 'notes');
  const taskNumbers = Array.from(new Set(
    (Array.isArray(value.taskNumbers) ? value.taskNumbers : [])
      .map((entry) => Number(entry))
      .filter(Number.isFinite)
  ));
  const updatedAtMs = Date.parse(String(value.updatedAt || '').trim());
  return {
    text,
    source,
    taskNumbers,
    updatedAt: Number.isFinite(updatedAtMs) ? new Date(updatedAtMs).toISOString() : '',
  };
};

export const normalizeLessonHistoryRecord = (value, { timeZone = 'Europe/Moscow' } = {}) => {
  if (!isPlainObject(value)) return null;
  const studentId = String(value.studentId || '').trim();
  const dayKey = normalizeLessonDayKey(value.dayKey || value.date);
  const time = normalizeLessonTime(value.time);
  const durationMinutes = normalizeDurationMinutes(value.durationMinutes);
  const key = buildLessonTopicOccurrenceKey({ studentId, dayKey, time, durationMinutes });
  if (!key) return null;
  const startMs = zonedLessonDateTimeToUtcMs(dayKey, time, timeZone);
  if (!Number.isFinite(startMs)) return null;
  const recordedAtMs = Date.parse(String(value.recordedAt || '').trim());
  const groupId = String(value.groupId || '').trim().slice(0, 160);
  const lessonId = String(value.lessonId || value.learningLessonId || '').trim().slice(0, 160);
  const participantIds = Array.from(new Set(
    (Array.isArray(value.participantIds) ? value.participantIds : [])
      .map((entry) => String(entry || '').trim().slice(0, 160))
      .filter(Boolean)
  )).slice(0, 5);
  const replayKey = String(value.replayKey || '').trim().slice(0, 760);
  return {
    key,
    studentId,
    dayKey,
    time,
    durationMinutes,
    startMs,
    endMs: startMs + (durationMinutes * MINUTE_MS),
    subject: String(value.subject || '').trim().slice(0, 240),
    lessonLink: String(value.lessonLink || '').trim().slice(0, 2000),
    sourceEntryId: String(value.sourceEntryId || '').trim().slice(0, 320),
    sourceSignature: String(value.sourceSignature || '').trim().slice(0, 700),
    source: String(value.source || 'snapshot').trim().slice(0, 80) || 'snapshot',
    ...(groupId ? {
      groupId,
      groupName: String(value.groupName || '').trim().slice(0, 240),
      lessonId,
      participantIds,
      replayKey,
    } : {}),
    topic: normalizeTopicSnapshot(value.topic),
    recordedAt: Number.isFinite(recordedAtMs) ? new Date(recordedAtMs).toISOString() : '',
  };
};

export const normalizeLessonHistoryTombstone = (value, { fallbackKey = '' } = {}) => {
  const source = isPlainObject(value) ? value : {};
  const rawKey = String(source.key || fallbackKey || '').trim();
  const keyParts = rawKey.split('|');
  const durationFromKey = keyParts.length >= 4 ? keyParts.pop() : '';
  const timeFromKey = keyParts.length >= 3 ? keyParts.pop() : '';
  const dayKeyFromKey = keyParts.length >= 2 ? keyParts.pop() : '';
  const studentIdFromKey = keyParts.join('|');
  const studentId = String(source.studentId || studentIdFromKey || '').trim();
  const dayKey = normalizeLessonDayKey(source.dayKey || source.date || dayKeyFromKey);
  const time = normalizeLessonTime(source.time || timeFromKey);
  const durationMinutes = normalizeDurationMinutes(source.durationMinutes || durationFromKey);
  const key = buildLessonTopicOccurrenceKey({ studentId, dayKey, time, durationMinutes });
  if (!key) return null;
  const recordedAtMs = Date.parse(String(source.recordedAt || '').trim());
  return {
    key,
    studentId,
    dayKey,
    time,
    durationMinutes,
    recordedAt: Number.isFinite(recordedAtMs) ? new Date(recordedAtMs).toISOString() : '',
  };
};

export const normalizeLessonHistoryStore = (value, options = {}) => {
  const source = isPlainObject(value) ? value : {};
  const hasEnvelope = Object.hasOwn(source, 'occurrences') || Object.hasOwn(source, 'tombstones');
  const occurrenceSource = isPlainObject(source.occurrences)
    ? source.occurrences
    : (hasEnvelope ? {} : source);
  const occurrences = {};
  Object.values(occurrenceSource).forEach((entry) => {
    const normalized = normalizeLessonHistoryRecord(entry, options);
    if (normalized) occurrences[normalized.key] = normalized;
  });
  const tombstones = {};
  const tombstoneSource = Array.isArray(source.tombstones)
    ? source.tombstones.map((entry) => ['', entry])
    : Object.entries(isPlainObject(source.tombstones) ? source.tombstones : {});
  tombstoneSource.forEach(([fallbackKey, entry]) => {
    const normalized = normalizeLessonHistoryTombstone(entry, { fallbackKey });
    if (normalized) tombstones[normalized.key] = normalized;
  });
  return { occurrences, tombstones };
};

export const collectLessonHistoryTombstones = ({
  studentId,
  schedule = [],
  recordedAt = new Date().toISOString(),
  timeZone = 'Europe/Moscow',
} = {}) => {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) return {};
  const recordedAtMs = Date.parse(String(recordedAt || '').trim());
  const normalizedRecordedAt = Number.isFinite(recordedAtMs)
    ? new Date(recordedAtMs).toISOString()
    : new Date().toISOString();
  const tombstones = {};

  const addTombstone = (dayKeyValue, time, durationMinutes) => {
    const dayKey = normalizeLessonDayKey(dayKeyValue);
    const key = buildLessonTopicOccurrenceKey({
      studentId: normalizedStudentId,
      dayKey,
      time,
      durationMinutes,
    });
    if (!key) return;
    tombstones[key] = {
      key,
      studentId: normalizedStudentId,
      dayKey,
      time,
      durationMinutes,
      recordedAt: normalizedRecordedAt,
    };
  };

  (Array.isArray(schedule) ? schedule : []).forEach((entry) => {
    if (!isPlainObject(entry)) return;
    const time = normalizeLessonTime(entry.time);
    if (!time) return;
    const durationMinutes = normalizeDurationMinutes(entry.durationMinutes);
    (Array.isArray(entry.excludedDates) ? entry.excludedDates : [])
      .forEach((dayKey) => addTombstone(dayKey, time, durationMinutes));
    if (!isCancelledScheduleEntry(entry)) return;
    const explicitDayKey = normalizeLessonDayKey(entry.date || entry.dayKey)
      || timestampToDayKey(entry.startAt || entry.start || entry.startTime, timeZone);
    if (explicitDayKey) addTombstone(explicitDayKey, time, durationMinutes);
  });

  return tombstones;
};

const buildSourceSignature = (studentId, entry, time, durationMinutes) => {
  const explicitDayKey = normalizeLessonDayKey(entry?.date || entry?.dayKey);
  const scheduleKey = explicitDayKey || String(entry?.weekdayKey || getScheduleWeekdayOrder(entry) || '').trim();
  return `${studentId}:${scheduleKey}:${time}:${durationMinutes}`;
};

const mergeOccurrence = (map, rawValue, priority, nowMs, timeZone, excludedKeys = new Set()) => {
  const normalized = normalizeLessonHistoryRecord(rawValue, { timeZone });
  if (!normalized || normalized.endMs > nowMs || excludedKeys.has(normalized.key)) return;
  const previous = map.get(normalized.key);
  if (!previous) {
    map.set(normalized.key, { ...normalized, _priority: priority });
    return;
  }
  const preferIncoming = priority >= previous._priority;
  map.set(normalized.key, {
    ...previous,
    ...(preferIncoming ? normalized : {}),
    subject: (preferIncoming ? normalized.subject : previous.subject) || previous.subject || normalized.subject,
    lessonLink: (preferIncoming ? normalized.lessonLink : previous.lessonLink) || previous.lessonLink || normalized.lessonLink,
    sourceEntryId: (preferIncoming ? normalized.sourceEntryId : previous.sourceEntryId) || previous.sourceEntryId || normalized.sourceEntryId,
    sourceSignature: (preferIncoming ? normalized.sourceSignature : previous.sourceSignature) || previous.sourceSignature || normalized.sourceSignature,
    topic: normalized.topic || previous.topic || null,
    recordedAt: previous.recordedAt || normalized.recordedAt,
    _priority: Math.max(previous._priority, priority),
  });
};

export const buildStudentLessonHistory = ({
  studentId,
  studentCreatedAt,
  schedule = [],
  ledgerEntries = [],
  manualTopics = [],
  storedOccurrences = [],
  tombstones = [],
  nowMs = Date.now(),
  timeZone = 'Europe/Moscow',
} = {}) => {
  const normalizedStudentId = String(studentId || '').trim();
  const normalizedNowMs = Number(nowMs);
  if (!normalizedStudentId || !Number.isFinite(normalizedNowMs)) return [];

  const todayDayKey = timestampToDayKey(new Date(normalizedNowMs).toISOString(), timeZone);
  const todayNumber = dayKeyToNumber(todayDayKey);
  if (!Number.isFinite(todayNumber)) return [];

  const excludedOccurrenceKeys = new Set();
  const tombstoneSource = Array.isArray(tombstones)
    ? tombstones.map((entry) => ['', entry])
    : Object.entries(isPlainObject(tombstones) ? tombstones : {});
  tombstoneSource.forEach(([fallbackKey, entry]) => {
    const normalized = normalizeLessonHistoryTombstone(entry, { fallbackKey });
    if (normalized?.studentId === normalizedStudentId) excludedOccurrenceKeys.add(normalized.key);
  });
  Object.keys(collectLessonHistoryTombstones({
    studentId: normalizedStudentId,
    schedule,
    recordedAt: new Date(normalizedNowMs).toISOString(),
    timeZone,
  })).forEach((key) => excludedOccurrenceKeys.add(key));

  const occurrenceMap = new Map();
  const stored = (Array.isArray(storedOccurrences) ? storedOccurrences : Object.values(storedOccurrences || {}))
    .map((entry) => normalizeLessonHistoryRecord(entry, { timeZone }))
    .filter((entry) => entry?.studentId === normalizedStudentId && !excludedOccurrenceKeys.has(entry.key));
  stored.forEach((entry) => mergeOccurrence(occurrenceMap, entry, 2, normalizedNowMs, timeZone, excludedOccurrenceKeys));

  const normalizedLedgerEntries = (Array.isArray(ledgerEntries) ? ledgerEntries : Object.values(ledgerEntries || {}))
    .map((entry) => normalizeLessonHistoryRecord({ ...entry, studentId: entry?.studentId || normalizedStudentId, source: 'finance-ledger' }, { timeZone }))
    .filter((entry) => entry?.studentId === normalizedStudentId);
  normalizedLedgerEntries.forEach((entry) => mergeOccurrence(occurrenceMap, entry, 1, normalizedNowMs, timeZone, excludedOccurrenceKeys));

  const evidenceBySourceEntryId = new Map();
  [...stored, ...normalizedLedgerEntries].forEach((entry) => {
    if (!entry.sourceEntryId) return;
    const list = evidenceBySourceEntryId.get(entry.sourceEntryId) || [];
    list.push(entry);
    evidenceBySourceEntryId.set(entry.sourceEntryId, list);
  });

  const studentStartDayKey = timestampToDayKey(studentCreatedAt, timeZone);
  const studentStartNumber = dayKeyToNumber(studentStartDayKey);
  const fallbackStartNumber = todayNumber - FALLBACK_HISTORY_DAYS;

  (Array.isArray(schedule) ? schedule : []).forEach((entry) => {
    if (!isPlainObject(entry)) return;
    const time = normalizeLessonTime(entry.time);
    if (!time) return;
    const durationMinutes = normalizeDurationMinutes(entry.durationMinutes);
    const sourceEntryId = String(entry.id || entry.externalEventId || '').trim();
    const sourceSignature = buildSourceSignature(normalizedStudentId, entry, time, durationMinutes);
    const explicitDayKey = normalizeLessonDayKey(entry.date || entry.dayKey);
    const excludedDates = new Set(
      (Array.isArray(entry.excludedDates) ? entry.excludedDates : [])
        .map((value) => normalizeLessonDayKey(value))
        .filter(Boolean)
    );
    excludedDates.forEach((dayKey) => {
      const key = buildLessonTopicOccurrenceKey({ studentId: normalizedStudentId, dayKey, time, durationMinutes });
      if (key) excludedOccurrenceKeys.add(key);
    });
    if (isCancelledScheduleEntry(entry)) {
      if (explicitDayKey) {
        const key = buildLessonTopicOccurrenceKey({ studentId: normalizedStudentId, dayKey: explicitDayKey, time, durationMinutes });
        if (key) excludedOccurrenceKeys.add(key);
      }
      return;
    }

    const entryCreatedNumber = dayKeyToNumber(timestampToDayKey(entry.createdAt, timeZone));
    let seriesStartNumber = Math.max(
      Number.isFinite(studentStartNumber) ? studentStartNumber : fallbackStartNumber,
      Number.isFinite(entryCreatedNumber) ? entryCreatedNumber : fallbackStartNumber
    );
    const sourceEvidence = sourceEntryId ? (evidenceBySourceEntryId.get(sourceEntryId) || []) : [];
    const sourceChanged = sourceEvidence.some((evidence) => (
      evidence.sourceSignature && evidence.sourceSignature !== sourceSignature
    ));
    if (sourceChanged && !explicitDayKey) {
      const updatedNumber = dayKeyToNumber(timestampToDayKey(entry.updatedAt, timeZone));
      if (Number.isFinite(updatedNumber)) seriesStartNumber = Math.max(seriesStartNumber, updatedNumber);
    }

    const weekdayOrder = getScheduleWeekdayOrder(entry);
    const fromNumber = explicitDayKey ? dayKeyToNumber(explicitDayKey) : seriesStartNumber;
    const toNumber = explicitDayKey ? fromNumber : todayNumber;
    if (!Number.isFinite(fromNumber) || !Number.isFinite(toNumber) || toNumber < fromNumber) return;
    if (explicitDayKey && Number.isFinite(studentStartNumber) && fromNumber < studentStartNumber) return;

    for (let dayNumber = fromNumber; dayNumber <= toNumber; dayNumber += 1) {
      const dayKey = numberToDayKey(dayNumber);
      if (explicitDayKey ? dayKey !== explicitDayKey : getWeekdayOrder(dayKey) !== weekdayOrder) continue;
      if (excludedDates.has(dayKey)) continue;
      mergeOccurrence(occurrenceMap, {
        studentId: normalizedStudentId,
        dayKey,
        time,
        durationMinutes,
        subject: entry.subject || entry.title || '',
        lessonLink: entry.lessonLink || '',
        sourceEntryId,
        sourceSignature,
        source: entry.source || (entry.isExternalCalendarEvent ? 'google-calendar' : 'schedule'),
        groupId: entry.groupId,
        groupName: entry.groupName,
        lessonId: entry.lessonId || entry.learningLessonId,
        participantIds: entry.participantIds,
        replayKey: entry.replayKey,
      }, entry.isExternalCalendarEvent ? 4 : 3, normalizedNowMs, timeZone, excludedOccurrenceKeys);
    }
  });

  const topics = Array.isArray(manualTopics) ? manualTopics : Object.values(manualTopics || {});
  topics.forEach((entry) => {
    if (String(entry?.studentId || '').trim() !== normalizedStudentId) return;
    mergeOccurrence(occurrenceMap, {
      studentId: normalizedStudentId,
      dayKey: entry.dayKey,
      time: entry.time,
      durationMinutes: entry.durationMinutes,
      source: 'manual-topic',
      topic: {
        text: entry.text,
        source: 'teacher',
        taskNumbers: [],
        updatedAt: entry.updatedAt || entry.createdAt || '',
      },
    }, 0, normalizedNowMs, timeZone, excludedOccurrenceKeys);
  });

  excludedOccurrenceKeys.forEach((key) => occurrenceMap.delete(key));

  return Array.from(occurrenceMap.values())
    .map(({ _priority, ...entry }) => entry)
    .sort((left, right) => (
      (right.startMs - left.startMs) || right.key.localeCompare(left.key, 'ru')
    ));
};

export const paginateStudentLessonHistory = (items, options = {}) => {
  const parsedOffset = Number(options.offset);
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? Math.floor(parsedOffset) : 0;
  const parsedLimit = Number(options.limit);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(MAX_HISTORY_PAGE_SIZE, Math.floor(parsedLimit))
    : DEFAULT_HISTORY_PAGE_SIZE;
  const source = Array.isArray(items) ? items : [];
  const pageItems = source.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    items: pageItems,
    total: source.length,
    hasMore: nextOffset < source.length,
    nextOffset: nextOffset < source.length ? nextOffset : null,
  };
};
