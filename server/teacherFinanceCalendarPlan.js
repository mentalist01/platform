const DEFAULT_DURATION_MINUTES = 60;
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 360;

const WEEKDAY_ORDER_BY_KEY = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const GRADUATE_GRADES = new Set([
  'graduate',
  'graduates',
  'alumni',
  'alumnus',
  'выпускник',
  'выпускники',
]);

const roundToTwoDecimals = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const rounded = Math.round((number + Number.EPSILON) * 100) / 100;
  return Number.isFinite(rounded) ? rounded : 0;
};

const normalizeMonthKey = (value) => {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

const normalizeDayKey = (value) => {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const normalizeTime = (value) => {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizeDurationMinutes = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_DURATION_MINUTES;
  const rounded = Math.round(raw);
  if (rounded < MIN_DURATION_MINUTES || rounded > MAX_DURATION_MINUTES) {
    return DEFAULT_DURATION_MINUTES;
  }
  return rounded;
};

const getDayKeyFromDateLike = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const direct = normalizeDayKey(raw.slice(0, 10));
  if (direct) return direct;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return normalizeDayKey(parsed.toISOString().slice(0, 10));
};

const getMonthMeta = (monthKey) => {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return null;
  const [year, month] = normalized.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { monthKey: normalized, year, month, daysInMonth };
};

const buildDayKey = (year, month, day) => (
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const getWeekdayOrder = (entry) => {
  const numeric = Number(entry?.weekdayOrder);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) return numeric;
  const key = String(entry?.weekdayKey ?? '').trim().toLowerCase();
  return WEEKDAY_ORDER_BY_KEY[key] || 0;
};

const getStudentStartDay = (studentStartDayById, studentId) => {
  const value = studentStartDayById instanceof Map
    ? studentStartDayById.get(studentId)
    : studentStartDayById?.[studentId];
  return getDayKeyFromDateLike(value);
};

const isCancelled = (value) => {
  if (value?.cancelled || value?.isCancelled) return true;
  return String(value?.status ?? '').trim().toLowerCase() === 'cancelled';
};

const makeOccurrence = ({ entry, studentId, dayKey, time, durationMinutes }) => {
  const startParts = time.split(':').map(Number);
  const startMinutes = (startParts[0] * 60) + startParts[1];
  const sourceEntryId = String(entry?.id ?? entry?.externalEventId ?? '').trim();
  return {
    entry,
    sourceEntryId,
    occurrenceKey: [studentId, dayKey, time, durationMinutes].join(':'),
    studentId,
    dayKey,
    time,
    durationMinutes,
    startMinutes,
    endMinutes: startMinutes + durationMinutes,
  };
};

export const expandTeacherFinanceMonthOccurrences = ({
  entries = [],
  monthKey,
  studentStartDayById = {},
} = {}) => {
  const month = getMonthMeta(monthKey);
  if (!month) return [];
  const occurrences = [];

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object' || isCancelled(entry)) return;
    const studentId = String(entry?.studentId ?? '').trim();
    const time = normalizeTime(entry?.time);
    if (!studentId || !time) return;
    const durationMinutes = normalizeDurationMinutes(entry?.durationMinutes);
    const excludedDates = new Set(
      (Array.isArray(entry?.excludedDates) ? entry.excludedDates : [])
        .map(normalizeDayKey)
        .filter(Boolean)
    );
    const rawExplicitDate = String(entry?.date ?? '').trim();

    if (rawExplicitDate) {
      const dayKey = normalizeDayKey(rawExplicitDate);
      if (!dayKey || !dayKey.startsWith(`${month.monthKey}-`) || excludedDates.has(dayKey)) return;
      occurrences.push(makeOccurrence({ entry, studentId, dayKey, time, durationMinutes }));
      return;
    }

    const weekdayOrder = getWeekdayOrder(entry);
    if (!weekdayOrder) return;
    const recurringStartCandidates = [
      `${month.monthKey}-01`,
      getDayKeyFromDateLike(entry?.createdAt),
      getStudentStartDay(studentStartDayById, studentId),
    ].filter(Boolean);
    const recurringStartDay = recurringStartCandidates.reduce(
      (latest, candidate) => (candidate > latest ? candidate : latest),
      `${month.monthKey}-01`
    );

    for (let day = 1; day <= month.daysInMonth; day += 1) {
      const dayKey = buildDayKey(month.year, month.month, day);
      if (dayKey < recurringStartDay || excludedDates.has(dayKey)) continue;
      const date = new Date(Date.UTC(month.year, month.month - 1, day));
      const sundayBasedOrder = date.getUTCDay();
      const candidateWeekdayOrder = sundayBasedOrder === 0 ? 7 : sundayBasedOrder;
      if (candidateWeekdayOrder !== weekdayOrder) continue;
      occurrences.push(makeOccurrence({ entry, studentId, dayKey, time, durationMinutes }));
    }
  });

  return occurrences.sort((left, right) => (
    left.dayKey.localeCompare(right.dayKey, 'ru')
    || left.startMinutes - right.startMinutes
    || left.studentId.localeCompare(right.studentId, 'ru')
    || left.occurrenceKey.localeCompare(right.occurrenceKey, 'ru')
  ));
};

const isCurrentStudent = (student) => {
  if (!student || typeof student !== 'object' || student.deletedAt) return false;
  const grade = String(student?.grade ?? '').trim().toLowerCase();
  return !GRADUATE_GRADES.has(grade);
};

const isTrial = (occurrence) => (
  Boolean(occurrence?.trial || occurrence?.isTrial || occurrence?.entry?.trial || occurrence?.entry?.isTrial)
  || String(occurrence?.status ?? occurrence?.entry?.status ?? '').trim().toLowerCase() === 'trial'
);

const hasOwn = (value, key) => (
  Boolean(value && typeof value === 'object')
  && Object.prototype.hasOwnProperty.call(value, key)
);

const normalizePrice = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return roundToTwoDecimals(number);
};

const getOccurrencePrice = (occurrence, student) => {
  if (hasOwn(occurrence, 'lessonPrice')) return normalizePrice(occurrence.lessonPrice);
  if (hasOwn(occurrence?.entry, 'lessonPrice')) return normalizePrice(occurrence.entry.lessonPrice);
  if (hasOwn(student?.record, 'lessonPrice')) {
    const recordPrice = normalizePrice(student.record.lessonPrice);
    if (recordPrice > 0) return recordPrice;
  }
  if (hasOwn(student, 'lessonPrice')) return normalizePrice(student.lessonPrice);
  return normalizePrice(student?.profile?.lessonPrice);
};

const normalizeOccurrence = (occurrence) => {
  if (!occurrence || typeof occurrence !== 'object') return null;
  const studentId = String(occurrence?.studentId ?? occurrence?.entry?.studentId ?? '').trim();
  const dayKey = normalizeDayKey(occurrence?.dayKey ?? occurrence?.date ?? occurrence?.entry?.date);
  const time = normalizeTime(occurrence?.time ?? occurrence?.entry?.time);
  const durationMinutes = normalizeDurationMinutes(
    occurrence?.durationMinutes ?? occurrence?.entry?.durationMinutes
  );
  if (!studentId || !dayKey) return null;
  const explicitKey = String(occurrence?.occurrenceKey ?? '').trim();
  const occurrenceKey = explicitKey || (time
    ? [studentId, dayKey, time, durationMinutes].join(':')
    : '');
  if (!occurrenceKey) return null;
  return { studentId, dayKey, time, durationMinutes, occurrenceKey };
};

const makeAccumulator = () => ({
  revenue: 0,
  lessonCount: 0,
  durationMinutes: 0,
  workingDays: new Set(),
});

const addToAccumulator = (accumulator, occurrence, lessonPrice) => {
  accumulator.revenue = roundToTwoDecimals(accumulator.revenue + lessonPrice);
  accumulator.lessonCount += 1;
  accumulator.durationMinutes += occurrence.durationMinutes;
  accumulator.workingDays.add(occurrence.dayKey);
};

const finishAccumulator = (accumulator) => ({
  revenue: roundToTwoDecimals(accumulator.revenue),
  lessonCount: accumulator.lessonCount,
  hours: roundToTwoDecimals(accumulator.durationMinutes / 60),
  workingDayCount: accumulator.workingDays.size,
});

export const summarizeTeacherFinanceCalendarPlan = ({
  monthKey,
  students = [],
  completedOccurrences = [],
  remainingOccurrences = [],
} = {}) => {
  const month = normalizeMonthKey(monthKey);
  const studentsById = new Map();
  (Array.isArray(students) ? students : []).forEach((student) => {
    const studentId = String(student?.id ?? '').trim();
    if (studentId && !studentsById.has(studentId)) studentsById.set(studentId, student);
  });
  const activeStudentCount = Array.from(studentsById.values()).filter(isCurrentStudent).length;
  const actualAccumulator = makeAccumulator();
  const remainingAccumulator = makeAccumulator();
  const totalAccumulator = makeAccumulator();
  const seenOccurrenceKeys = new Set();
  const includedStudentIds = new Set();
  const unpricedStudentIds = new Set();
  let unpricedLessonCount = 0;
  let pricedLessonCount = 0;

  const addOccurrence = (rawOccurrence, targetAccumulator, requireCurrentStudent) => {
    if (isTrial(rawOccurrence) || isCancelled(rawOccurrence) || isCancelled(rawOccurrence?.entry)) return;
    const occurrence = normalizeOccurrence(rawOccurrence);
    if (!occurrence || !month || !occurrence.dayKey.startsWith(`${month}-`)) return;
    if (seenOccurrenceKeys.has(occurrence.occurrenceKey)) return;
    const student = studentsById.get(occurrence.studentId);
    if (requireCurrentStudent && !isCurrentStudent(student)) return;
    seenOccurrenceKeys.add(occurrence.occurrenceKey);
    const lessonPrice = getOccurrencePrice(rawOccurrence, student);
    if (lessonPrice > 0) {
      pricedLessonCount += 1;
    } else {
      unpricedLessonCount += 1;
      unpricedStudentIds.add(occurrence.studentId);
    }
    includedStudentIds.add(occurrence.studentId);
    addToAccumulator(targetAccumulator, occurrence, lessonPrice);
    addToAccumulator(totalAccumulator, occurrence, lessonPrice);
  };

  (Array.isArray(completedOccurrences) ? completedOccurrences : []).forEach((occurrence) => {
    addOccurrence(occurrence, actualAccumulator, false);
  });
  (Array.isArray(remainingOccurrences) ? remainingOccurrences : []).forEach((occurrence) => {
    addOccurrence(occurrence, remainingAccumulator, true);
  });

  const actual = finishAccumulator(actualAccumulator);
  const remaining = finishAccumulator(remainingAccumulator);
  const total = finishAccumulator(totalAccumulator);
  const completionPercent = total.lessonCount > 0
    ? Math.max(0, Math.min(100, Math.round((actual.lessonCount / total.lessonCount) * 100)))
    : 0;
  const averageHoursPerWorkingDay = total.workingDayCount > 0
    ? roundToTwoDecimals(total.hours / total.workingDayCount)
    : 0;

  return {
    month,
    activeStudentCount,
    actual,
    remaining,
    total,
    completionPercent,
    averageHoursPerWorkingDay,
    unpricedLessonCount,
    unpricedStudentCount: unpricedStudentIds.size,
    pricedLessonCount,
    studentCount: includedStudentIds.size,
  };
};
