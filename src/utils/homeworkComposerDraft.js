export const HOMEWORK_COMPOSER_DRAFT_VERSION = 1;

const MAX_HOMEWORK_TEXT_LENGTH = 20000;
const MAX_LINK_LENGTH = 2048;
const MAX_GOALS = 60;
const MAX_TARGETS = 500;

const trimString = (value, maxLength = 500) => (
  typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : String(value ?? '').trim().slice(0, maxLength)
);

const normalizeStringList = (values, maxItems = MAX_TARGETS, maxLength = 240) => (
  Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimString(value, maxLength))
      .filter(Boolean)
  )).slice(0, maxItems)
);

const normalizePositiveIntegerList = (values, maxItems = MAX_TARGETS) => (
  Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0)
  )).slice(0, maxItems)
);

const normalizeDraftCarryover = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const remainingCount = value.remainingCount == null
    ? null
    : Math.max(0, Math.trunc(Number(value.remainingCount) || 0));
  return {
    sourceHomeworkId: trimString(value.sourceHomeworkId, 240),
    sourceGoalIndex: Math.max(0, Math.trunc(Number(value.sourceGoalIndex) || 0)),
    originalCount: Math.max(0, Math.trunc(Number(value.originalCount) || 0)),
    remainingCount,
    remainingTaskKeys: normalizeStringList(value.remainingTaskKeys),
  };
};

const normalizeDraftGoal = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = String(value.type || '').trim().toLowerCase() === 'mock' ? 'mock' : 'task';
  const rawTaskNumber = value.taskNumber;
  const numericTaskNumber = Number(rawTaskNumber);
  const taskNumber = rawTaskNumber !== ''
    && rawTaskNumber != null
    && Number.isFinite(numericTaskNumber)
    && numericTaskNumber > 0
      ? numericTaskNumber
      : '';
  const mode = String(value.mode || '').trim().toLowerCase() === 'classic' ? 'classic' : 'timer';
  const origin = String(value.origin || '').trim().toLowerCase() === 'carryover'
    ? 'carryover'
    : 'new';

  return {
    type,
    taskNumber,
    levelId: trimString(value.levelId, 80) || 'basic',
    targetInput: trimString(value.targetInput, 5000),
    includeAll: Boolean(value.includeAll),
    targetQuestions: normalizePositiveIntegerList(value.targetQuestions),
    targetQuestionIds: normalizeStringList(value.targetQuestionIds),
    targetSelectionDirty: Boolean(value.targetSelectionDirty),
    mockExamId: trimString(value.mockExamId, 240),
    mode,
    targetTaskKeys: normalizeStringList(value.targetTaskKeys),
    continuationOfHomeworkId: trimString(value.continuationOfHomeworkId, 240),
    origin,
    carryover: normalizeDraftCarryover(value.carryover),
  };
};

export const normalizeHomeworkComposerDraftForm = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rawSessionCount = Math.trunc(Number(value.dayPlanSessionCount));
  const dayPlanSessionCount = Number.isFinite(rawSessionCount)
    ? Math.max(2, Math.min(7, rawSessionCount))
    : 3;
  const dayPlanWeekdays = normalizePositiveIntegerList(value.dayPlanWeekdays, 7)
    .filter((weekday) => weekday <= 7)
    .sort((left, right) => left - right);
  const rawDaysToComplete = Math.trunc(Number(value.daysToComplete));

  return {
    homeWork: trimString(value.homeWork, MAX_HOMEWORK_TEXT_LENGTH),
    lessonLink: trimString(value.lessonLink, MAX_LINK_LENGTH),
    boardLink: trimString(value.boardLink, MAX_LINK_LENGTH),
    dueAt: trimString(value.dueAt, 100),
    daysToComplete: Number.isFinite(rawDaysToComplete) && rawDaysToComplete > 0
      ? Math.min(366, rawDaysToComplete)
      : 7,
    goals: (Array.isArray(value.goals) ? value.goals : [])
      .slice(0, MAX_GOALS)
      .map(normalizeDraftGoal)
      .filter(Boolean),
    dayPlanEnabled: value.dayPlanEnabled !== false,
    dayPlanSessionCount,
    dayPlanWeekdays: dayPlanWeekdays.length > 0 ? dayPlanWeekdays : [1, 2, 3, 4, 5, 6, 7],
    issuedAt: trimString(value.issuedAt, 100),
  };
};

const normalizeCarryoverSummary = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    hasSourceHomework: Boolean(value.hasSourceHomework),
    sourceHomeworkId: trimString(value.sourceHomeworkId, 240),
    pendingGoalCount: Math.max(0, Math.trunc(Number(value.pendingGoalCount) || 0)),
    pendingQuestionCount: Math.max(0, Math.trunc(Number(value.pendingQuestionCount) || 0)),
    pendingChecklistCount: Math.max(0, Math.trunc(Number(value.pendingChecklistCount) || 0)),
  };
};

const normalizeTimestamp = (value) => {
  const normalized = trimString(value, 100);
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
};

export const normalizeHomeworkComposerDraft = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    value.version != null
    && Number(value.version) !== HOMEWORK_COMPOSER_DRAFT_VERSION
  ) {
    return null;
  }
  const form = normalizeHomeworkComposerDraftForm(value.form);
  if (!form) return null;
  return {
    version: HOMEWORK_COMPOSER_DRAFT_VERSION,
    form,
    carryoverSummary: normalizeCarryoverSummary(value.carryoverSummary),
    baseHomeworkId: trimString(value.baseHomeworkId, 240),
    baseHomeworkUpdatedAt: normalizeTimestamp(value.baseHomeworkUpdatedAt),
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
};

export const createHomeworkComposerDraft = ({
  form,
  carryoverSummary = null,
  baseHomeworkId = '',
  baseHomeworkUpdatedAt = '',
  existingDraft = null,
  now = new Date(),
} = {}) => {
  const normalizedForm = normalizeHomeworkComposerDraftForm(form);
  if (!normalizedForm) return null;
  const timestamp = now instanceof Date && !Number.isNaN(now.getTime())
    ? now.toISOString()
    : new Date().toISOString();
  const existing = normalizeHomeworkComposerDraft(existingDraft);
  return normalizeHomeworkComposerDraft({
    version: HOMEWORK_COMPOSER_DRAFT_VERSION,
    form: normalizedForm,
    carryoverSummary,
    baseHomeworkId,
    baseHomeworkUpdatedAt,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  });
};
