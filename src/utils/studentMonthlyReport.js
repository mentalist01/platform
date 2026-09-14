const REPORT_TIME_ZONE = 'Europe/Moscow';

const normalizeText = (value) => String(value ?? '').trim();

const toShortDashes = (value) => normalizeText(value).replace(/[\u2010-\u2015\u2212]/gu, '-');

const lowerFirstLetter = (value) => {
  const text = toShortDashes(value).replace(/[.!?]+$/u, '');
  if (!text || !/^[А-ЯЁ]/u.test(text)) return text;
  return `${text[0].toLocaleLowerCase('ru-RU')}${text.slice(1)}`;
};

const joinNaturalList = (values) => {
  const items = values.map(lowerFirstLetter).filter(Boolean);
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} и ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} и ${items.at(-1)}`;
};

const MALE_NAMES_ENDING_WITH_A_OR_YA = new Set([
  'данила', 'илья', 'кузьма', 'лука', 'никита', 'савва', 'фома',
]);

const getStudentGrammar = (name) => {
  const firstName = normalizeText(name).split(/\s+/u)[0].toLocaleLowerCase('ru-RU');
  const isFemale = /[ая]$/u.test(firstName) && !MALE_NAMES_ENDING_WITH_A_OR_YA.has(firstName);
  return {
    studied: isFemale ? 'занималась' : 'занимался',
    wrote: isFemale ? 'написала' : 'написал',
    scored: isFemale ? 'набрала' : 'набрал',
  };
};

const hashText = (value) => {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createPhrasePicker = ({ student, month, nowMs }) => {
  const stablePart = hashText(`${student?.id || ''}|${student?.name || ''}|${month || ''}`);
  const changingPart = Math.abs(Math.trunc(Number(nowMs) || 0));
  const baseIndex = (stablePart + changingPart) % 3;
  return (phrases, offset = 0) => phrases[(baseIndex + offset) % phrases.length];
};

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
  return '';
};

const uniqueLabels = (values, limit = 6) => {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const label = toShortDashes(value).replace(/\s+/g, ' ');
    const key = label.toLocaleLowerCase('ru-RU');
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= limit) break;
  }
  return result;
};

const buildAutomaticConclusion = ({ homework, mocks, lessons, pickPhrase }) => {
  const sentences = [];
  if (homework.assignedCount > 0) {
    const evaluatedCount = Math.max(0, homework.assignedCount - homework.upcomingCount);
    const completeRate = evaluatedCount > 0 ? homework.completedCount / evaluatedCount : null;
    const onTimeRate = evaluatedCount > 0 ? homework.onTimeCount / evaluatedCount : null;
    if (evaluatedCount > 0 && completeRate >= 1 && onTimeRate >= 0.8) {
      sentences.push(pickPhrase([
        'По домашней работе всё стабильно, этот темп важно сохранить.',
        'С домашней работой всё идёт хорошо, продолжаем в том же темпе.',
        'По домашним заданиям всё стабильно: они выполняются регулярно и вовремя.',
      ], 1));
    } else if (completeRate >= 0.7) {
      sentences.push(pickPhrase([
        'Темп по домашней работе хороший, но отдельные задания стоит доводить до конца внимательнее.',
        'В целом домашняя работа идёт хорошо. Следующий шаг - не оставлять незаконченные задания.',
        'По домашним заданиям есть хороший темп, теперь нужно добавить немного больше регулярности.',
      ], 1));
    } else if (evaluatedCount > 0) {
      sentences.push(pickPhrase([
        'Сейчас основная задача - сделать домашнюю работу более регулярной и не откладывать её до последнего дня.',
        'Нужно выровнять темп по домашним заданиям: лучше выполнять их небольшими частями после каждого урока.',
        'В ближайшее время уделим больше внимания регулярности домашней работы и завершению заданий в срок.',
      ], 1));
    }
    if (homework.withErrorsCount > 0) {
      sentences.push(pickPhrase([
        'На уроках отдельно разберём задания, в которых были ошибки.',
        'Ошибочные задания ещё раз пройдём вместе, чтобы закрепить сложные моменты.',
        'Отдельно вернёмся к заданиям с ошибками и разберём, где возникли трудности.',
      ], 2));
    }
  }
  if (mocks.count > 0) {
    if (mocks.deltaFromPrevious != null && mocks.deltaFromPrevious > 0) {
      sentences.push(pickPhrase([
        `Результат пробника вырос на ${mocks.deltaFromPrevious} ${pluralize(mocks.deltaFromPrevious, 'балл', 'балла', 'баллов')} - прогресс уже виден.`,
        `По сравнению с прошлым пробником прибавили ${mocks.deltaFromPrevious} ${pluralize(mocks.deltaFromPrevious, 'балл', 'балла', 'баллов')}. Продолжим закреплять то, что уже получается.`,
        `Есть рост на ${mocks.deltaFromPrevious} ${pluralize(mocks.deltaFromPrevious, 'балл', 'балла', 'баллов')}. Теперь важно удержать результат и убрать оставшиеся ошибки.`,
      ], 3));
    } else if (mocks.deltaFromPrevious != null && mocks.deltaFromPrevious < 0) {
      sentences.push(pickPhrase([
        'На следующих занятиях подробно разберём ошибки пробника и вернём потерянные баллы.',
        'Ближайший план - понять, где потерялись баллы, и закрепить эти типы заданий.',
        'Результат пока ниже предыдущего, поэтому начнём с разбора ошибок и самых слабых заданий.',
      ], 3));
    } else if (mocks.latestScore >= 80) {
      sentences.push(pickPhrase([
        'Результат пробника высокий. Дальше будем закреплять сложные задания и убирать случайные ошибки.',
        'Пробник написан уверенно, теперь работаем над стабильностью и самыми сложными заданиями.',
        'Уровень уже высокий. Следующая цель - сохранить его и точечно разобрать оставшиеся ошибки.',
      ], 3));
    } else if (mocks.previousScore == null) {
      sentences.push(pickPhrase([
        'На следующих занятиях разберём пробник по ошибкам и определим задания, которые дадут самый быстрый рост.',
        'Сначала разберём ошибки пробника, затем закрепим самые слабые типы заданий.',
        'Ближайший план - пройти ошибки пробника и выбрать задания, на которых можно быстрее всего прибавить баллы.',
      ], 3));
    } else {
      sentences.push(pickPhrase([
        'Следующий шаг - разобрать ошибки пробника и закрепить задания, на которых потеряны баллы.',
        'На ближайших занятиях пройдём пробник по ошибкам и отдельно поработаем над слабыми местами.',
        'Дальше сосредоточимся на разборе пробника и заданиях, которые пока забирают больше всего баллов.',
      ], 3));
    }
  }
  if (lessons.count > 0 && sentences.length === 0) {
    sentences.push(pickPhrase([
      'Работа идёт по плану, на следующих занятиях продолжим закреплять изученные темы.',
      'Темп занятий хороший, продолжаем двигаться по плану и закреплять материал.',
      'Продолжаем работать в текущем темпе и постепенно усложнять задания.',
    ], 4));
  }
  if (sentences.length === 0) {
    sentences.push('За этот месяц пока мало данных, поэтому содержательный вывод получится сделать после следующих занятий.');
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
  const grammar = getStudentGrammar(studentName);
  const pickPhrase = createPhrasePicker({ student, month: normalizedMonth, nowMs });
  const [reportYear, reportMonthNumber] = normalizedMonth.split('-').map(Number);
  const currentYear = Number(currentMonth.slice(0, 4));
  const monthName = new Intl.DateTimeFormat('ru-RU', {
    timeZone: REPORT_TIME_ZONE,
    month: 'long',
  }).format(new Date(Date.UTC(reportYear, reportMonthNumber - 1, 15, 12)));
  const messageMonthLabel = reportYear === currentYear ? monthName : `${monthName} ${reportYear} года`;
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

  const asOf = normalizedMonth === currentMonth ? `, по состоянию на ${formatReportDate(nowMs)}` : '';
  const lines = [pickPhrase([
    `Здравствуйте! Отчитываюсь за ${messageMonthLabel}. Ниже - как ${studentName} ${grammar.studied} в этом месяце${asOf}.`,
    `Здравствуйте! Подвожу итоги за ${messageMonthLabel}. Рассказываю, как ${studentName} ${grammar.studied} в этом месяце${asOf}.`,
    `Здравствуйте! Делюсь результатами за ${messageMonthLabel}. Коротко о том, как ${studentName} ${grammar.studied} в этом месяце${asOf}.`,
  ])];

  if (metrics.lessons.count > 0) {
    const lessonCountLabel = `${metrics.lessons.count} ${pluralize(metrics.lessons.count, 'занятие', 'занятия', 'занятий')}`;
    const topicsLabel = joinNaturalList(lessonTopics);
    lines.push('', topicsLabel
      ? pickPhrase([
        `За это время мы провели ${lessonCountLabel}. На уроках разобрали: ${topicsLabel}.`,
        `В этом месяце прошло ${lessonCountLabel}. Работали над темами: ${topicsLabel}.`,
        `За месяц мы провели ${lessonCountLabel} и разобрали: ${topicsLabel}.`,
      ], 1)
      : pickPhrase([
        `За это время мы провели ${lessonCountLabel}.`,
        `В этом месяце прошло ${lessonCountLabel}.`,
        `За месяц мы провели ${lessonCountLabel}.`,
      ], 1));
  } else {
    lines.push('', 'В этом месяце занятий пока не было.');
  }

  if (metrics.homework.assignedCount > 0) {
    const completedLabel = metrics.homework.completedCount > 0
      ? `полностью выполнено ${metrics.homework.completedCount} ${pluralize(metrics.homework.completedCount, 'задание', 'задания', 'заданий')} из ${metrics.homework.assignedCount}`
      : `полностью пока не выполнено ни одного задания из ${metrics.homework.assignedCount}`;
    const onTimeLabel = metrics.homework.onTimeCount > 0
      ? `в срок сдано ${metrics.homework.onTimeCount} из ${metrics.homework.assignedCount}`
      : 'в срок пока ничего не сдано';
    lines.push('', pickPhrase([
      `По домашней работе: ${completedLabel}, ${onTimeLabel}.`,
      `С домашними заданиями сейчас так: ${completedLabel}, ${onTimeLabel}.`,
      `По домашним заданиям за месяц: ${completedLabel}, ${onTimeLabel}.`,
    ], 2));
    if (metrics.homework.incompleteCount > 0) {
      const overdueLabel = `${metrics.homework.incompleteCount} ${pluralize(metrics.homework.incompleteCount, 'просроченное задание', 'просроченных задания', 'просроченных заданий')}`;
      lines.push(`Нужно закончить ${overdueLabel}${incompleteLabels.length > 0 ? `: ${joinNaturalList(incompleteLabels)}` : ''}.`);
    }
  } else {
    lines.push('', 'Домашних заданий в этом месяце не было.');
  }

  if (metrics.mocks.count === 0) {
    lines.push('', 'Пробника в этом месяце пока не было.');
  } else if (metrics.mocks.count === 1) {
    const scoreLabel = `${metrics.mocks.latestScore} ${pluralize(metrics.mocks.latestScore, 'балл', 'балла', 'баллов')}`;
    if (metrics.mocks.previousScore == null) {
      lines.push('', pickPhrase([
        `В этом месяце ${studentName} ${grammar.wrote} первый пробник и ${grammar.scored} ${scoreLabel}. Это наша отправная точка, дальше будем отслеживать прогресс.`,
        `${studentName} ${grammar.wrote} первый пробник на ${scoreLabel}. Теперь у нас есть начальный результат, от которого будем двигаться дальше.`,
        `Первый пробник в этом месяце - ${scoreLabel}. Это стартовый результат ${studentName}, дальше будем смотреть на динамику.`,
      ], 3));
    } else {
      lines.push('', `В этом месяце ${studentName} ${grammar.wrote} пробник на ${scoreLabel}.`);
    }
  } else {
    lines.push('', `${studentName} ${grammar.wrote} ${metrics.mocks.count} ${pluralize(metrics.mocks.count, 'пробник', 'пробника', 'пробников')}. Последний результат - ${metrics.mocks.latestScore} ${pluralize(metrics.mocks.latestScore, 'балл', 'балла', 'баллов')}, лучший - ${metrics.mocks.bestScore} ${pluralize(metrics.mocks.bestScore, 'балл', 'балла', 'баллов')}.`);
  }
  if (metrics.mocks.deltaFromPrevious != null) {
    const delta = Math.abs(metrics.mocks.deltaFromPrevious);
    if (metrics.mocks.deltaFromPrevious > 0) {
      lines.push(`Это на ${delta} ${pluralize(delta, 'балл', 'балла', 'баллов')} выше предыдущего результата.`);
    } else if (metrics.mocks.deltaFromPrevious < 0) {
      lines.push(`Это на ${delta} ${pluralize(delta, 'балл', 'балла', 'баллов')} ниже предыдущего результата.`);
    } else {
      lines.push('Результат совпал с предыдущим.');
    }
  }

  const automaticConclusion = buildAutomaticConclusion({
    homework: metrics.homework,
    mocks: metrics.mocks,
    lessons: metrics.lessons,
    pickPhrase,
  });
  lines.push('', automaticConclusion);

  return {
    month: normalizedMonth,
    monthLabel,
    currentMonth: normalizedMonth === currentMonth,
    generatedAt: new Date(nowMs).toISOString(),
    student: { id: normalizeText(student?.id), name: studentName },
    metrics,
    automaticConclusion,
    text: toShortDashes(lines.join('\n')),
  };
};
