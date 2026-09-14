const REPORT_TIME_ZONE = 'Europe/Moscow';

const normalizeText = (value) => String(value ?? '').trim();

const pluralize = (value, one, few, many) => {
  const count = Math.abs(Math.trunc(Number(value) || 0));
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

export const normalizeStudentReportMonth = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(normalizeText(value));
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || month < 1 || month > 12) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

const getMonthKeyFromTimestamp = (value) => {
  const timestamp = typeof value === 'number' ? value : Date.parse(normalizeText(value));
  if (!Number.isFinite(timestamp)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(timestamp)).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return normalizeStudentReportMonth(`${parts.year}-${parts.month}`);
};

const getCurrentMonthKey = (nowMs) => getMonthKeyFromTimestamp(nowMs) || new Date(nowMs).toISOString().slice(0, 7);

const formatReportMonth = (month) => {
  const normalized = normalizeStudentReportMonth(month);
  if (!normalized) return '';
  const [year, monthNumber] = normalized.split('-').map(Number);
  const label = new Intl.DateTimeFormat('ru-RU', {
    timeZone: REPORT_TIME_ZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 15, 12)));
  return label.replace(/\s*г\.$/u, '').trim();
};

const formatReportDate = (nowMs) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: REPORT_TIME_ZONE,
  day: 'numeric',
  month: 'long',
}).format(new Date(nowMs));

const formatDuration = (minutes) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  if (hours <= 0) return `${safeMinutes} мин`;
  if (rest <= 0) return `${hours} ${pluralize(hours, 'час', 'часа', 'часов')}`;
  return `${hours} ч ${rest} мин`;
};

const getHomeworkMonthKey = (entry) => (
  getMonthKeyFromTimestamp(entry?.dueAt)
  || getMonthKeyFromTimestamp(entry?.issuedAt)
);

const isHomeworkComplete = (entry) => Number(entry?.percent) >= 100;

const getIncompleteHomeworkLabel = (entry) => {
  const goalLabels = (Array.isArray(entry?.goals) ? entry.goals : [])
    .filter((goal) => (Array.isArray(goal?.items) ? goal.items : []).some((item) => (
      !['clean', 'completed', 'with-errors'].includes(normalizeText(item?.state))
    )))
    .map((goal) => normalizeText(goal?.label))
    .filter(Boolean);
  if (goalLabels.length > 0) return goalLabels.slice(0, 2).join(', ');
  return normalizeText(entry?.title) || `Домашняя работа №${Number(entry?.number) || 1}`;
};

const getLessonTopicLabel = (entry) => {
  const topic = entry?.topic;
  if (typeof topic === 'string') return normalizeText(topic);
  if (topic && typeof topic === 'object') {
    const label = normalizeText(topic.title || topic.name || topic.text || topic.label);
    if (label) return label;
  }
  const subject = normalizeText(entry?.subject);
  return subject && subject !== 'Занятие' ? subject : '';
};

const uniqueLabels = (values, limit = 6) => {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const label = normalizeText(value).replace(/\s+/g, ' ');
    const key = label.toLocaleLowerCase('ru-RU');
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= limit) break;
  }
  return result;
};

const buildAutomaticConclusion = ({ homework, mocks, lessons }) => {
  const sentences = [];
  if (homework.assignedCount > 0) {
    const evaluatedCount = Math.max(0, homework.assignedCount - homework.upcomingCount);
    const completeRate = evaluatedCount > 0 ? homework.completedCount / evaluatedCount : null;
    const onTimeRate = evaluatedCount > 0 ? homework.onTimeCount / evaluatedCount : null;
    if (evaluatedCount === 0) {
      sentences.push('Домашние задания текущего месяца ещё в работе, сроки их выполнения пока не наступили.');
    } else if (completeRate >= 1 && onTimeRate >= 0.8) {
      sentences.push('Домашняя работа выполняется стабильно — важно сохранить этот темп.');
    } else if (completeRate >= 0.7) {
      sentences.push('Темп по домашней работе хороший, но стоит внимательнее следить за оставшимися заданиями и сроками.');
    } else {
      sentences.push('Основная зона роста сейчас — регулярность домашней работы: лучше выполнять её частями сразу после занятия.');
    }
    if (homework.withErrorsCount > 0) {
      sentences.push('Полезно отдельно разобрать задания, в которых были ошибочные попытки.');
    }
  }
  if (mocks.count > 0) {
    if (mocks.deltaFromPrevious != null && mocks.deltaFromPrevious > 0) {
      sentences.push(`Результат пробника вырос на ${mocks.deltaFromPrevious} ${pluralize(mocks.deltaFromPrevious, 'балл', 'балла', 'баллов')} — прогресс уже виден.`);
    } else if (mocks.deltaFromPrevious != null && mocks.deltaFromPrevious < 0) {
      sentences.push('Результат пробника временно снизился; разбор ошибок поможет вернуть и улучшить предыдущий уровень.');
    } else if (mocks.latestScore >= 80) {
      sentences.push('Результат пробника высокий; дальше стоит закреплять сложные задания и снижать число случайных ошибок.');
    } else {
      sentences.push('Результат пробника зафиксирован; следующий шаг — разобрать ошибки и закрепить задания, где потеряны баллы.');
    }
  }
  if (lessons.count > 0 && sentences.length === 0) {
    sentences.push('Работа идёт по плану; продолжим закреплять изученные темы на следующих занятиях.');
  }
  if (sentences.length === 0) {
    sentences.push('За выбранный месяц пока недостаточно данных для автоматической рекомендации.');
  }
  return sentences.join(' ');
};

export const buildStudentMonthlyReport = ({
  student = {},
  month,
  homeworkEntries = [],
  mockEntries = [],
  lessonEntries = [],
  nowMs = Date.now(),
} = {}) => {
  const normalizedMonth = normalizeStudentReportMonth(month) || getCurrentMonthKey(nowMs);
  const currentMonth = getCurrentMonthKey(nowMs);
  const monthLabel = formatReportMonth(normalizedMonth);
  const studentName = normalizeText(student?.name) || 'Ученик';
  const homeworks = (Array.isArray(homeworkEntries) ? homeworkEntries : [])
    .filter((entry) => getHomeworkMonthKey(entry) === normalizedMonth);
  const lessons = (Array.isArray(lessonEntries) ? lessonEntries : [])
    .filter((entry) => normalizeText(entry?.dayKey).slice(0, 7) === normalizedMonth)
    .filter((entry) => !Number.isFinite(Number(entry?.startMs)) || Number(entry.startMs) <= Number(nowMs));
  const mocksInMonth = (Array.isArray(mockEntries) ? mockEntries : [])
    .filter((entry) => getMonthKeyFromTimestamp(entry?.dateMs ?? entry?.date) === normalizedMonth)
    .sort((left, right) => Number(left?.dateMs || 0) - Number(right?.dateMs || 0));
  const previousMonthMock = (Array.isArray(mockEntries) ? mockEntries : [])
    .filter((entry) => getMonthKeyFromTimestamp(entry?.dateMs ?? entry?.date) < normalizedMonth)
    .sort((left, right) => Number(right?.dateMs || 0) - Number(left?.dateMs || 0))[0] || null;

  const completedHomeworks = homeworks.filter(isHomeworkComplete);
  const incompleteHomeworks = homeworks.filter((entry) => !isHomeworkComplete(entry));
  const upcomingHomeworks = incompleteHomeworks.filter((entry) => {
    const dueAtMs = Date.parse(normalizeText(entry?.dueAt));
    return Number.isFinite(dueAtMs) && dueAtMs > Number(nowMs);
  });
  const overdueHomeworks = incompleteHomeworks.filter((entry) => !upcomingHomeworks.includes(entry));
  const incompleteLabels = uniqueLabels(overdueHomeworks.map(getIncompleteHomeworkLabel));
  const lessonTopics = uniqueLabels(lessons.map(getLessonTopicLabel));
  const lessonMinutes = lessons.reduce((sum, entry) => sum + Math.max(0, Number(entry?.durationMinutes) || 0), 0);
  const latestMock = mocksInMonth[mocksInMonth.length - 1] || null;
  const comparisonMock = mocksInMonth.length > 1
    ? mocksInMonth[mocksInMonth.length - 2]
    : previousMonthMock;
  const mockScores = mocksInMonth.map((entry) => Math.max(0, Math.min(100, Math.round(Number(entry?.score) || 0))));
  const averagePercent = homeworks.length > 0
    ? Math.round(homeworks.reduce((sum, entry) => sum + Math.max(0, Number(entry?.percent) || 0), 0) / homeworks.length)
    : null;

  const metrics = {
    lessons: {
      count: lessons.length,
      minutes: lessonMinutes,
      durationLabel: formatDuration(lessonMinutes),
      topics: lessonTopics,
    },
    homework: {
      assignedCount: homeworks.length,
      completedCount: completedHomeworks.length,
      onTimeCount: completedHomeworks.filter((entry) => entry?.completedOnTime === true).length,
      lateCount: completedHomeworks.filter((entry) => entry?.completedOnTime === false).length,
      upcomingCount: upcomingHomeworks.length,
      incompleteCount: overdueHomeworks.length,
      withErrorsCount: homeworks.filter((entry) => Number(entry?.withErrorsCount) > 0 || Number(entry?.wrongCount) > 0).length,
      averagePercent,
      incompleteLabels,
    },
    mocks: {
      count: mocksInMonth.length,
      latestScore: latestMock ? Math.max(0, Math.min(100, Math.round(Number(latestMock.score) || 0))) : null,
      bestScore: mockScores.length > 0 ? Math.max(...mockScores) : null,
      averageScore: mockScores.length > 0
        ? Math.round(mockScores.reduce((sum, score) => sum + score, 0) / mockScores.length)
        : null,
      previousScore: comparisonMock ? Math.max(0, Math.min(100, Math.round(Number(comparisonMock.score) || 0))) : null,
      deltaFromPrevious: latestMock && comparisonMock
        ? Math.round(Number(latestMock.score) || 0) - Math.round(Number(comparisonMock.score) || 0)
        : null,
      entries: mocksInMonth.map((entry) => ({
        id: normalizeText(entry?.id),
        title: normalizeText(entry?.title) || 'Пробник',
        score: Math.max(0, Math.min(100, Math.round(Number(entry?.score) || 0))),
        date: normalizeText(entry?.date),
      })),
    },
  };

  const lines = [
    `Здравствуйте! Отчёт по ученику: ${studentName}.`,
    `Период: ${monthLabel}${normalizedMonth === currentMonth ? ` (по состоянию на ${formatReportDate(nowMs)})` : ''}.`,
    '',
    'Занятия',
    metrics.lessons.count > 0
      ? `Проведено: ${metrics.lessons.count} ${pluralize(metrics.lessons.count, 'занятие', 'занятия', 'занятий')}, ${metrics.lessons.durationLabel}.`
      : 'Занятий в календаре за этот месяц пока нет.',
  ];
  if (lessonTopics.length > 0) lines.push(`Темы месяца: ${lessonTopics.join('; ')}.`);

  lines.push('', 'Домашние задания');
  if (metrics.homework.assignedCount > 0) {
    lines.push(`Выполнено полностью: ${metrics.homework.completedCount} из ${metrics.homework.assignedCount}.`);
    lines.push(`Выполнено в срок: ${metrics.homework.onTimeCount} из ${metrics.homework.assignedCount}.`);
    if (metrics.homework.incompleteCount > 0) {
      lines.push(`Не завершено к сроку: ${metrics.homework.incompleteCount}.`);
      if (incompleteLabels.length > 0) lines.push(...incompleteLabels.map((label) => `• ${label}`));
    }
    if (metrics.homework.upcomingCount > 0) {
      lines.push(`Ещё в работе, срок не наступил: ${metrics.homework.upcomingCount}.`);
    }
  } else {
    lines.push('Домашних заданий со сроком в этом месяце нет.');
  }

  lines.push('', 'Пробники');
  if (metrics.mocks.count === 0) {
    lines.push('Результат пробника за этот месяц не зафиксирован.');
  } else if (metrics.mocks.count === 1) {
    lines.push(`${metrics.mocks.entries[0].title}: ${metrics.mocks.latestScore} ${pluralize(metrics.mocks.latestScore, 'балл', 'балла', 'баллов')}.`);
  } else {
    lines.push(`Написано пробников: ${metrics.mocks.count}. Последний результат — ${metrics.mocks.latestScore}, лучший — ${metrics.mocks.bestScore}, средний — ${metrics.mocks.averageScore} баллов.`);
  }
  if (metrics.mocks.deltaFromPrevious != null) {
    const prefix = metrics.mocks.deltaFromPrevious > 0 ? '+' : '';
    lines.push(`Изменение относительно предыдущего результата: ${prefix}${metrics.mocks.deltaFromPrevious} ${pluralize(metrics.mocks.deltaFromPrevious, 'балл', 'балла', 'баллов')}.`);
  }

  const automaticConclusion = buildAutomaticConclusion({
    homework: metrics.homework,
    mocks: metrics.mocks,
    lessons: metrics.lessons,
  });
  lines.push('', 'Комментарий и рекомендации', automaticConclusion);

  return {
    month: normalizedMonth,
    monthLabel,
    currentMonth: normalizedMonth === currentMonth,
    generatedAt: new Date(nowMs).toISOString(),
    student: { id: normalizeText(student?.id), name: studentName },
    metrics,
    automaticConclusion,
    text: lines.join('\n'),
  };
};
