const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const normalizeText = (value) => String(value ?? '').trim();

const normalizeDayKey = (value) => {
  const normalized = normalizeText(value);
  return DAY_KEY_PATTERN.test(normalized) ? normalized : '';
};

const normalizeMinutes = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min((24 * 60) - 1, Math.round(numeric)));
};

const parseTimeToMinutes = (value) => {
  const match = normalizeText(value).match(TIME_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const getHomeworkSourceId = (entry, index) => (
  normalizeText(entry?.id)
  || normalizeText(entry?.issuedAt)
  || `homework-${index + 1}`
);

export const buildCalendarHomeworkProgressEntries = ({
  homeworks = [],
  statistics = [],
  getDateParts,
  nowMs = Date.now(),
} = {}) => {
  if (typeof getDateParts !== 'function') return [];
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const sourceById = new Map(
    (Array.isArray(homeworks) ? homeworks : []).map((entry, index) => [
      getHomeworkSourceId(entry, index),
      entry && typeof entry === 'object' ? entry : {},
    ])
  );

  return (Array.isArray(statistics) ? statistics : [])
    .map((entry) => {
      const homeworkId = normalizeText(entry?.id);
      const source = sourceById.get(homeworkId) || {};
      const dueAt = normalizeText(entry?.dueAt || source?.dueAt);
      const dueAtMs = Date.parse(dueAt);
      if (!Number.isFinite(dueAtMs) || dueAtMs < safeNowMs) return null;
      const issuedAt = normalizeText(entry?.issuedAt || source?.issuedAt);
      const issuedAtMs = Date.parse(issuedAt);
      const dueParts = getDateParts(new Date(dueAtMs));
      const dueDayKey = normalizeDayKey(dueParts?.dayKey);
      const dueMinutes = parseTimeToMinutes(dueParts?.time);
      if (!dueDayKey || dueMinutes == null) return null;

      return {
        homeworkId,
        title: normalizeText(entry?.title),
        issuedAt: Number.isFinite(issuedAtMs) ? new Date(issuedAtMs).toISOString() : '',
        dueAt: new Date(dueAtMs).toISOString(),
        dueDayKey,
        dueMinutes,
        percent: clampPercent(entry?.percent),
        completedCount: Math.max(0, Math.round(Number(entry?.completedCount) || 0)),
        totalCount: Math.max(0, Math.round(Number(entry?.totalCount) || 0)),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
};

export const findCalendarHomeworkProgressForOccurrence = (
  entries,
  dayKey,
  startMinutes
) => {
  const normalizedDayKey = normalizeDayKey(dayKey);
  const normalizedStartMinutes = normalizeMinutes(startMinutes);
  if (!normalizedDayKey || normalizedStartMinutes == null) return null;
  const matchingEntries = (Array.isArray(entries) ? entries : []).filter((entry) => (
    normalizeDayKey(entry?.dueDayKey) === normalizedDayKey
    && normalizeMinutes(entry?.dueMinutes) === normalizedStartMinutes
  ));
  return matchingEntries.reduce((latest, entry) => {
    if (!latest) return entry;
    const latestIssuedAtMs = Date.parse(normalizeText(latest?.issuedAt));
    const entryIssuedAtMs = Date.parse(normalizeText(entry?.issuedAt));
    if (Number.isFinite(entryIssuedAtMs) && !Number.isFinite(latestIssuedAtMs)) return entry;
    if (Number.isFinite(entryIssuedAtMs) && entryIssuedAtMs >= latestIssuedAtMs) return entry;
    if (!Number.isFinite(entryIssuedAtMs) && !Number.isFinite(latestIssuedAtMs)) return entry;
    return latest;
  }, null);
};

const summarizeProgressEntries = (entries) => {
  const list = Array.isArray(entries) ? entries : [];
  const completedCount = list.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry?.completedCount) || 0),
    0
  );
  const totalCount = list.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry?.totalCount) || 0),
    0
  );
  const percent = totalCount > 0
    ? clampPercent((completedCount / totalCount) * 100)
    : clampPercent(
        list.reduce((sum, entry) => sum + clampPercent(entry?.percent), 0)
        / Math.max(1, list.length)
      );
  return {
    percent,
    completedCount: Math.round(completedCount),
    totalCount: Math.round(totalCount),
  };
};

export const resolveCalendarEventHomeworkProgress = (event, dayKey, startMinutes) => {
  const individualEntry = findCalendarHomeworkProgressForOccurrence(
    event?.homeworkProgressEntries,
    dayKey,
    startMinutes
  );
  if (individualEntry) {
    return {
      ...individualEntry,
      ...summarizeProgressEntries([individualEntry]),
      homeworkCount: 1,
      membersWithHomework: 1,
      memberCount: 1,
    };
  }

  const memberProgress = (Array.isArray(event?.studentHomeworkProgress)
    ? event.studentHomeworkProgress
    : [])
    .map((member) => {
      const progress = findCalendarHomeworkProgressForOccurrence(
        member?.entries,
        dayKey,
        startMinutes
      );
      const studentId = normalizeText(member?.studentId);
      return progress ? { studentId, progress } : null;
    })
    .filter(Boolean);
  if (memberProgress.length === 0) return null;

  const summary = summarizeProgressEntries(memberProgress.map((member) => member.progress));
  const membersWithHomework = new Set(
    memberProgress.map((member) => member.studentId).filter(Boolean)
  ).size;

  return {
    ...summary,
    homeworkCount: memberProgress.length,
    membersWithHomework,
    memberCount: Math.max(
      membersWithHomework,
      Array.isArray(event?.participantIds) ? event.participantIds.length : 0
    ),
  };
};
