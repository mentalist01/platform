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
  const baseSeed = hashText(`${student?.id || ''}|${student?.name || ''}|${month || ''}`);
  const changingPart = Math.abs(Math.trunc(Number(nowMs) || 0));
  return (phrases, offset = 0) => {
    if (!Array.isArray(phrases) || phrases.length === 0) return '';
    const index = (
      (baseSeed % phrases.length)
      + (changingPart % phrases.length)
      + (Math.abs(Math.imul(offset + 1, 2654435761)) % phrases.length)
    ) % phrases.length;
    return phrases[index];
  };
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

const getPreviousMonthKey = (month) => {
  const normalized = normalizeStudentReportMonth(month);
  if (!normalized) return '';
  const [year, monthNumber] = normalized.split('-').map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 15, 12));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
};

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

const TASK_TOPIC_PATTERN = /^задани(?:е|я)\s*(?:№\s*)?([\d\s,№и]+)$/iu;

const normalizeLessonTopicLabels = (values, limit = 6) => {
  const regularTopics = [];
  const taskNumbers = [];
  const seenTaskNumbers = new Set();

  (Array.isArray(values) ? values : []).forEach((value) => {
    const label = toShortDashes(value).replace(/\s+/g, ' ').trim();
    if (!label) return;
    const taskMatch = TASK_TOPIC_PATTERN.exec(label);
    if (!taskMatch) {
      regularTopics.push(label);
      return;
    }
    (taskMatch[1].match(/\d+/g) || []).forEach((number) => {
      const normalized = String(Number(number));
      if (!normalized || normalized === 'NaN' || seenTaskNumbers.has(normalized)) return;
      seenTaskNumbers.add(normalized);
      taskNumbers.push(normalized);
    });
  });

  const taskTopic = taskNumbers.length > 0
    ? `Задания №${joinNaturalList(taskNumbers)}`
    : '';
  return uniqueLabels([...(taskTopic ? [taskTopic] : []), ...regularTopics], limit);
};

const countLessonTopicLabels = (labels) => (Array.isArray(labels) ? labels : [])
  .reduce((count, value) => {
    const label = toShortDashes(value).replace(/\s+/g, ' ').trim();
    const taskMatch = TASK_TOPIC_PATTERN.exec(label);
    if (!taskMatch) return count + (label ? 1 : 0);
    return count + new Set((taskMatch[1].match(/\d+/g) || []).map((number) => String(Number(number)))).size;
  }, 0);

const getHumanPercentLabel = (value) => {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  if (percent === 100) return 'полностью';
  const lowerTen = Math.floor(percent / 10) * 10;
  if (lowerTen >= 10 && percent > lowerTen) return `более чем на ${lowerTen}%`;
  return `примерно на ${percent}%`;
};

const buildHomeworkProgressText = ({ studentName, averagePercent, pickPhrase }) => {
  const percentLabel = getHumanPercentLabel(averagePercent);
  if (averagePercent >= 95) {
    return pickPhrase([
      `С домашней работой всё отлично: ${studentName} выполняет её ${percentLabel}.`,
      `${studentName} выполняет домашнюю работу ${percentLabel} - это отличный результат.`,
      `Домашнюю работу ${studentName} выполняет ${percentLabel}. Здесь всё очень хорошо.`,
    ], 2);
  }
  if (averagePercent >= 75) {
    return pickPhrase([
      `С домашней работой всё хорошо: в среднем ${studentName} выполняет её ${percentLabel}. Сохраняем этот темп.`,
      `В среднем ${studentName} выполняет домашнюю работу ${percentLabel} - хороший результат.`,
      `${studentName} справляется с домашней работой ${percentLabel}. Темп хороший, продолжаем так же.`,
    ], 2);
  }
  if (averagePercent >= 60) {
    return pickPhrase([
      `В среднем ${studentName} выполняет домашнюю работу ${percentLabel}. Основную часть делает уверенно, но результат можно поднять ещё выше.`,
      `${studentName} выполняет домашнюю работу ${percentLabel} - это неплохой результат. Дальше постараемся сделать его стабильнее.`,
      `Средний результат по домашней работе - ${averagePercent}%. Это хорошая основа, которую будем постепенно улучшать.`,
    ], 2);
  }
  if (averagePercent >= 40) {
    return pickPhrase([
      `Сейчас ${studentName} в среднем выполняет ${averagePercent}% домашней работы. В следующем месяце постараемся сделать практику регулярнее.`,
      `Средний результат по домашней работе - ${averagePercent}%. Основная цель на следующий месяц - заниматься между уроками стабильнее.`,
      `${studentName} выполняет домашнюю работу примерно на ${averagePercent}%. Будем постепенно повышать этот показатель.`,
    ], 2);
  }
  if (averagePercent > 20) {
    return pickPhrase([
      `С домашней работой пока плохо: средний результат ${averagePercent}%. Нужно понять, что мешает ${studentName} заниматься регулярно, и исправить это.`,
      `${studentName} выполняет в среднем только ${averagePercent}% домашней работы. Это слабый результат, и в следующем месяце его нужно заметно улучшить.`,
      `Средний результат по домашней работе - ${averagePercent}%. Сейчас этого недостаточно: разберёмся в причинах и выстроим более регулярную работу.`,
    ], 2);
  }
  return pickPhrase([
    `С домашней работой сейчас очень плохо: средний результат всего ${averagePercent}%. Нужно понять, почему так происходит, и вместе исправить ситуацию.`,
    `${studentName} выполняет в среднем только ${averagePercent}% домашней работы. Это очень слабый результат: разберёмся в причинах и изменим подход.`,
    `Средний результат по домашней работе - ${averagePercent}%. Это очень мало, поэтому в первую очередь нужно наладить регулярную работу между уроками.`,
  ], 2);
};

const buildAutomaticConclusion = ({ homework, mocks, lessons, pickPhrase }) => {
  const sentences = [];
  if (homework.evaluatedCount > 0) {
    if (homework.averagePercent >= 90) {
      sentences.push(pickPhrase([
        'В следующем месяце постараемся сохранить такую же регулярность домашней работы.',
        'По домашней работе задача простая: удержать нынешний хороший темп.',
        'Продолжаем работать в том же ритме и закреплять результат.',
      ], 1));
    } else if (homework.averagePercent >= 70) {
      sentences.push(pickPhrase([
        'Следующая цель - сделать домашнюю практику ещё немного стабильнее.',
        'В следующем месяце постараемся удержать темп и понемногу повысить средний результат.',
        'Продолжим работать регулярно, чтобы средний результат стал ещё выше.',
      ], 1));
    } else if (homework.averagePercent > 20) {
      sentences.push(pickPhrase([
        'В следующем месяце нужно заметно повысить объём самостоятельной работы и сделать её регулярной.',
        'Разберёмся, что мешает выполнять домашнюю работу, и выстроим понятный ритм занятий.',
        'Следующая цель - убрать большие пропуски и заметно поднять средний результат.',
      ], 1));
    } else {
      sentences.push(pickPhrase([
        'В первую очередь разберёмся, почему домашняя работа почти не выполняется, и составим понятный план исправления ситуации.',
        'Такой объём домашней работы недостаточен, поэтому сначала найдём причину и наладим регулярную практику.',
        'Нужно серьёзно изменить работу между уроками: выясним, что мешает, и начнём с небольшого, но обязательного объёма.',
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

const buildStudentHomeworkText = ({ averagePercent, deltaFromPreviousMonth, pickPhrase }) => {
  const percent = Math.max(0, Math.min(100, Math.round(Number(averagePercent) || 0)));
  const change = Number(deltaFromPreviousMonth);
  const progress = Number.isFinite(change) && change >= 5
    ? ` Рост по сравнению с прошлым месяцем - ${change} ${pluralize(change, 'процентный пункт', 'процентных пункта', 'процентных пунктов')}. Это заметный прогресс.`
    : '';
  if (percent >= 95) {
    return `${pickPhrase([
      `Домашнюю работу ты выполняешь на ${percent}%. Отличный результат - видно, что ты работаешь регулярно.`,
      `По домашней работе у тебя ${percent}%. Это очень сильный результат, так держать!`,
      `С домашней работой всё отлично: среднее выполнение ${percent}%. Молодец!`,
    ], 5)}${progress}`;
  }
  if (percent >= 75) {
    return `${pickPhrase([
      `Домашнюю работу ты выполняешь в среднем на ${percent}%. Это хороший результат, продолжай в том же темпе.`,
      `По домашней работе у тебя ${percent}%. Ты хорошо справляешься, осталось сделать работу ещё немного стабильнее.`,
      `Среднее выполнение домашней работы - ${percent}%. Хорошая работа, но запас для роста ещё есть.`,
    ], 5)}${progress}`;
  }
  if (percent >= 60) {
    return `${pickPhrase([
      `Домашнюю работу ты выполняешь в среднем на ${percent}%. Это неплохая основа, но ты точно можешь лучше.`,
      `По домашней работе сейчас ${percent}%. Большую часть ты делаешь, однако нужно меньше пропускать.`,
      `Среднее выполнение домашней работы - ${percent}%. Результат нормальный, но в следующем месяце постарайся поднять его выше.`,
    ], 5)}${progress}`;
  }
  if (percent >= 40) {
    return `${pickPhrase([
      `Домашнюю работу ты выполняешь только на ${percent}%. Этого мало: без регулярной самостоятельной практики прогресс будет медленным.`,
      `По домашней работе сейчас ${percent}%. Результат слабый, поэтому нужно серьёзнее относиться к работе между занятиями.`,
      `Среднее выполнение домашней работы - ${percent}%. Ты можешь заметно лучше, но для этого задания нужно делать регулярно.`,
    ], 5)}${progress}`;
  }
  if (percent > 20) {
    return `${pickPhrase([
      `Домашнюю работу ты выполняешь всего на ${percent}%. Это плохой результат. Нужно честно понять, что тебе мешает, и начать работать регулярно.`,
      `По домашней работе только ${percent}%. Такого объёма недостаточно: на следующем месяце жду от тебя заметно более серьёзной работы.`,
      `Среднее выполнение домашней работы - ${percent}%. Сейчас ты теряешь слишком много практики, и это нужно исправить.`,
    ], 5)}${progress}`;
  }
  return `${pickPhrase([
    `Домашнюю работу ты выполняешь всего на ${percent}%. Это очень плохо. Нужно перестать откладывать задания и начать делать хотя бы обязательную часть после каждого урока.`,
    `По домашней работе только ${percent}%. Это очень слабый результат. Давай разберёмся, что мешает, но дальше задания придётся выполнять регулярно.`,
    `Среднее выполнение домашней работы - ${percent}%. Так продолжать нельзя: без самостоятельной работы твой результат не вырастет. Начинаем исправлять это сейчас.`,
  ], 5)}${progress}`;
};

const formatMockScore = (value) => {
  const score = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return `${score} ${pluralize(score, 'балл', 'балла', 'баллов')}`;
};

const formatMockDelta = (value) => {
  const delta = Math.abs(Math.round(Number(value) || 0));
  return `${delta} ${pluralize(delta, 'балл', 'балла', 'баллов')}`;
};

const buildParentMockJourneyText = ({ studentName, grammar, mocks, pickPhrase }) => {
  const scoreLabel = formatMockScore(mocks.latestScore);
  const startLabel = formatMockScore(mocks.firstScore);
  const previousMonthLabel = formatMockScore(mocks.previousMonthScore);
  const startDeltaLabel = formatMockDelta(mocks.deltaFromStart);
  const monthDeltaLabel = formatMockDelta(mocks.deltaFromPreviousMonth);
  const hasStartComparison = mocks.historyCount > 1 && mocks.deltaFromStart != null;
  const hasMonthComparison = mocks.previousMonthScore != null && mocks.deltaFromPreviousMonth != null;
  const currentSummary = mocks.count > 1
    ? `${studentName} ${grammar.wrote} ${mocks.count} ${pluralize(mocks.count, 'пробник', 'пробника', 'пробников')} за месяц. Последний результат - ${scoreLabel}, лучший - ${formatMockScore(mocks.bestScore)}.`
    : `${studentName} ${grammar.wrote} пробник на ${scoreLabel}.`;

  if (!hasStartComparison && !hasMonthComparison) {
    return pickPhrase([
      `В этом месяце ${studentName} ${grammar.wrote} первый пробник и ${grammar.scored} ${scoreLabel}. Это наша отправная точка, дальше будем отслеживать прогресс.`,
      `${studentName} ${grammar.wrote} первый пробник на ${scoreLabel}. Теперь у нас есть начальный результат, от которого будем двигаться дальше.`,
      `Первый пробник ${studentName} - ${scoreLabel}. Это стартовый результат, дальше будем смотреть на динамику.`,
      `Получили первый результат пробника - ${scoreLabel}. Зафиксировали точку старта и теперь сможем видеть рост по месяцам.`,
      `${studentName} ${grammar.wrote} первый пробник на ${scoreLabel}. От этого результата будем считать дальнейший прогресс.`,
    ], 3);
  }

  if (hasStartComparison && hasMonthComparison) {
    const startDirection = mocks.deltaFromStart > 0
      ? `на ${startDeltaLabel} выше самого первого результата (${startLabel})`
      : mocks.deltaFromStart < 0
        ? `на ${startDeltaLabel} ниже самого первого результата (${startLabel})`
        : `совпадает с самым первым результатом (${startLabel})`;
    const monthDirection = mocks.deltaFromPreviousMonth > 0
      ? `на ${monthDeltaLabel} выше, чем в прошлом месяце (${previousMonthLabel})`
      : mocks.deltaFromPreviousMonth < 0
        ? `на ${monthDeltaLabel} ниже, чем в прошлом месяце (${previousMonthLabel})`
        : `совпадает с результатом прошлого месяца (${previousMonthLabel})`;
    return pickPhrase([
      `${currentSummary} Это ${monthDirection} и ${startDirection}.`,
      `${currentSummary} По сравнению с прошлым месяцем результат ${mocks.deltaFromPreviousMonth > 0 ? 'вырос' : mocks.deltaFromPreviousMonth < 0 ? 'снизился' : 'не изменился'} на ${monthDeltaLabel}, а от первой точки прибавка составляет ${mocks.deltaFromStart >= 0 ? '' : '-'}${startDeltaLabel}.`,
      `${currentSummary} Для сравнения: в прошлом месяце было ${previousMonthLabel}, а начинали с ${startLabel}. Текущий результат показывает ${mocks.deltaFromStart > 0 ? `общий рост на ${startDeltaLabel}` : mocks.deltaFromStart < 0 ? `снижение от старта на ${startDeltaLabel}` : 'тот же уровень, что и в начале'}.`,
      `${currentSummary} За последний месяц разница составила ${mocks.deltaFromPreviousMonth > 0 ? '+' : mocks.deltaFromPreviousMonth < 0 ? '-' : ''}${monthDeltaLabel}; за всё время - ${mocks.deltaFromStart > 0 ? '+' : mocks.deltaFromStart < 0 ? '-' : ''}${startDeltaLabel}.`,
      `${currentSummary} А ведь первый пробник был на ${startLabel}. Сейчас разница со стартом - ${mocks.deltaFromStart > 0 ? '+' : mocks.deltaFromStart < 0 ? '-' : ''}${startDeltaLabel}, а с прошлым месяцем - ${mocks.deltaFromPreviousMonth > 0 ? '+' : mocks.deltaFromPreviousMonth < 0 ? '-' : ''}${monthDeltaLabel}.`,
      `${currentSummary} Динамика хорошо видна по цифрам: старт - ${startLabel}, прошлый месяц - ${previousMonthLabel}, сейчас - ${scoreLabel}.`,
    ], 3);
  }

  if (hasMonthComparison) {
    const direction = mocks.deltaFromPreviousMonth > 0 ? 'лучше' : mocks.deltaFromPreviousMonth < 0 ? 'ниже' : 'такой же';
    return pickPhrase([
      `${currentSummary} Это на ${monthDeltaLabel} ${direction}, чем в прошлом месяце.`,
      `${currentSummary} В прошлом месяце было ${previousMonthLabel}; разница сейчас - ${mocks.deltaFromPreviousMonth > 0 ? '+' : mocks.deltaFromPreviousMonth < 0 ? '-' : ''}${monthDeltaLabel}.`,
      `${currentSummary} По сравнению с прошлым месяцем результат ${mocks.deltaFromPreviousMonth > 0 ? 'вырос' : mocks.deltaFromPreviousMonth < 0 ? 'снизился' : 'не изменился'} на ${monthDeltaLabel}.`,
      `${currentSummary} Месячная динамика: было ${previousMonthLabel}, стало ${scoreLabel}.`,
    ], 3);
  }

  const direction = mocks.deltaFromStart > 0 ? 'выше' : mocks.deltaFromStart < 0 ? 'ниже' : 'на уровне';
  return pickPhrase([
    `${currentSummary} Это на ${startDeltaLabel} ${direction} самого первого результата.`,
    `${currentSummary} Первый пробник был на ${startLabel}; разница со стартом сейчас - ${mocks.deltaFromStart > 0 ? '+' : mocks.deltaFromStart < 0 ? '-' : ''}${startDeltaLabel}.`,
    `${currentSummary} Если смотреть на весь путь, начинали с ${startLabel}, а сейчас получили ${scoreLabel}.`,
    `${currentSummary} От первой точки результат ${mocks.deltaFromStart > 0 ? 'вырос' : mocks.deltaFromStart < 0 ? 'снизился' : 'не изменился'} на ${startDeltaLabel}.`,
  ], 3);
};

const buildStudentMockJourneyText = ({ mocks, pickPhrase }) => {
  const scoreLabel = formatMockScore(mocks.latestScore);
  const startLabel = formatMockScore(mocks.firstScore);
  const previousMonthLabel = formatMockScore(mocks.previousMonthScore);
  const startDeltaLabel = formatMockDelta(mocks.deltaFromStart);
  const monthDeltaLabel = formatMockDelta(mocks.deltaFromPreviousMonth);
  const hasStartComparison = mocks.historyCount > 1 && mocks.deltaFromStart != null;
  const hasMonthComparison = mocks.previousMonthScore != null && mocks.deltaFromPreviousMonth != null;
  const currentSummary = mocks.count > 1
    ? `В этом месяце у тебя было ${mocks.count} ${pluralize(mocks.count, 'пробник', 'пробника', 'пробников')}. Последний результат - ${scoreLabel}, лучший - ${formatMockScore(mocks.bestScore)}.`
    : `Твой результат пробника - ${scoreLabel}.`;

  if (!hasStartComparison && !hasMonthComparison) {
    return pickPhrase([
      `${currentSummary} Это твоя отправная точка. Теперь будем шаг за шагом поднимать результат.`,
      `${currentSummary} Первый результат зафиксирован - дальше будем сравнивать с ним твой рост.`,
      `${currentSummary} Теперь у тебя есть стартовая точка, от которой можно уверенно двигаться дальше.`,
    ], 6);
  }
  if (hasStartComparison && hasMonthComparison) {
    return pickPhrase([
      `${currentSummary} По сравнению с прошлым месяцем разница ${mocks.deltaFromPreviousMonth > 0 ? '+' : mocks.deltaFromPreviousMonth < 0 ? '-' : ''}${monthDeltaLabel}, а со старта - ${mocks.deltaFromStart > 0 ? '+' : mocks.deltaFromStart < 0 ? '-' : ''}${startDeltaLabel}.`,
      `${currentSummary} Посмотри на свой путь: первый пробник - ${startLabel}, прошлый месяц - ${previousMonthLabel}, сейчас - ${scoreLabel}.`,
      `${currentSummary} За последний месяц результат ${mocks.deltaFromPreviousMonth > 0 ? 'вырос' : mocks.deltaFromPreviousMonth < 0 ? 'снизился' : 'не изменился'} на ${monthDeltaLabel}, а относительно первого пробника разница составляет ${mocks.deltaFromStart > 0 ? '+' : mocks.deltaFromStart < 0 ? '-' : ''}${startDeltaLabel}.`,
      `${currentSummary} Сейчас это ${mocks.deltaFromPreviousMonth > 0 ? `на ${monthDeltaLabel} лучше прошлого месяца` : mocks.deltaFromPreviousMonth < 0 ? `на ${monthDeltaLabel} ниже прошлого месяца` : 'тот же результат, что в прошлом месяце'} и ${mocks.deltaFromStart > 0 ? `на ${startDeltaLabel} лучше старта` : mocks.deltaFromStart < 0 ? `на ${startDeltaLabel} ниже старта` : 'на уровне первого пробника'}.`,
    ], 6);
  }
  if (hasMonthComparison) {
    return `${currentSummary} В прошлом месяце было ${previousMonthLabel}; сейчас разница ${mocks.deltaFromPreviousMonth > 0 ? '+' : mocks.deltaFromPreviousMonth < 0 ? '-' : ''}${monthDeltaLabel}.`;
  }
  return `${currentSummary} Первый пробник был на ${startLabel}; разница со стартом сейчас ${mocks.deltaFromStart > 0 ? '+' : mocks.deltaFromStart < 0 ? '-' : ''}${startDeltaLabel}.`;
};

const buildStudentFacingText = ({
  studentName,
  messageMonthLabel,
  normalizedMonth,
  currentMonth,
  nowMs,
  metrics,
  lessonTopics,
  pickPhrase,
}) => {
  const firstName = normalizeText(studentName).split(/\s+/u)[0] || 'Ученик';
  const asOf = normalizedMonth === currentMonth ? ` по состоянию на ${formatReportDate(nowMs)}` : '';
  const lines = [pickPhrase([
    `${firstName}, подвожу твои итоги за ${messageMonthLabel}${asOf}. Посмотри, что уже получается хорошо и над чем нужно поработать дальше.`,
    `${firstName}, вот твои результаты за ${messageMonthLabel}${asOf}. Отмечу сильные стороны и то, что важно улучшить.`,
    `${firstName}, давай посмотрим на твой месяц: что получилось и где нужно добавить усилий. Итоги за ${messageMonthLabel}${asOf}.`,
  ], 4)];

  if (metrics.lessons.count > 0) {
    const lessonCountLabel = `${metrics.lessons.count} ${pluralize(metrics.lessons.count, 'занятие', 'занятия', 'занятий')}`;
    const topicsLabel = joinNaturalList(lessonTopics);
    lines.push('', topicsLabel
      ? `Мы провели ${lessonCountLabel}. На уроках разобрали: ${topicsLabel}.`
      : `Мы провели ${lessonCountLabel}.`);
  } else {
    lines.push('', 'В этом месяце у нас пока не было занятий.');
  }

  if (metrics.homework.assignedCount > 0) {
    lines.push('', metrics.homework.averagePercent == null
      ? 'По домашней работе пока нет результата, который можно оценить.'
      : buildStudentHomeworkText({
        averagePercent: metrics.homework.averagePercent,
        deltaFromPreviousMonth: metrics.homework.deltaFromPreviousMonth,
        pickPhrase,
      }));
  } else {
    lines.push('', 'Домашних заданий в этом месяце не было.');
  }

  if (metrics.mocks.count > 0) {
    lines.push('', buildStudentMockJourneyText({ mocks: metrics.mocks, pickPhrase }));
  } else {
    lines.push('', 'Пробника в этом месяце пока не было.');
  }

  const goals = [];
  if (metrics.homework.evaluatedCount > 0 && metrics.homework.averagePercent < 60) {
    goals.push('Твоя главная цель - выполнять обязательную часть домашней работы после каждого занятия, не откладывая её на последний день.');
  } else if (metrics.homework.evaluatedCount > 0 && metrics.homework.averagePercent < 90) {
    goals.push('Следующая цель - сделать домашнюю работу ещё стабильнее и поднять средний процент выполнения.');
  } else if (metrics.homework.evaluatedCount > 0) {
    goals.push('Сохрани этот темп: регулярная домашняя работа уже даёт результат.');
  }
  if (metrics.homework.withErrorsCount > 0) {
    goals.push('Ошибки - это рабочая часть обучения: мы их разберём, а тебе важно повторить эти задания самостоятельно.');
  }
  if (metrics.mocks.count > 0) {
    goals.push('По пробнику разберём потерянные баллы и закрепим самые слабые типы заданий.');
  }
  if (goals.length === 0 && metrics.lessons.count > 0) {
    goals.push('Продолжай работать в таком же ритме и обязательно задавай вопросы, если что-то осталось непонятным.');
  }
  if (goals.length === 0) {
    goals.push('Пока данных мало. На следующем занятии определим первую конкретную цель и начнём двигаться к ней.');
  }
  lines.push('', goals.join(' '));
  return toShortDashes(lines.join('\n'));
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
  const previousMonthKey = getPreviousMonthKey(normalizedMonth);
  const previousMonthHomeworks = (Array.isArray(homeworkEntries) ? homeworkEntries : [])
    .filter((entry) => getHomeworkMonthKey(entry) === previousMonthKey);
  const lessons = (Array.isArray(lessonEntries) ? lessonEntries : [])
    .filter((entry) => normalizeText(entry?.dayKey).slice(0, 7) === normalizedMonth)
    .filter((entry) => !Number.isFinite(Number(entry?.startMs)) || Number(entry.startMs) <= Number(nowMs));
  const allMocks = (Array.isArray(mockEntries) ? mockEntries : [])
    .map((entry) => {
      const timestamp = Number.isFinite(Number(entry?.dateMs))
        ? Number(entry.dateMs)
        : Date.parse(normalizeText(entry?.date));
      const score = Number(entry?.score);
      return {
        ...entry,
        reportTimestamp: Number.isFinite(timestamp) ? timestamp : 0,
        reportMonth: getMonthKeyFromTimestamp(timestamp || entry?.date),
        reportScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
      };
    })
    .filter((entry) => entry.reportMonth && entry.reportMonth <= normalizedMonth && entry.reportScore != null)
    .filter((entry) => entry.reportTimestamp <= 0 || entry.reportTimestamp <= Number(nowMs))
    .sort((left, right) => left.reportTimestamp - right.reportTimestamp);
  const mocksInMonth = allMocks.filter((entry) => entry.reportMonth === normalizedMonth);
  const previousMonthMocks = allMocks.filter((entry) => entry.reportMonth === previousMonthKey);
  const previousMonthMock = previousMonthMocks.at(-1) || null;
  const previousHistoricalMock = allMocks
    .filter((entry) => entry.reportMonth < normalizedMonth)
    .at(-1) || null;

  const completedHomeworks = homeworks.filter(isHomeworkComplete);
  const incompleteHomeworks = homeworks.filter((entry) => !isHomeworkComplete(entry));
  const upcomingHomeworks = incompleteHomeworks.filter((entry) => {
    const dueAtMs = Date.parse(normalizeText(entry?.dueAt));
    return Number.isFinite(dueAtMs) && dueAtMs > Number(nowMs);
  });
  const overdueHomeworks = incompleteHomeworks.filter((entry) => !upcomingHomeworks.includes(entry));
  const evaluatedHomeworks = homeworks.filter((entry) => !upcomingHomeworks.includes(entry));
  const lessonTopics = normalizeLessonTopicLabels(lessons.map(getLessonTopicLabel));
  const lessonTopicCount = countLessonTopicLabels(lessonTopics);
  const lessonMinutes = lessons.reduce((sum, entry) => sum + Math.max(0, Number(entry?.durationMinutes) || 0), 0);
  const latestMock = mocksInMonth[mocksInMonth.length - 1] || null;
  const comparisonMock = mocksInMonth.length > 1
    ? mocksInMonth[mocksInMonth.length - 2]
    : previousHistoricalMock;
  const firstMock = allMocks[0] || null;
  const mockScores = mocksInMonth.map((entry) => entry.reportScore);
  const averagePercent = evaluatedHomeworks.length > 0
    ? Math.round(evaluatedHomeworks.reduce((sum, entry) => (
      sum + Math.max(0, Math.min(100, Number(entry?.percent) || 0))
    ), 0) / evaluatedHomeworks.length)
    : null;
  const previousAveragePercent = previousMonthHomeworks.length > 0
    ? Math.round(previousMonthHomeworks.reduce((sum, entry) => (
      sum + Math.max(0, Math.min(100, Number(entry?.percent) || 0))
    ), 0) / previousMonthHomeworks.length)
    : null;

  const metrics = {
    lessons: {
      count: lessons.length,
      minutes: lessonMinutes,
      durationLabel: formatDuration(lessonMinutes),
      topics: lessonTopics,
      topicCount: lessonTopicCount,
    },
    homework: {
      assignedCount: homeworks.length,
      completedCount: completedHomeworks.length,
      onTimeCount: completedHomeworks.filter((entry) => entry?.completedOnTime === true).length,
      lateCount: completedHomeworks.filter((entry) => entry?.completedOnTime === false).length,
      upcomingCount: upcomingHomeworks.length,
      evaluatedCount: evaluatedHomeworks.length,
      incompleteCount: overdueHomeworks.length,
      withErrorsCount: evaluatedHomeworks.filter((entry) => Number(entry?.withErrorsCount) > 0 || Number(entry?.wrongCount) > 0).length,
      averagePercent,
      previousAveragePercent,
      deltaFromPreviousMonth: averagePercent != null && previousAveragePercent != null
        ? averagePercent - previousAveragePercent
        : null,
    },
    mocks: {
      count: mocksInMonth.length,
      historyCount: allMocks.length,
      latestScore: latestMock ? latestMock.reportScore : null,
      bestScore: mockScores.length > 0 ? Math.max(...mockScores) : null,
      averageScore: mockScores.length > 0
        ? Math.round(mockScores.reduce((sum, score) => sum + score, 0) / mockScores.length)
        : null,
      previousScore: comparisonMock ? comparisonMock.reportScore : null,
      deltaFromPrevious: latestMock && comparisonMock
        ? latestMock.reportScore - comparisonMock.reportScore
        : null,
      firstScore: firstMock ? firstMock.reportScore : null,
      deltaFromStart: latestMock && firstMock
        ? latestMock.reportScore - firstMock.reportScore
        : null,
      previousMonthScore: previousMonthMock ? previousMonthMock.reportScore : null,
      deltaFromPreviousMonth: latestMock && previousMonthMock
        ? latestMock.reportScore - previousMonthMock.reportScore
        : null,
      entries: mocksInMonth.map((entry) => ({
        id: normalizeText(entry?.id),
        title: normalizeText(entry?.title) || 'Пробник',
        score: entry.reportScore,
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
    lines.push('', metrics.homework.averagePercent == null
      ? 'По домашней работе за этот месяц пока нет результата.'
      : buildHomeworkProgressText({ studentName, averagePercent: metrics.homework.averagePercent, pickPhrase }));
  } else {
    lines.push('', 'Домашних заданий в этом месяце не было.');
  }

  if (metrics.mocks.count === 0) {
    lines.push('', 'Пробника в этом месяце пока не было.');
  } else {
    lines.push('', buildParentMockJourneyText({
      studentName,
      grammar,
      mocks: metrics.mocks,
      pickPhrase,
    }));
  }

  const automaticConclusion = buildAutomaticConclusion({
    homework: metrics.homework,
    mocks: metrics.mocks,
    lessons: metrics.lessons,
    pickPhrase,
  });
  lines.push('', automaticConclusion);

  const parentText = toShortDashes(lines.join('\n'));
  const studentText = buildStudentFacingText({
    studentName,
    messageMonthLabel,
    normalizedMonth,
    currentMonth,
    nowMs,
    metrics,
    lessonTopics,
    pickPhrase,
  });

  return {
    month: normalizedMonth,
    monthLabel,
    currentMonth: normalizedMonth === currentMonth,
    generatedAt: new Date(nowMs).toISOString(),
    student: { id: normalizeText(student?.id), name: studentName },
    metrics,
    automaticConclusion,
    text: parentText,
    parentText,
    studentText,
    texts: {
      parent: parentText,
      student: studentText,
    },
  };
};
