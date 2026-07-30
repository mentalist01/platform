const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS_TO_COMPLETE = 7;
const MAX_PLAN_RANGE_DAYS = 366;

export const HOMEWORK_DAY_PLAN_VERSION = 1;

const WEEKDAY_ALIASES = Object.freeze({
  '1': 1,
  mon: 1,
  monday: 1,
  пн: 1,
  понедельник: 1,
  '2': 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  вт: 2,
  вторник: 2,
  '3': 3,
  wed: 3,
  wednesday: 3,
  ср: 3,
  среда: 3,
  '4': 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  чт: 4,
  четверг: 4,
  '5': 5,
  fri: 5,
  friday: 5,
  пт: 5,
  пятница: 5,
  '6': 6,
  sat: 6,
  saturday: 6,
  сб: 6,
  суббота: 6,
  '7': 7,
  sun: 7,
  sunday: 7,
  вс: 7,
  воскресенье: 7,
});

const normalizeText = (value) => String(value ?? '').trim();

const normalizeLayoutText = (value) => normalizeText(value)
  .replace(/\s+/g, ' ')
  .toLowerCase();

const hashLayoutText = (value) => {
  const normalized = normalizeLayoutText(value);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeLayoutKeyPart = (value) => encodeURIComponent(normalizeText(value));

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizePositiveInteger = (value, fallback = null) => {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const normalizeCalendarOffsetMinutes = (value) => {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-14 * 60, Math.min(14 * 60, numeric));
};

const parseDateOnlyOrdinal = (value) => {
  const match = normalizeText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, monthIndex, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== monthIndex
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / DAY_MS);
};

const parseCalendarDayOrdinal = (value, calendarOffsetMinutes = 0) => {
  if (typeof value === 'string') {
    const dateOnly = parseDateOnlyOrdinal(value);
    if (dateOnly != null) return dateOnly;
  }
  const timestamp = value instanceof Date
    ? value.getTime()
    : (typeof value === 'number' ? value : Date.parse(normalizeText(value)));
  if (!Number.isFinite(timestamp)) return null;
  const shifted = new Date(timestamp + (calendarOffsetMinutes * 60 * 1000));
  return Math.floor(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  ) / DAY_MS);
};

const formatCalendarDayOrdinal = (ordinal) => {
  if (!Number.isFinite(ordinal)) return '';
  return new Date(ordinal * DAY_MS).toISOString().slice(0, 10);
};

const getWeekdayFromOrdinal = (ordinal) => {
  if (!Number.isFinite(ordinal)) return null;
  const weekday = new Date(ordinal * DAY_MS).getUTCDay();
  return weekday === 0 ? 7 : weekday;
};

export const normalizeHomeworkPlanWeekdays = (values) => {
  const source = Array.isArray(values)
    ? values
    : (values == null || values === '' ? [] : [values]);
  return Array.from(new Set(
    source
      .map((value) => WEEKDAY_ALIASES[normalizeText(value).toLowerCase()] || null)
      .filter((value) => value != null)
  )).sort((left, right) => left - right);
};

const getGoalType = (goal) => {
  const type = normalizeText(goal?.type).toLowerCase();
  if (type === 'mock' || (!type && normalizeText(goal?.mockExamId))) return 'mock';
  return 'task';
};

const getHomeworkGoals = (homework, explicitGoals) => {
  if (Array.isArray(explicitGoals)) return explicitGoals;
  if (Array.isArray(homework?.goals) && homework.goals.length > 0) return homework.goals;
  const taskNumber = Number(homework?.taskNumber);
  const levelId = taskNumber >= 100 ? 'python' : normalizeText(homework?.levelId);
  if (!Number.isFinite(taskNumber) || !levelId) return [];
  return [{
    type: 'task',
    taskNumber,
    levelId,
    includeAll: Boolean(homework?.includeAll),
    targetQuestions: Array.isArray(homework?.targetQuestions) ? homework.targetQuestions : [],
    targetQuestionIds: Array.isArray(homework?.targetQuestionIds) ? homework.targetQuestionIds : [],
  }];
};

const buildTextPlanItems = ({ checklistItems, homeWork }) => {
  const normalizedChecklist = (Array.isArray(checklistItems) ? checklistItems : [])
    .map((item, sourceIndex) => ({
      id: normalizeText(item?.id),
      text: normalizeText(item?.text),
      completedAt: item?.completedAt || null,
      sourceIndex,
    }))
    .filter((item) => item.text)
    .map((item, layoutSourceIndex) => ({ ...item, layoutSourceIndex }));

  if (normalizedChecklist.length > 0) {
    return normalizedChecklist.map((item) => ({
      kind: 'text',
      itemId: `text:checklist:${item.sourceIndex}:${item.id || 'legacy'}`,
      layoutKey: `text:${item.layoutSourceIndex}:${hashLayoutText(item.text)}`,
      source: 'checklist',
      sourceIndex: item.sourceIndex,
      checklistItemId: item.id,
      text: item.text,
      completedAt: item.completedAt,
    }));
  }

  return String(homeWork ?? '')
    .split(/\r?\n/)
    .map((line, sourceIndex) => ({
      text: line.trim(),
      sourceIndex,
    }))
    .filter((item) => item.text)
    .map((item, layoutSourceIndex) => ({ ...item, layoutSourceIndex }))
    .map((item) => ({
      kind: 'text',
      itemId: `text:legacy:${item.sourceIndex}`,
      layoutKey: `text:${item.layoutSourceIndex}:${hashLayoutText(item.text)}`,
      source: 'legacy-homework-text',
      sourceIndex: item.sourceIndex,
      checklistItemId: '',
      text: item.text,
      completedAt: null,
    }));
};

const normalizeQuestionNumber = (value) => {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const buildTaskGoalPlanItems = (goal, sourceGoalIndex) => {
  const taskNumberValue = Number(goal?.taskNumber);
  const taskNumber = Number.isFinite(taskNumberValue) ? taskNumberValue : goal?.taskNumber;
  const levelId = Number(taskNumberValue) >= 100
    ? 'python'
    : (normalizeText(goal?.levelId) || 'basic');
  const rawNumbers = Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [];
  const rawIds = Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [];
  const targetCount = Math.max(rawNumbers.length, rawIds.length);
  const goalBase = {
    ...goal,
    type: 'task',
    taskNumber,
    levelId,
  };
  const result = [];

  for (let sourceTargetIndex = 0; sourceTargetIndex < targetCount; sourceTargetIndex += 1) {
    const questionNumber = normalizeQuestionNumber(rawNumbers[sourceTargetIndex]);
    const questionId = normalizeText(rawIds[sourceTargetIndex]);
    if (questionNumber == null && !questionId) continue;
    result.push({
      kind: 'task-target',
      itemId: `goal:${sourceGoalIndex}:task:${sourceTargetIndex}:${questionId || questionNumber}`,
      layoutKey: `goal:${sourceGoalIndex}:task:${questionId
        ? `id:${normalizeLayoutKeyPart(questionId)}`
        : `number:${questionNumber ?? sourceTargetIndex}`}`,
      sourceGoalIndex,
      sourceTargetIndex,
      taskNumber,
      levelId,
      questionNumber,
      questionId,
      goalBase,
    });
  }

  if (result.length > 0) return result;
  return [{
    kind: 'task-goal',
    itemId: `goal:${sourceGoalIndex}:task:whole`,
    layoutKey: `goal:${sourceGoalIndex}:task:whole`,
    sourceGoalIndex,
    sourceTargetIndex: null,
    taskNumber,
    levelId,
    goal: {
      ...goalBase,
      includeAll: Boolean(goal?.includeAll),
      targetQuestions: [],
      targetQuestionIds: [],
    },
  }];
};

const buildMockGoalPlanItems = (goal, sourceGoalIndex) => {
  const targetTaskKeys = Array.isArray(goal?.targetTaskKeys)
    ? goal.targetTaskKeys.map(normalizeText).filter(Boolean)
    : [];
  const goalBase = {
    ...goal,
    type: 'mock',
    mockExamId: normalizeText(goal?.mockExamId),
  };

  if (normalizeText(goal?.mode).toLowerCase() === 'timer') {
    return [{
      kind: 'mock-goal',
      itemId: `goal:${sourceGoalIndex}:mock:whole`,
      layoutKey: `goal:${sourceGoalIndex}:mock:whole`,
      sourceGoalIndex,
      sourceTargetIndex: null,
      mockExamId: goalBase.mockExamId,
      goal: {
        ...goalBase,
        targetTaskKeys,
      },
    }];
  }

  if (targetTaskKeys.length > 0) {
    return targetTaskKeys.map((taskKey, sourceTargetIndex) => ({
      kind: 'mock-target',
      itemId: `goal:${sourceGoalIndex}:mock:${sourceTargetIndex}:${taskKey}`,
      layoutKey: `goal:${sourceGoalIndex}:mock:key:${normalizeLayoutKeyPart(taskKey)}`,
      sourceGoalIndex,
      sourceTargetIndex,
      mockExamId: goalBase.mockExamId,
      taskKey,
      goalBase,
    }));
  }

  return [{
    kind: 'mock-goal',
    itemId: `goal:${sourceGoalIndex}:mock:whole`,
    layoutKey: `goal:${sourceGoalIndex}:mock:whole`,
    sourceGoalIndex,
    sourceTargetIndex: null,
    mockExamId: goalBase.mockExamId,
    goal: {
      ...goalBase,
      targetTaskKeys: [],
    },
  }];
};

export const normalizeHomeworkDayPlanItems = ({
  homework = null,
  goals,
  checklistItems,
  homeWork,
} = {}) => {
  const sourceHomework = isObject(homework) ? homework : {};
  const effectiveChecklist = Array.isArray(checklistItems)
    ? checklistItems
    : sourceHomework.checklistItems;
  const effectiveHomeWork = typeof homeWork === 'string'
    ? homeWork
    : sourceHomework.homeWork;
  const textItems = buildTextPlanItems({
    checklistItems: effectiveChecklist,
    homeWork: effectiveHomeWork,
  });
  const goalItems = getHomeworkGoals(sourceHomework, goals).flatMap((goal, sourceGoalIndex) => {
    if (!isObject(goal)) return [];
    return getGoalType(goal) === 'mock'
      ? buildMockGoalPlanItems(goal, sourceGoalIndex)
      : buildTaskGoalPlanItems(goal, sourceGoalIndex);
  });
  const layoutKeyCounts = new Map();
  return [...textItems, ...goalItems].map((item) => {
    const baseLayoutKey = normalizeText(item?.layoutKey) || normalizeText(item?.itemId);
    const occurrence = layoutKeyCounts.get(baseLayoutKey) || 0;
    layoutKeyCounts.set(baseLayoutKey, occurrence + 1);
    return {
      ...item,
      layoutKey: occurrence === 0 ? baseLayoutKey : `${baseLayoutKey}:duplicate:${occurrence}`,
    };
  });
};

const resolvePlanRange = ({
  homework,
  issuedAt,
  dueAt,
  daysToComplete,
  calendarOffsetMinutes,
}) => {
  const rawIssuedAt = issuedAt ?? homework?.issuedAt;
  const rawDueAt = dueAt ?? homework?.dueAt;
  const fallbackDays = normalizePositiveInteger(
    daysToComplete ?? homework?.daysToComplete,
    DEFAULT_DAYS_TO_COMPLETE
  );
  let issuedOrdinal = parseCalendarDayOrdinal(rawIssuedAt, calendarOffsetMinutes);
  let dueOrdinal = parseCalendarDayOrdinal(rawDueAt, calendarOffsetMinutes);

  if (issuedOrdinal == null && dueOrdinal == null) {
    return {
      valid: false,
      reason: 'missing-date-range',
      issuedOrdinal: null,
      dueOrdinal: null,
      startOrdinal: null,
    };
  }
  if (issuedOrdinal == null) issuedOrdinal = dueOrdinal - fallbackDays;
  if (dueOrdinal == null) dueOrdinal = issuedOrdinal + fallbackDays;
  if (dueOrdinal < issuedOrdinal) {
    return {
      valid: false,
      reason: 'due-before-issued',
      issuedOrdinal,
      dueOrdinal,
      startOrdinal: null,
    };
  }
  if (dueOrdinal - issuedOrdinal > MAX_PLAN_RANGE_DAYS) {
    return {
      valid: false,
      reason: 'range-too-large',
      issuedOrdinal,
      dueOrdinal,
      startOrdinal: null,
    };
  }
  return {
    valid: true,
    reason: '',
    issuedOrdinal,
    dueOrdinal,
    startOrdinal: dueOrdinal === issuedOrdinal ? issuedOrdinal : issuedOrdinal + 1,
  };
};

const listOrdinals = (startOrdinal, dueOrdinal) => {
  if (!Number.isFinite(startOrdinal) || !Number.isFinite(dueOrdinal) || startOrdinal > dueOrdinal) {
    return [];
  }
  return Array.from(
    { length: dueOrdinal - startOrdinal + 1 },
    (_, index) => startOrdinal + index
  );
};

const pickEvenlySpaced = (values, requestedCount) => {
  const list = Array.isArray(values) ? values : [];
  const rawCount = requestedCount == null ? list.length : Math.trunc(Number(requestedCount));
  const count = Math.min(Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0, list.length);
  if (count <= 0) return [];
  if (count === 1) return [list[list.length - 1]];
  if (count === list.length) return [...list];
  return Array.from({ length: count }, (_, index) => (
    list[Math.round((index * (list.length - 1)) / (count - 1))]
  ));
};

const normalizeManualLayoutItemKeys = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map(normalizeText)
    .filter(Boolean)
));

/**
 * Sanitizes a teacher-edited day layout into the representation stored by the
 * server. When valid item keys are supplied, unknown keys are discarded and
 * newly-added work is assigned to the currently least-loaded day.
 */
export const normalizeHomeworkDayPlanManualLayout = (value, options = {}) => {
  if (!isObject(value) || Number(value.version) !== HOMEWORK_DAY_PLAN_VERSION) return null;

  const rawDays = Array.isArray(value.days) ? value.days : [];
  const issuedOrdinal = parseDateOnlyOrdinal(options?.issuedDay);
  const dueOrdinal = parseDateOnlyOrdinal(options?.dueDay);
  const rawKnownKeys = Array.isArray(options?.items)
    ? options.items.map((item) => item?.layoutKey)
    : (Array.isArray(options?.validItemKeys) ? options.validItemKeys : null);
  const orderedKnownKeys = rawKnownKeys == null
    ? null
    : normalizeManualLayoutItemKeys(rawKnownKeys);
  const knownKeySet = orderedKnownKeys == null ? null : new Set(orderedKnownKeys);
  const itemsByDate = new Map();

  rawDays.forEach((day) => {
    if (!isObject(day)) return;
    const dateOrdinal = parseDateOnlyOrdinal(day.date);
    if (dateOrdinal == null) return;
    if (issuedOrdinal != null && dateOrdinal <= issuedOrdinal) return;
    if (dueOrdinal != null && dateOrdinal > dueOrdinal) return;
    const date = formatCalendarDayOrdinal(dateOrdinal);
    const bucket = itemsByDate.get(date) || [];
    bucket.push(...normalizeManualLayoutItemKeys(day.itemKeys));
    itemsByDate.set(date, bucket);
  });

  const dates = [...itemsByDate.keys()]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 7);
  if (dates.length === 0) return null;

  const seenItemKeys = new Set();
  const days = dates.map((date) => ({
    date,
    itemKeys: itemsByDate.get(date).filter((itemKey) => {
      if (knownKeySet && !knownKeySet.has(itemKey)) return false;
      if (seenItemKeys.has(itemKey)) return false;
      seenItemKeys.add(itemKey);
      return true;
    }),
  }));

  if (orderedKnownKeys) {
    orderedKnownKeys.forEach((itemKey) => {
      if (seenItemKeys.has(itemKey)) return;
      const targetDay = days.reduce((best, candidate) => (
        !best || candidate.itemKeys.length < best.itemKeys.length ? candidate : best
      ), null);
      targetDay?.itemKeys.push(itemKey);
      seenItemKeys.add(itemKey);
    });
  }

  const structurallyKnownKeys = knownKeySet || seenItemKeys;
  const pinnedItemKeys = normalizeManualLayoutItemKeys(value.pinnedItemKeys)
    .filter((itemKey) => structurallyKnownKeys.has(itemKey));

  return {
    version: HOMEWORK_DAY_PLAN_VERSION,
    days,
    pinnedItemKeys,
  };
};

export const buildHomeworkSessionDates = ({
  issuedAt,
  dueAt,
  daysToComplete,
  weekdays,
  selectedWeekdays,
  sessionCount,
  calendarOffsetMinutes = 0,
} = {}) => {
  const offset = normalizeCalendarOffsetMinutes(calendarOffsetMinutes);
  const range = resolvePlanRange({
    homework: {},
    issuedAt,
    dueAt,
    daysToComplete,
    calendarOffsetMinutes: offset,
  });
  const normalizedWeekdays = normalizeHomeworkPlanWeekdays(
    selectedWeekdays != null ? selectedWeekdays : weekdays
  );
  const requestedSessionCount = normalizePositiveInteger(sessionCount, null);
  if (!range.valid) {
    return {
      dates: [],
      candidateDates: [],
      issuedDay: formatCalendarDayOrdinal(range.issuedOrdinal),
      dueDay: formatCalendarDayOrdinal(range.dueOrdinal),
      weekdays: normalizedWeekdays,
      requestedSessionCount,
      fallbackUsed: false,
      reason: range.reason,
    };
  }

  const rangeOrdinals = listOrdinals(range.startOrdinal, range.dueOrdinal);
  let candidates = normalizedWeekdays.length > 0
    ? rangeOrdinals.filter((ordinal) => normalizedWeekdays.includes(getWeekdayFromOrdinal(ordinal)))
    : rangeOrdinals;
  let fallbackUsed = false;
  if (candidates.length === 0) {
    candidates = [range.dueOrdinal];
    fallbackUsed = true;
  }

  const selected = requestedSessionCount != null
    ? pickEvenlySpaced(candidates, requestedSessionCount)
    : normalizedWeekdays.length > 0
      ? candidates
      : [range.dueOrdinal];
  return {
    dates: selected.map(formatCalendarDayOrdinal),
    candidateDates: candidates.map(formatCalendarDayOrdinal),
    issuedDay: formatCalendarDayOrdinal(range.issuedOrdinal),
    dueDay: formatCalendarDayOrdinal(range.dueOrdinal),
    weekdays: normalizedWeekdays,
    requestedSessionCount,
    fallbackUsed,
    reason: '',
  };
};

const partitionContiguously = (items, count) => {
  const list = Array.isArray(items) ? items : [];
  const partCount = Math.min(normalizePositiveInteger(count, 0), list.length);
  if (partCount <= 0) return [];
  const baseSize = Math.floor(list.length / partCount);
  const largerPartCount = list.length % partCount;
  let cursor = 0;
  return Array.from({ length: partCount }, (_, index) => {
    const size = baseSize + (index < largerPartCount ? 1 : 0);
    const part = list.slice(cursor, cursor + size);
    cursor += size;
    return part;
  });
};

const toPublicPlanItem = (item) => {
  const layoutMetadata = {
    layoutKey: item.layoutKey,
    ...(item.pinned ? { pinned: true } : {}),
  };
  if (item.kind === 'text') {
    return {
      type: 'text',
      itemId: item.itemId,
      ...layoutMetadata,
      source: item.source,
      sourceIndex: item.sourceIndex,
      checklistItemId: item.checklistItemId,
      text: item.text,
      completedAt: item.completedAt,
    };
  }
  if (item.kind === 'task-target') {
    return {
      type: 'task-target',
      itemId: item.itemId,
      ...layoutMetadata,
      sourceGoalIndex: item.sourceGoalIndex,
      sourceTargetIndex: item.sourceTargetIndex,
      taskNumber: item.taskNumber,
      levelId: item.levelId,
      questionNumber: item.questionNumber,
      questionId: item.questionId,
    };
  }
  if (item.kind === 'mock-target') {
    return {
      type: 'mock-target',
      itemId: item.itemId,
      ...layoutMetadata,
      sourceGoalIndex: item.sourceGoalIndex,
      sourceTargetIndex: item.sourceTargetIndex,
      mockExamId: item.mockExamId,
      taskKey: item.taskKey,
    };
  }
  return {
    type: item.kind,
    itemId: item.itemId,
    ...layoutMetadata,
    sourceGoalIndex: item.sourceGoalIndex,
    sourceTargetIndex: item.sourceTargetIndex,
    goal: { ...(item.goal || {}) },
  };
};

const buildGoalChunks = (items) => {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!String(item?.kind || '').includes('goal') && !String(item?.kind || '').includes('target')) {
      return;
    }
    const key = Number(item.sourceGoalIndex);
    if (!groups.has(key)) {
      groups.set(key, {
        sourceGoalIndex: key,
        firstItem: item,
        items: [],
      });
    }
    groups.get(key).items.push(item);
  });

  return [...groups.values()].map(({ sourceGoalIndex, firstItem, items: groupItems }) => {
    if (firstItem.kind === 'task-target') {
      const targets = groupItems.map((item) => ({
        questionNumber: item.questionNumber,
        questionId: item.questionId,
        sourceTargetIndex: item.sourceTargetIndex,
      }));
      return {
        ...firstItem.goalBase,
        type: 'task',
        taskNumber: firstItem.taskNumber,
        levelId: firstItem.levelId,
        includeAll: false,
        targetQuestions: targets
          .map((target) => target.questionNumber)
          .filter((value) => value != null),
        targetQuestionIds: targets
          .map((target) => target.questionId)
          .filter(Boolean),
        targetInput: targets
          .map((target) => target.questionNumber)
          .filter((value) => value != null)
          .join(', '),
        targets,
        sourceGoalIndex,
      };
    }
    if (firstItem.kind === 'mock-target') {
      const targets = groupItems.map((item) => ({
        taskKey: item.taskKey,
        sourceTargetIndex: item.sourceTargetIndex,
      }));
      return {
        ...firstItem.goalBase,
        type: 'mock',
        mockExamId: firstItem.mockExamId,
        targetTaskKeys: targets.map((target) => target.taskKey),
        targets,
        sourceGoalIndex,
      };
    }
    return {
      ...(firstItem.goal || {}),
      sourceGoalIndex,
      opaque: true,
    };
  });
};

const countItemsByKind = (items, kind) => (
  (Array.isArray(items) ? items : []).filter((item) => item.kind === kind).length
);

const isPendingAvailablePlanItem = (item) => (
  !item?.completed && !item?.unavailable
);

const isMovablePendingPlanItem = (item) => (
  isPendingAvailablePlanItem(item) && !item?.pinned
);

const refreshEnrichedDayCounts = (day) => {
  const items = Array.isArray(day?.items) ? day.items : [];
  const availableItems = items.filter((item) => !item?.unavailable);
  const completedCount = availableItems.filter((item) => item?.completed).length;
  const remainingCount = availableItems.length - completedCount;
  return {
    ...day,
    items,
    itemCount: items.length,
    completedCount,
    remainingCount,
    totalCount: availableItems.length,
    completed: items.length > 0 && remainingCount === 0,
  };
};

/**
 * Moves unfinished work from missed plan days into today and the remaining days.
 * The input is expected to contain items enriched with `completed` and
 * `unavailable` flags by the caller.
 */
export const adaptHomeworkDayPlanForToday = ({ days, todayKey } = {}) => {
  const normalizedTodayKey = normalizeText(todayKey);
  const clonedDays = (Array.isArray(days) ? days : []).map((day) => ({
    ...day,
    items: (Array.isArray(day?.items) ? day.items : []).map((item) => ({ ...item })),
    rescheduledOutCount: 0,
    receivedOverdueCount: 0,
  }));
  const emptyMetadata = {
    movedItemCount: 0,
    sourceDayCount: 0,
    targetDayCount: 0,
  };

  if (!normalizedTodayKey || clonedDays.length === 0) {
    return {
      days: clonedDays.map(refreshEnrichedDayCounts),
      metadata: emptyMetadata,
    };
  }

  const targetStates = clonedDays
    .map((day, index) => ({
      day,
      index,
      pendingCount: (Array.isArray(day?.items) ? day.items : [])
        .filter(isPendingAvailablePlanItem).length,
    }))
    .filter(({ day }) => normalizeText(day?.date) >= normalizedTodayKey)
    .sort((left, right) => (
      normalizeText(left.day?.date).localeCompare(normalizeText(right.day?.date))
      || left.index - right.index
    ));

  if (targetStates.length === 0) {
    return {
      days: clonedDays.map(refreshEnrichedDayCounts),
      metadata: emptyMetadata,
    };
  }

  const sourceStates = clonedDays
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => normalizeText(day?.date) < normalizedTodayKey)
    .sort((left, right) => (
      normalizeText(left.day?.date).localeCompare(normalizeText(right.day?.date))
      || left.index - right.index
    ));
  const affectedSourceIndexes = new Set();
  const affectedTargetIndexes = new Set();
  let movedItemCount = 0;

  sourceStates.forEach(({ day: sourceDay, index: sourceIndex }) => {
    const retainedItems = [];
    (Array.isArray(sourceDay.items) ? sourceDay.items : []).forEach((item) => {
      if (!isMovablePendingPlanItem(item)) {
        retainedItems.push(item);
        return;
      }

      const target = targetStates.reduce((best, candidate) => {
        if (!best || candidate.pendingCount < best.pendingCount) return candidate;
        return best;
      }, null);
      if (!target) {
        retainedItems.push(item);
        return;
      }

      target.day.items.push({
        ...item,
        movedFromDate: normalizeText(sourceDay?.date),
        originalPlannedDate: normalizeText(item?.originalPlannedDate)
          || normalizeText(sourceDay?.date),
      });
      target.pendingCount += 1;
      sourceDay.rescheduledOutCount += 1;
      target.day.receivedOverdueCount += 1;
      affectedSourceIndexes.add(sourceIndex);
      affectedTargetIndexes.add(target.index);
      movedItemCount += 1;
    });
    sourceDay.items = retainedItems;
  });

  return {
    days: clonedDays.map(refreshEnrichedDayCounts),
    metadata: {
      movedItemCount,
      sourceDayCount: affectedSourceIndexes.size,
      targetDayCount: affectedTargetIndexes.size,
    },
  };
};

export const buildHomeworkDayPlan = ({
  homework = null,
  goals,
  checklistItems,
  homeWork,
  issuedAt,
  dueAt,
  daysToComplete,
  weekdays,
  selectedWeekdays,
  sessionCount,
  calendarOffsetMinutes = 0,
  manualLayout,
} = {}) => {
  const sourceHomework = isObject(homework) ? homework : {};
  const items = normalizeHomeworkDayPlanItems({
    homework: sourceHomework,
    ...(Array.isArray(goals) ? { goals } : {}),
    ...(Array.isArray(checklistItems) ? { checklistItems } : {}),
    ...(typeof homeWork === 'string' ? { homeWork } : {}),
  });
  const effectiveIssuedAt = issuedAt ?? sourceHomework.issuedAt;
  const effectiveDueAt = dueAt ?? sourceHomework.dueAt;
  const effectiveDays = daysToComplete ?? sourceHomework.daysToComplete;
  const dateResult = buildHomeworkSessionDates({
    issuedAt: effectiveIssuedAt,
    dueAt: effectiveDueAt,
    daysToComplete: effectiveDays,
    weekdays,
    selectedWeekdays,
    sessionCount,
    calendarOffsetMinutes,
  });
  const effectiveManualLayout = manualLayout === undefined
    ? (sourceHomework.dayPlanManualLayout
      ?? sourceHomework.manualLayout
      ?? sourceHomework.dayPlan?.manualLayout)
    : manualLayout;
  const normalizedManualLayout = normalizeHomeworkDayPlanManualLayout(effectiveManualLayout, {
    issuedDay: dateResult.issuedDay,
    dueDay: dateResult.dueDay,
    items,
  });
  let planDates;
  let itemParts;
  if (normalizedManualLayout) {
    const itemsByLayoutKey = new Map(items.map((item) => [item.layoutKey, item]));
    const pinnedItemKeys = new Set(normalizedManualLayout.pinnedItemKeys);
    planDates = normalizedManualLayout.days.map((day) => day.date);
    itemParts = normalizedManualLayout.days.map((day) => day.itemKeys
      .map((itemKey) => itemsByLayoutKey.get(itemKey))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        ...(pinnedItemKeys.has(item.layoutKey) ? { pinned: true } : {}),
      })));
  } else {
    const desiredDateCount = Math.min(dateResult.dates.length, items.length);
    planDates = pickEvenlySpaced(dateResult.dates, desiredDateCount);
    itemParts = partitionContiguously(items, planDates.length);
  }
  const sourceHomeworkId = normalizeText(sourceHomework?.id);
  const dayPlan = planDates.map((date, index) => {
    const part = itemParts[index] || [];
    const publicItems = part.map(toPublicPlanItem);
    return {
      id: `${sourceHomeworkId ? `${sourceHomeworkId}:` : ''}day:${date}`,
      date,
      weekday: getWeekdayFromOrdinal(parseDateOnlyOrdinal(date)),
      sessionIndex: index,
      sessionNumber: index + 1,
      itemCount: part.length,
      items: publicItems,
      checklistItems: publicItems.filter((item) => item.type === 'text'),
      goals: buildGoalChunks(part),
    };
  });
  const plannedItemCount = dayPlan.reduce((sum, day) => sum + day.itemCount, 0);
  const hasWeekdaySelection = dateResult.weekdays.length > 0;
  const hasSessionCount = dateResult.requestedSessionCount != null;
  const strategy = dateResult.reason
    ? 'invalid-range'
    : hasWeekdaySelection && hasSessionCount
      ? 'weekdays-and-sessions'
      : hasWeekdaySelection
        ? 'weekdays'
        : hasSessionCount
          ? 'sessions'
          : 'due-date';
  const plannedItemKeys = new Set(itemParts.flatMap((part) => (
    Array.isArray(part) ? part.map((item) => item.layoutKey) : []
  )));
  const unplannedItems = plannedItemCount === items.length
    ? []
    : items.filter((item) => !plannedItemKeys.has(item.layoutKey)).map(toPublicPlanItem);

  return {
    version: HOMEWORK_DAY_PLAN_VERSION,
    sourceHomeworkId,
    issuedDay: dateResult.issuedDay,
    dueDay: dateResult.dueDay,
    strategy,
    selectedWeekdays: dateResult.weekdays,
    requestedSessionCount: dateResult.requestedSessionCount,
    fallbackUsed: dateResult.fallbackUsed,
    reason: dateResult.reason,
    manualLayout: normalizedManualLayout,
    dayPlan,
    unplannedItems,
    summary: {
      totalItemCount: items.length,
      plannedItemCount,
      unplannedItemCount: unplannedItems.length,
      sessionCount: dayPlan.length,
      candidateDateCount: dateResult.candidateDates.length,
      textItemCount: countItemsByKind(items, 'text'),
      taskTargetCount: countItemsByKind(items, 'task-target'),
      mockTargetCount: countItemsByKind(items, 'mock-target'),
      opaqueGoalCount: countItemsByKind(items, 'task-goal') + countItemsByKind(items, 'mock-goal'),
    },
  };
};
