const DAY_MS = 24 * 60 * 60 * 1000;

const toValidDate = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfLocalDay = (value) => {
  const date = toValidDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatLessonDay = (lessonStart, now) => {
  if (!lessonStart) return 'Ближайший урок не запланирован';
  const lessonDay = startOfLocalDay(lessonStart);
  const today = startOfLocalDay(now);
  if (!lessonDay || !today) return 'Ближайший урок';
  const dayDiff = Math.round((lessonDay.getTime() - today.getTime()) / DAY_MS);
  if (dayDiff === 0) return 'Сегодня';
  if (dayDiff === 1) return 'Завтра';
  return lessonStart.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).replace('.', '');
};

const formatLessonTime = (lessonStart) => (
  lessonStart
    ? lessonStart.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : ''
);

const normalizeFocusLabels = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
)).slice(0, 3);

const getChecklistProgress = (items) => {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return {
    totalCount: list.length,
    solvedCount: list.filter((item) => Boolean(item?.completedAt)).length,
  };
};

export const buildTeacherLessonBriefing = ({
  studentLabel = '',
  lessonStart = null,
  lessonSubject = '',
  homeworkEntry = null,
  homeworkGoalSummary = null,
  homeworkChecklistItems = [],
  homeworkDueAt = null,
  focusLabels = [],
  now = Date.now(),
} = {}) => {
  const nowDate = toValidDate(now) || new Date();
  const start = toValidDate(lessonStart);
  const dueAt = toValidDate(homeworkDueAt);
  const hasHomework = Boolean(homeworkEntry && typeof homeworkEntry === 'object');
  const goalTotal = Math.max(0, Number(homeworkGoalSummary?.totalCount) || 0);
  const goalSolved = Math.max(0, Number(homeworkGoalSummary?.solvedCount) || 0);
  const checklistProgress = getChecklistProgress(homeworkChecklistItems);
  const totalCount = goalTotal > 0 ? goalTotal : checklistProgress.totalCount;
  const solvedCount = Math.min(
    totalCount,
    goalTotal > 0 ? goalSolved : checklistProgress.solvedCount
  );
  const remainingCount = Math.max(0, totalCount - solvedCount);
  const percent = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : null;
  const complete = hasHomework && totalCount > 0 && remainingCount === 0;
  const overdue = Boolean(hasHomework && !complete && dueAt && dueAt.getTime() < nowDate.getTime());
  const normalizedFocusLabels = normalizeFocusLabels(focusLabels);

  let homeworkStatusLabel = 'Домашка не назначена';
  if (hasHomework && totalCount > 0) {
    homeworkStatusLabel = `Выполнено ${solvedCount} из ${totalCount}`;
  } else if (hasHomework) {
    homeworkStatusLabel = 'Домашка назначена';
  }

  const planSteps = [];
  if (hasHomework && remainingCount > 0) {
    planSteps.push(normalizedFocusLabels[0]
      ? `Начать с незавершённого: ${normalizedFocusLabels[0]}`
      : `Разобрать незавершённое ДЗ: ${remainingCount}`);
  } else if (complete) {
    planSteps.push('Коротко проверить выполненное ДЗ');
  } else {
    planSteps.push('Определить цель и ожидаемый результат урока');
  }
  normalizedFocusLabels.slice(hasHomework && remainingCount > 0 ? 1 : 0, 3).forEach((label) => {
    planSteps.push(`Закрепить: ${label}`);
  });
  planSteps.push('Зафиксировать результат и выдать следующее ДЗ');

  return {
    studentLabel: String(studentLabel || '').trim() || 'Ученик',
    lesson: {
      hasLesson: Boolean(start),
      dayLabel: formatLessonDay(start, nowDate),
      timeLabel: formatLessonTime(start),
      subject: String(lessonSubject || '').trim() || 'Занятие',
    },
    homework: {
      hasHomework,
      totalCount,
      solvedCount,
      remainingCount,
      percent,
      complete,
      overdue,
      statusLabel: homeworkStatusLabel,
      dueLabel: dueAt
        ? dueAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
        : '',
    },
    focusLabels: normalizedFocusLabels,
    planSteps: planSteps.slice(0, 3),
  };
};
