const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKLY_TASK_PRACTICE_TARGET = 10;
export const WEEKLY_TASK_PRACTICE_WINDOW_DAYS = 7;

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseTimestamp = (value) => {
  const timestamp = typeof value === 'string' || value instanceof Date
    ? new Date(value).getTime()
    : (typeof value === 'number' ? value : Number.NaN);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getLocalDayNumber = (value) => {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
};

const normalizeTaskNumber = (value, gameTheoryTask) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = Math.trunc(numeric);
  if (normalized === 20 || normalized === 21) return Math.trunc(Number(gameTheoryTask) || 19);
  return normalized;
};

const getQuestionPracticeKey = (levelId, questionId) => {
  const levelKey = String(levelId || '').trim();
  const questionKey = String(questionId ?? '').trim();
  if (!levelKey || !questionKey) return '';
  return `${levelKey}\u001f${questionKey}`;
};

const addEvent = (eventsByTask, rawTaskNumber, gameTheoryTask, questionKey, rawTimestamp, source) => {
  const taskNumber = normalizeTaskNumber(rawTaskNumber, gameTheoryTask);
  const timestamp = parseTimestamp(rawTimestamp);
  if (!Number.isFinite(taskNumber) || !questionKey || !Number.isFinite(timestamp)) return;
  const dayNumber = getLocalDayNumber(timestamp);
  if (!Number.isFinite(dayNumber)) return;
  const taskKey = String(taskNumber);
  const current = eventsByTask.get(taskKey) || [];
  current.push({
    questionKey,
    timestamp,
    dayNumber,
    iso: new Date(timestamp).toISOString(),
    source,
  });
  eventsByTask.set(taskKey, current);
};

const removeQuestionFromWindow = (questionCounts, questionKey) => {
  const nextCount = (questionCounts.get(questionKey) || 0) - 1;
  if (nextCount > 0) questionCounts.set(questionKey, nextCount);
  else questionCounts.delete(questionKey);
};

const getStatsForEvents = (rawEvents, referenceDay, target, windowDays) => {
  const events = rawEvents
    .filter((event) => event.dayNumber <= referenceDay)
    .sort((left, right) => left.timestamp - right.timestamp);
  const questionCounts = new Map();
  let windowStart = 0;
  let qualifiedAt = '';

  events.forEach((event, eventIndex) => {
    questionCounts.set(event.questionKey, (questionCounts.get(event.questionKey) || 0) + 1);
    while (
      windowStart <= eventIndex
      && event.dayNumber - events[windowStart].dayNumber >= windowDays
    ) {
      removeQuestionFromWindow(questionCounts, events[windowStart].questionKey);
      windowStart += 1;
    }
    if (questionCounts.size >= target) qualifiedAt = event.iso;
  });

  const currentWindowStart = referenceDay - windowDays + 1;
  const currentQuestionKeys = new Set(
    events
      .filter((event) => event.dayNumber >= currentWindowStart)
      .map((event) => event.questionKey)
  );

  return {
    target,
    windowDays,
    referenceDay,
    currentCount: currentQuestionKeys.size,
    qualifiedAt,
    lastSolvedAt: events.length > 0 ? events[events.length - 1].iso : '',
    recordedSolutionCount: events.length,
    recordedQuestionCount: new Set(events.map((event) => event.questionKey)).size,
  };
};

/**
 * Builds per-task practice stats from successful answer submissions.
 * A task is considered practiced only after 10 different questions were solved
 * correctly during any rolling seven local calendar days.
 */
export const buildWeeklyTaskPracticeStats = (
  studentData,
  {
    gameTheoryTask = 19,
    referenceDate = new Date(),
    target = WEEKLY_TASK_PRACTICE_TARGET,
    windowDays = WEEKLY_TASK_PRACTICE_WINDOW_DAYS,
  } = {}
) => {
  const safeTarget = Math.max(1, Math.trunc(Number(target) || WEEKLY_TASK_PRACTICE_TARGET));
  const safeWindowDays = Math.max(1, Math.trunc(Number(windowDays) || WEEKLY_TASK_PRACTICE_WINDOW_DAYS));
  const referenceDay = getLocalDayNumber(referenceDate);
  if (!Number.isFinite(referenceDay)) return {};

  const eventsByTask = new Map();
  const historyTimestampsByTaskAndQuestion = new Map();
  const solvedByTask = isObjectRecord(studentData?.solvedByTask) ? studentData.solvedByTask : {};

  Object.entries(solvedByTask).forEach(([taskKey, taskEntry]) => {
    if (!isObjectRecord(taskEntry)) return;
    const normalizedTask = normalizeTaskNumber(taskKey, gameTheoryTask);
    if (!Number.isFinite(normalizedTask)) return;

    Object.entries(taskEntry).forEach(([levelId, levelEntry]) => {
      if (String(levelId).startsWith('_') || !isObjectRecord(levelEntry)) return;
      const answerHistory = isObjectRecord(levelEntry.answerHistory) ? levelEntry.answerHistory : {};
      Object.entries(answerHistory).forEach(([questionId, entries]) => {
        if (!Array.isArray(entries)) return;
        const questionKey = getQuestionPracticeKey(levelId, questionId);
        if (!questionKey) return;
        entries.forEach((entry) => {
          if (entry?.correct !== true) return;
          const timestamp = parseTimestamp(entry?.submittedAt);
          if (!Number.isFinite(timestamp)) return;
          addEvent(eventsByTask, normalizedTask, gameTheoryTask, questionKey, timestamp, 'answer-history');
          const dedupeKey = `${normalizedTask}\u001e${questionKey}`;
          const knownTimestamps = historyTimestampsByTaskAndQuestion.get(dedupeKey) || [];
          knownTimestamps.push(timestamp);
          historyTimestampsByTaskAndQuestion.set(dedupeKey, knownTimestamps);
        });
      });
    });
  });

  // Legacy fallback: old correct solutions may have a solved event but no answer history.
  // Mock exams belong to a separate product flow and are intentionally not mixed into
  // the student's weekly practice for the topic cards.
  const solvedEvents = Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents : [];
  solvedEvents.forEach((event) => {
    if (String(event?.source || '').trim() === 'mock-exam') return;
    const normalizedTask = normalizeTaskNumber(event?.taskNumber, gameTheoryTask);
    const questionKey = getQuestionPracticeKey(event?.levelId, event?.questionId);
    const timestamp = parseTimestamp(event?.solvedAt);
    if (!Number.isFinite(normalizedTask) || !questionKey || !Number.isFinite(timestamp)) return;
    const dedupeKey = `${normalizedTask}\u001e${questionKey}`;
    const matchesAnswerHistory = (historyTimestampsByTaskAndQuestion.get(dedupeKey) || [])
      .some((historyTimestamp) => Math.abs(historyTimestamp - timestamp) <= 5000);
    if (matchesAnswerHistory) return;
    addEvent(eventsByTask, normalizedTask, gameTheoryTask, questionKey, timestamp, 'solved-event');
  });

  const statsByTask = {};
  eventsByTask.forEach((events, taskKey) => {
    statsByTask[taskKey] = getStatsForEvents(
      events,
      referenceDay,
      safeTarget,
      safeWindowDays
    );
  });
  return statsByTask;
};

export const getWeeklyTaskPracticeStats = (statsByTask, taskNumber, gameTheoryTask = 19) => {
  const normalizedTask = normalizeTaskNumber(taskNumber, gameTheoryTask);
  const stored = Number.isFinite(normalizedTask) ? statsByTask?.[String(normalizedTask)] : null;
  if (stored) return stored;
  return {
    target: WEEKLY_TASK_PRACTICE_TARGET,
    windowDays: WEEKLY_TASK_PRACTICE_WINDOW_DAYS,
    referenceDay: getLocalDayNumber(new Date()),
    currentCount: 0,
    qualifiedAt: '',
    lastSolvedAt: '',
    recordedSolutionCount: 0,
    recordedQuestionCount: 0,
  };
};

const pluralizeRu = (value, one, few, many) => {
  const absolute = Math.abs(Math.trunc(value));
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const getElapsedParts = (days) => {
  if (days < 14) {
    return {
      value: days,
      unit: pluralizeRu(days, 'день', 'дня', 'дней'),
      agoUnit: pluralizeRu(days, 'день', 'дня', 'дней'),
    };
  }
  if (days < 60) {
    const value = Math.max(1, Math.floor(days / 7));
    return {
      value,
      unit: pluralizeRu(value, 'неделю', 'недели', 'недель'),
      agoUnit: pluralizeRu(value, 'неделю', 'недели', 'недель'),
    };
  }
  if (days < 365) {
    const value = Math.max(1, Math.floor(days / 30));
    return {
      value,
      unit: pluralizeRu(value, 'месяц', 'месяца', 'месяцев'),
      agoUnit: pluralizeRu(value, 'месяц', 'месяца', 'месяцев'),
    };
  }
  const value = Math.max(1, Math.floor(days / 365));
  return {
    value,
    unit: pluralizeRu(value, 'год', 'года', 'лет'),
    agoUnit: pluralizeRu(value, 'год', 'года', 'лет'),
  };
};

const formatElapsed = (days) => {
  const parts = getElapsedParts(days);
  return `${parts.value} ${parts.unit}`;
};

const formatAgo = (days) => {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  const parts = getElapsedParts(days);
  return `${parts.value} ${parts.agoUnit} назад`;
};

const formatExactDate = (value) => {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getWeeklyTaskPracticeIndicator = (
  stats,
  { progress = 0, availableQuestionCount = null } = {}
) => {
  const target = Math.max(1, Number(stats?.target) || WEEKLY_TASK_PRACTICE_TARGET);
  const windowDays = Math.max(1, Number(stats?.windowDays) || WEEKLY_TASK_PRACTICE_WINDOW_DAYS);
  const currentCount = Math.max(0, Number(stats?.currentCount) || 0);
  const qualifiedAt = typeof stats?.qualifiedAt === 'string' ? stats.qualifiedAt : '';
  const recordedSolutionCount = Math.max(0, Number(stats?.recordedSolutionCount) || 0);
  const referenceDay = Number.isFinite(Number(stats?.referenceDay))
    ? Number(stats.referenceDay)
    : getLocalDayNumber(new Date());
  const base = {
    currentCount,
    target,
    dateTime: qualifiedAt,
  };

  if (currentCount >= target) {
    return {
      ...base,
      key: 'current',
      label: `${currentCount} ${pluralizeRu(currentCount, 'задание', 'задания', 'заданий')} за ${windowDays} ${pluralizeRu(windowDays, 'день', 'дня', 'дней')}`,
      detail: 'Недельная норма выполнена',
      compactLabel: `${currentCount} за ${windowDays} дней`,
      ariaLabel: `Полноценная практика выполнена: ${currentCount} разных заданий за последние ${windowDays} дней при норме ${target}`,
      title: `За последние ${windowDays} дней правильно решено ${currentCount} разных заданий при норме ${target}. Недельная практика выполнена.`,
    };
  }

  const normalizedAvailableCount = availableQuestionCount === null
    ? null
    : Math.max(0, Math.trunc(Number(availableQuestionCount) || 0));
  if (!qualifiedAt && normalizedAvailableCount !== null && normalizedAvailableCount < target) {
    return {
      ...base,
      key: 'unavailable',
      label: 'Норма пока недоступна',
      detail: `В теме доступно ${normalizedAvailableCount} из ${target} разных заданий`,
      compactLabel: 'Без оценки',
      ariaLabel: `Пока недостаточно разных заданий, чтобы оценить недельную практику: доступно ${normalizedAvailableCount} из ${target}`,
      title: `Для честной недельной оценки нужно не менее ${target} разных заданий. Сейчас в теме доступно ${normalizedAvailableCount}.`,
    };
  }

  if (currentCount > 0) {
    const progressRatio = currentCount / target;
    const key = progressRatio <= 0.3
      ? 'building-low'
      : (progressRatio <= 0.6 ? 'building-mid' : 'building-high');
    const exactPreviousPractice = qualifiedAt ? formatExactDate(qualifiedAt) : '';
    return {
      ...base,
      key,
      label: `${currentCount} из ${target} заданий за ${windowDays} дней`,
      detail: `Ещё ${target - currentCount} ${pluralizeRu(target - currentCount, 'разное задание', 'разных задания', 'разных заданий')} до нормы`,
      compactLabel: `${currentCount}/${target} · ${windowDays} дней`,
      ariaLabel: `За последние ${windowDays} дней правильно решено ${currentCount} из ${target} разных заданий`,
      title: `За последние ${windowDays} дней правильно решено ${currentCount} из ${target} разных заданий. До недельной нормы осталось ${target - currentCount}.${exactPreviousPractice ? ` Последняя выполненная норма: ${exactPreviousPractice}.` : ''}`,
    };
  }

  if (!qualifiedAt) {
    if (recordedSolutionCount <= 0 && Number(progress) > 0) {
      return {
        ...base,
        key: 'unknown',
        label: 'Считаем с новых решений',
        detail: 'Даты старых решений не сохранились',
        compactLabel: 'Нет данных',
        ariaLabel: 'Для старых решений не сохранились даты недельной практики',
        title: 'Прогресс есть, но даты старых решений не сохранились. Новая практика начнёт считаться автоматически.',
      };
    }
    if (recordedSolutionCount > 0) {
      return {
        ...base,
        key: 'below',
        label: 'Недельной нормы ещё не было',
        detail: `Цель — ${target} разных заданий за ${windowDays} дней`,
        compactLabel: `Нет ${target} за неделю`,
        ariaLabel: `Пока не было недели с ${target} разными правильно решёнными заданиями`,
        title: `Есть отдельные решения, но ещё не было ${target} разных правильных решений за любые ${windowDays} дней.`,
      };
    }
    return {
      ...base,
      key: 'new',
      label: `0 из ${target} заданий за ${windowDays} дней`,
      detail: `Реши ${target} разных заданий`,
      compactLabel: `0/${target} · ${windowDays} дней`,
      ariaLabel: `По теме ещё нет правильных решений за последние ${windowDays} дней`,
      title: `Полноценная практика появится после ${target} разных правильных решений за ${windowDays} дней.`,
    };
  }

  const qualifiedDay = getLocalDayNumber(qualifiedAt);
  const elapsedDays = Number.isFinite(referenceDay) && Number.isFinite(qualifiedDay)
    ? Math.max(0, referenceDay - qualifiedDay)
    : 0;
  const exactDate = formatExactDate(qualifiedAt);
  const sharedTitle = `Последняя полноценная практика: ${exactDate}. Тогда за ${windowDays} дней было решено не менее ${target} разных заданий. Сейчас: ${currentCount} из ${target}.`;

  if (elapsedDays >= 60) {
    const elapsed = formatElapsed(elapsedDays);
    return {
      ...base,
      key: 'stale',
      label: 'Давно без практики',
      detail: `Недельная норма выполнена ${formatAgo(elapsedDays)}`,
      compactLabel: `Давно · ${elapsed}`,
      ariaLabel: `Давно не решал: полноценная практика была ${formatAgo(elapsedDays)}`,
      title: sharedTitle,
    };
  }
  if (elapsedDays >= 30) {
    const elapsed = formatElapsed(elapsedDays);
    return {
      ...base,
      key: 'due',
      label: 'Пора повторить тему',
      detail: `Недельная норма выполнена ${formatAgo(elapsedDays)}`,
      compactLabel: `Повторить · ${elapsed}`,
      ariaLabel: `Пора повторить тему: полноценная практика была ${formatAgo(elapsedDays)}`,
      title: sharedTitle,
    };
  }
  return {
    ...base,
    key: 'recent',
    label: 'Тема ещё свежая',
    detail: `Недельная норма выполнена ${formatAgo(elapsedDays)}`,
    compactLabel: formatAgo(elapsedDays),
    ariaLabel: `Полноценная практика была ${formatAgo(elapsedDays)}`,
    title: sharedTitle,
  };
};
