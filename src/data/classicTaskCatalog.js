export const CLASSIC_TASK_MIN_NUMBER = 1;
export const CLASSIC_TASK_MAX_NUMBER = 27;
export const CLASSIC_TASK_INTERNAL_MAX_NUMBER = 99;
export const CLASSIC_GAME_THEORY_TASK_NUMBER = 19;
export const CLASSIC_GAME_THEORY_RESERVED_NUMBERS = new Set([20, 21]);

export const DEFAULT_CLASSIC_TASK_TITLES = Object.freeze({
  1: 'Анализ информационных моделей',
  2: 'Таблицы истинности',
  3: 'Поиск в БД',
  4: 'Кодирование (Фано)',
  5: 'Анализ алгоритмов',
  6: 'Черепаха',
  7: 'Изображения/Звук',
  8: 'Комбинаторика',
  9: 'Excel',
  10: 'Word',
  11: 'Вычисление информации',
  12: 'Исполнители',
  13: 'Графы',
  14: 'Системы счисления',
  15: 'Алгебра логики',
  16: 'Рекурсия',
  17: 'Последовательности',
  18: 'Робот (ДП)',
  19: '19-21 - Теория Игр',
  22: 'Многопроцессорные',
  23: 'Динамика (Исполнитель)',
  24: 'Строки',
  25: 'Маски чисел',
  26: 'Жадные алгоритмы',
  27: 'Анализ данных (Сложная)',
});

export const DEFAULT_CLASSIC_TASK_XP_REWARDS = Object.freeze({
  1: 20,
  2: 50,
  3: 40,
  4: 30,
  5: 100,
  6: 100,
  7: 80,
  8: 350,
  9: 550,
  10: 10,
  11: 500,
  12: 120,
  13: 300,
  14: 300,
  15: 450,
  16: 150,
  17: 450,
  18: 250,
  19: 500,
  22: 300,
  23: 150,
  24: 700,
  25: 500,
  26: 800,
  27: 500,
});

export const CLASSIC_TASK_SLOT_NUMBERS = Object.freeze(
  Array.from(
    { length: CLASSIC_TASK_MAX_NUMBER },
    (_, index) => index + CLASSIC_TASK_MIN_NUMBER,
  ).filter((number) => !CLASSIC_GAME_THEORY_RESERVED_NUMBERS.has(number)),
);

export const isClassicTaskSlotNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number)
    && number >= CLASSIC_TASK_MIN_NUMBER
    && number <= CLASSIC_TASK_MAX_NUMBER
    && !CLASSIC_GAME_THEORY_RESERVED_NUMBERS.has(number);
};

export const getClassicTaskDisplayNumber = (number) => (
  Number(number) === CLASSIC_GAME_THEORY_TASK_NUMBER ? '19-21' : String(number)
);

export const buildDefaultClassicTaskCatalog = () => CLASSIC_TASK_SLOT_NUMBERS.map((number) => ({
  id: number,
  taskNumber: number,
  number,
  slotNumber: number,
  title: DEFAULT_CLASSIC_TASK_TITLES[number] || `Задание ${number}`,
  topic: 'Тема задания',
  mastery: 0,
  xpReward: DEFAULT_CLASSIC_TASK_XP_REWARDS[number] || 100,
  ...(number === CLASSIC_GAME_THEORY_TASK_NUMBER
    ? { displayNumber: getClassicTaskDisplayNumber(number), locked: true }
    : {}),
}));

export const normalizeClassicTaskCatalog = (value, titleOverrides = {}) => {
  const source = Array.isArray(value?.tasks)
    ? value.tasks
    : (Array.isArray(value) ? value : buildDefaultClassicTaskCatalog());
  const seen = new Set();
  const seenTaskNumbers = new Set();
  const normalized = [];

  source.forEach((entry) => {
    const number = Number(entry?.slotNumber ?? entry?.number);
    if (!isClassicTaskSlotNumber(number) || seen.has(number)) return;
    const rawTaskNumber = Number(entry?.taskNumber ?? entry?.id ?? number);
    const taskNumber = Number.isInteger(rawTaskNumber)
      && rawTaskNumber >= CLASSIC_TASK_MIN_NUMBER
      && rawTaskNumber <= CLASSIC_TASK_INTERNAL_MAX_NUMBER
      ? rawTaskNumber
      : null;
    if (!taskNumber || seenTaskNumbers.has(taskNumber)) return;
    seen.add(number);
    seenTaskNumbers.add(taskNumber);
    const override = titleOverrides?.[String(taskNumber)];
    const rawTitle = typeof override === 'string' && override.trim()
      ? override
      : entry?.title;
    const title = String(rawTitle || DEFAULT_CLASSIC_TASK_TITLES[number] || `Задание ${number}`)
      .trim()
      .slice(0, 120);
    const rawXpReward = Number(entry?.xpReward);
    const xpReward = Number.isFinite(rawXpReward) && rawXpReward > 0
      ? Math.min(10000, Math.round(rawXpReward))
      : (DEFAULT_CLASSIC_TASK_XP_REWARDS[taskNumber] || DEFAULT_CLASSIC_TASK_XP_REWARDS[number] || 100);
    normalized.push({
      id: taskNumber,
      taskNumber,
      number: taskNumber,
      slotNumber: number,
      title,
      topic: 'Тема задания',
      mastery: 0,
      xpReward,
      displayNumber: getClassicTaskDisplayNumber(number),
      ...(taskNumber === CLASSIC_GAME_THEORY_TASK_NUMBER ? { locked: true } : {}),
    });
  });

  if (!seenTaskNumbers.has(CLASSIC_GAME_THEORY_TASK_NUMBER)) {
    const gameTheory = buildDefaultClassicTaskCatalog().find(
      (entry) => entry.number === CLASSIC_GAME_THEORY_TASK_NUMBER,
    );
    normalized.push(gameTheory);
  }

  return normalized.sort((left, right) => left.slotNumber - right.slotNumber);
};
