import {
  HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
  isLessonStartInSchedule,
  normalizeHomeworkDueAtMode,
  resolveNextLessonStart,
} from './homeworkDueAt.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const calculateDaysToComplete = (issuedAt, dueAt, fallback = 7) => {
  const issuedAtMs = Date.parse(String(issuedAt || '').trim());
  const dueAtMs = Date.parse(String(dueAt || '').trim());
  if (Number.isFinite(issuedAtMs) && Number.isFinite(dueAtMs) && dueAtMs > issuedAtMs) {
    return Math.max(1, Math.ceil((dueAtMs - issuedAtMs) / DAY_MS));
  }
  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) && fallbackValue > 0 ? Math.round(fallbackValue) : 7;
};

const buildNextLessonSnapshot = (existing, homework) => {
  const nextLesson = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    homeWork: homework.homeWork || '',
    lessonLink: homework.lessonLink || '',
    boardLink: homework.boardLink || '',
    issuedAt: homework.issuedAt || '',
    updatedAt: homework.updatedAt || '',
    dueAt: homework.dueAt || '',
    dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
    daysToComplete: homework.daysToComplete,
    taskNumber: homework.taskNumber ?? null,
    levelId: homework.levelId ?? null,
    targetQuestions: Array.isArray(homework.targetQuestions) ? homework.targetQuestions : [],
    goals: Array.isArray(homework.goals) ? homework.goals : [],
    checklistItems: Array.isArray(homework.checklistItems) ? homework.checklistItems : [],
  };
  if (homework.dayPlan) nextLesson.dayPlan = homework.dayPlan;
  else delete nextLesson.dayPlan;
  return nextLesson;
};

export const synchronizeHomeworkDueAtWithSchedule = ({
  studentData,
  previousSchedule,
  schedule,
  now = new Date(),
  buildDayPlan,
} = {}) => {
  const data = studentData && typeof studentData === 'object' ? studentData : {};
  const nextSchedule = Array.isArray(schedule) ? schedule : [];
  const homeworks = Array.isArray(data.homeworks) ? [...data.homeworks] : [];
  const latest = homeworks[0] && typeof homeworks[0] === 'object' ? homeworks[0] : null;
  if (!latest) {
    return { studentData: { ...data, schedule: nextSchedule }, deadlineChanged: false };
  }

  const hasStoredMode = String(latest.dueAtMode || '').trim() !== '';
  const storedMode = normalizeHomeworkDueAtMode(latest.dueAtMode);
  const inferredAutomatic = !hasStoredMode && isLessonStartInSchedule(
    Array.isArray(previousSchedule) ? previousSchedule : data.schedule,
    latest.dueAt
  );
  const tracksNextLesson = storedMode === HOMEWORK_DUE_AT_MODE_NEXT_LESSON || inferredAutomatic;
  if (!tracksNextLesson) {
    return { studentData: { ...data, schedule: nextSchedule }, deadlineChanged: false };
  }

  const reference = now instanceof Date ? new Date(now) : new Date(now || '');
  const safeReference = Number.isNaN(reference.getTime()) ? new Date() : reference;
  const migrateTrackingMode = () => {
    if (storedMode === HOMEWORK_DUE_AT_MODE_NEXT_LESSON) return null;
    const migratedHomework = {
      ...latest,
      dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
    };
    homeworks[0] = migratedHomework;
    return {
      studentData: {
        ...data,
        schedule: nextSchedule,
        homeworks,
        nextLesson: buildNextLessonSnapshot(data.nextLesson, migratedHomework),
      },
      deadlineChanged: false,
      homeworkChanged: true,
    };
  };
  const currentDueAtMs = Date.parse(String(latest.dueAt || '').trim());
  if (Number.isFinite(currentDueAtMs) && currentDueAtMs <= safeReference.getTime()) {
    return migrateTrackingMode()
      || { studentData: { ...data, schedule: nextSchedule }, deadlineChanged: false };
  }
  const nextLessonStart = resolveNextLessonStart(nextSchedule, { now: safeReference });
  if (!nextLessonStart) {
    return migrateTrackingMode()
      || { studentData: { ...data, schedule: nextSchedule }, deadlineChanged: false };
  }

  const dueAt = nextLessonStart.toISOString();
  const previousDueAtMs = Date.parse(String(latest.dueAt || '').trim());
  const deadlineChanged = !Number.isFinite(previousDueAtMs)
    || previousDueAtMs !== nextLessonStart.getTime()
    || storedMode !== HOMEWORK_DUE_AT_MODE_NEXT_LESSON;
  if (!deadlineChanged) {
    return { studentData: { ...data, schedule: nextSchedule }, deadlineChanged: false };
  }

  const updatedBase = {
    ...latest,
    dueAt,
    dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
    daysToComplete: calculateDaysToComplete(latest.issuedAt, dueAt, latest.daysToComplete),
    deadlineAdjustedAt: safeReference.toISOString(),
  };
  let updatedHomework = updatedBase;
  if (latest.dayPlan?.enabled && typeof buildDayPlan === 'function') {
    const rebuiltDayPlan = buildDayPlan(latest.dayPlan, updatedBase);
    updatedHomework = { ...updatedBase };
    if (rebuiltDayPlan) updatedHomework.dayPlan = rebuiltDayPlan;
    else delete updatedHomework.dayPlan;
  }
  homeworks[0] = updatedHomework;

  return {
    studentData: {
      ...data,
      schedule: nextSchedule,
      homeworks,
      nextLesson: buildNextLessonSnapshot(data.nextLesson, updatedHomework),
    },
    deadlineChanged: true,
    previousDueAt: latest.dueAt || '',
    dueAt,
    homeworkChanged: true,
  };
};
