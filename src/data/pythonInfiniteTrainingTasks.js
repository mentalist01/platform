export const PYTHON_INFINITE_TRAINING_TASK_NUMBER = 9001;
export const PYTHON_INFINITE_TRAINING_TASK_ID = PYTHON_INFINITE_TRAINING_TASK_NUMBER;
export const PYTHON_INFINITE_TRAINING_LEVEL_ID = 'python';
export const PYTHON_INFINITE_TRAINING_CHEST_INTERVAL = 5;
export const PYTHON_INFINITE_TRAINING_TOTAL = 1000;

export const PYTHON_INFINITE_TRAINING_TASK = {
  id: PYTHON_INFINITE_TRAINING_TASK_ID,
  number: PYTHON_INFINITE_TRAINING_TASK_NUMBER,
  title: 'Бесконечная тренировка Python',
  displayNumber: '∞',
  sectionId: 'topics',
  showInPath: false,
  isInfiniteTraining: true,
};

const toInput = (lines) => lines.map((line) => String(line)).join('\n');
const toOutput = (value) => `${String(value)}\n`;
const sum = (items) => items.reduce((acc, item) => acc + Number(item), 0);
const product = (items) => items.reduce((acc, item) => acc * Number(item), 1);
const factorial = (n) => {
  let result = 1;
  for (let value = 2; value <= n; value += 1) result *= value;
  return result;
};

const formatNumberList = (items) => items.join(' ');

const makeQuestion = ({
  index,
  family,
  title,
  question,
  mechanics,
  tests,
  starterCode,
  difficulty = 'База',
}) => ({
  id: `py-inf-${String(index).padStart(4, '0')}`,
  title,
  question: [
    question,
    '',
    `Подсказка по механикам: ${mechanics.join(', ')}.`,
  ].join('\n'),
  mechanics,
  mechanicsHint: mechanics.join(' • '),
  starterCode: starterCode || 'import sys\n\n# Напиши решение здесь\n',
  tests,
  subsectionId: `infinite-${family}`,
  subsectionTitle: difficulty,
  difficulty,
});

const templates = [
  (index) => {
    const divisor = 2 + (index % 5);
    const build = (seed) => {
      const values = Array.from({ length: 6 }, (_, item) => ((seed + 3) * (item + 2)) % 31 - 9);
      return {
        input: toInput([values.length, formatNumberList(values)]),
        output: toOutput(sum(values.filter((value) => value % divisor === 0))),
      };
    };
    return makeQuestion({
      index,
      family: 'lists',
      difficulty: 'Списки и фильтрация',
      title: `Сумма кратных ${divisor}`,
      question: `На вход подаётся n, затем n целых чисел. Выведите сумму чисел, которые делятся на ${divisor} без остатка.`,
      mechanics: ['input().split()', 'список чисел', 'цикл for', 'условие if'],
      starterCode: 'n = int(input())\nnums = list(map(int, input().split()))\n\n# выведите ответ\n',
      tests: [build(index), build(index + 11), build(index + 29)],
    });
  },
  (index) => {
    const threshold = 3 + (index % 6);
    const samples = [
      ['python', 'ai', 'course', 'loop', 'x'],
      ['data', 'set', 'dictionary', 'if', 'else'],
      ['one', 'seventeen', 'code', 'run', 'test'],
    ];
    return makeQuestion({
      index,
      family: 'strings',
      difficulty: 'Строки',
      title: `Длинные слова от ${threshold}`,
      question: `На вход подаётся строка из слов через пробел. Выведите количество слов, длина которых не меньше ${threshold}.`,
      mechanics: ['split()', 'len()', 'цикл for', 'счётчик'],
      starterCode: 'words = input().split()\n\n# выведите количество подходящих слов\n',
      tests: samples.map((words) => ({
        input: toInput([words.join(' ')]),
        output: toOutput(words.filter((word) => word.length >= threshold).length),
      })),
    });
  },
  (index) => {
    const delta = (index % 9) + 1;
    const build = (seed) => {
      const values = Array.from({ length: 5 }, (_, item) => (seed * (item + 4)) % 47 - 18);
      return {
        input: toInput([values.length, formatNumberList(values)]),
        output: toOutput(Math.max(...values) - Math.min(...values) + delta),
      };
    };
    return makeQuestion({
      index,
      family: 'minmax',
      difficulty: 'Минимум и максимум',
      title: `Размах плюс ${delta}`,
      question: `На вход подаётся n, затем n чисел. Найдите разницу между максимальным и минимальным числом и прибавьте ${delta}.`,
      mechanics: ['min()', 'max()', 'list(map())', 'арифметика'],
      starterCode: 'n = int(input())\nnums = list(map(int, input().split()))\n\n# выведите ответ\n',
      tests: [build(index + 2), build(index + 17), build(index + 41)],
    });
  },
  (index) => {
    const multiplier = 2 + (index % 7);
    const build = (seed) => {
      const text = ['abracadabra', 'mississippi', 'programming', 'banana', 'statistics'][seed % 5];
      const target = text[seed % text.length];
      return {
        input: toInput([text, target]),
        output: toOutput((text.split('').filter((char) => char === target).length) * multiplier),
      };
    };
    return makeQuestion({
      index,
      family: 'strings',
      difficulty: 'Строки',
      title: `Символы с множителем ${multiplier}`,
      question: `На первой строке дана строка, на второй один символ. Посчитайте, сколько раз символ встречается в строке, и умножьте ответ на ${multiplier}.`,
      mechanics: ['строки', 'цикл for', 'сравнение символов', 'счётчик'],
      starterCode: 'text = input()\nchar = input()\n\n# выведите ответ\n',
      tests: [build(index), build(index + 13), build(index + 32)],
    });
  },
  (index) => {
    const add = index % 10;
    const build = (seed) => {
      const n = 4 + (seed % 6);
      return {
        input: toInput([n]),
        output: toOutput(factorial(n) + add),
      };
    };
    return makeQuestion({
      index,
      family: 'loops',
      difficulty: 'Циклы',
      title: `Факториал плюс ${add}`,
      question: `На вход подаётся число n. Выведите n! + ${add}.`,
      mechanics: ['цикл for', 'накопление произведения', 'range()', 'целые числа'],
      starterCode: 'n = int(input())\n\n# посчитайте факториал и выведите ответ\n',
      tests: [build(index + 1), build(index + 9), build(index + 21)],
    });
  },
  (index) => {
    const mod = 3 + (index % 6);
    const build = (seed) => {
      const values = Array.from({ length: 7 }, (_, item) => ((seed + item) * 5) % 28 - 5);
      return {
        input: toInput([values.length, formatNumberList(values)]),
        output: toOutput(product(values.map((value) => Math.abs(value) % mod || 1))),
      };
    };
    return makeQuestion({
      index,
      family: 'lists',
      difficulty: 'Списки и формулы',
      title: `Произведение остатков по модулю ${mod}`,
      question: `На вход подаётся n и n чисел. Для каждого числа возьмите абсолютное значение, остаток от деления на ${mod}; если остаток равен 0, используйте 1. Выведите произведение полученных значений.`,
      mechanics: ['abs()', 'оператор %', 'цикл for', 'накопление произведения'],
      starterCode: 'n = int(input())\nnums = list(map(int, input().split()))\n\n# выведите произведение\n',
      tests: [build(index + 4), build(index + 18), build(index + 36)],
    });
  },
  (index) => {
    const shift = index % 5;
    const build = (seed) => {
      const n = 5 + (seed % 5);
      const values = Array.from({ length: n }, (_, item) => (seed + item * 3) % 17);
      const rotated = values.slice(shift).concat(values.slice(0, shift));
      return {
        input: toInput([n, formatNumberList(values)]),
        output: toOutput(formatNumberList(rotated)),
      };
    };
    return makeQuestion({
      index,
      family: 'slices',
      difficulty: 'Срезы',
      title: `Сдвиг списка на ${shift}`,
      question: `На вход подаётся n и список из n чисел. Сдвиньте список влево на ${shift} позиций и выведите числа через пробел.`,
      mechanics: ['срезы списков', 'конкатенация списков', 'print(*list)'],
      starterCode: 'n = int(input())\nnums = list(map(int, input().split()))\n\n# выведите сдвинутый список\n',
      tests: [build(index + 6), build(index + 15), build(index + 27)],
    });
  },
  (index) => {
    const build = (seed) => {
      const text = ['level radar code', 'python stats noon', 'madam loop civic', 'data kayak test'][seed % 4];
      const words = text.split(' ');
      return {
        input: toInput([text]),
        output: toOutput(words.filter((word) => word === word.split('').reverse().join('')).length),
      };
    };
    return makeQuestion({
      index,
      family: 'strings',
      difficulty: 'Строки',
      title: 'Слова-палиндромы',
      question: 'На вход подаётся строка из слов через пробел. Выведите количество слов, которые читаются одинаково слева направо и справа налево.',
      mechanics: ['split()', 'срез [::-1]', 'цикл for', 'счётчик'],
      starterCode: 'words = input().split()\n\n# выведите количество палиндромов\n',
      tests: [build(index), build(index + 8), build(index + 19)],
    });
  },
  (index) => {
    const power = 2 + (index % 3);
    const build = (seed) => {
      const values = Array.from({ length: 5 }, (_, item) => (seed + item) % 9 + 1);
      return {
        input: toInput([values.length, formatNumberList(values)]),
        output: toOutput(sum(values.map((value) => value ** power))),
      };
    };
    return makeQuestion({
      index,
      family: 'functions',
      difficulty: 'Функции',
      title: `Сумма степеней ${power}`,
      question: `На вход подаётся n и n чисел. Выведите сумму чисел, возведённых в степень ${power}.`,
      mechanics: ['функция', 'оператор **', 'цикл for', 'sum()'],
      starterCode: 'def power_value(x):\n    # верните нужную степень\n    return x\n\nn = int(input())\nnums = list(map(int, input().split()))\n\n# выведите ответ\n',
      tests: [build(index + 5), build(index + 14), build(index + 31)],
    });
  },
  (index) => {
    const build = (seed) => {
      const rows = 2 + (seed % 3);
      const cols = 3 + (seed % 2);
      const matrix = Array.from({ length: rows }, (_, row) => (
        Array.from({ length: cols }, (_, col) => (seed + row * 4 + col * 3) % 20)
      ));
      const diagonal = matrix.reduce((acc, row, rowIndex) => acc + (row[rowIndex % cols] || 0), 0);
      return {
        input: toInput([`${rows} ${cols}`, ...matrix.map(formatNumberList)]),
        output: toOutput(diagonal),
      };
    };
    return makeQuestion({
      index,
      family: 'matrix',
      difficulty: 'Двумерные списки',
      title: 'Сумма циклической диагонали',
      question: 'На вход подаются r и c, затем матрица r x c. Для каждой строки возьмите элемент с индексом строки по модулю c и выведите сумму выбранных элементов.',
      mechanics: ['вложенные списки', 'range()', 'индексы', 'оператор %'],
      starterCode: 'r, c = map(int, input().split())\nmatrix = [list(map(int, input().split())) for _ in range(r)]\n\n# выведите сумму\n',
      tests: [build(index + 7), build(index + 16), build(index + 34)],
    });
  },
];

export const buildPythonInfiniteTrainingQuestions = (count = PYTHON_INFINITE_TRAINING_TOTAL) => (
  Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const question = templates[offset % templates.length](index);
    const cycle = Math.floor(offset / templates.length) + 1;
    return {
      ...question,
      title: `${question.title} · ${cycle}`,
    };
  })
);

export const PYTHON_INFINITE_TRAINING_QUESTIONS = buildPythonInfiniteTrainingQuestions();

export const buildPythonInfiniteTrainingTaskEntry = (levelId = PYTHON_INFINITE_TRAINING_LEVEL_ID) => ({
  isVirtualTraining: true,
  leaderboardExcluded: true,
  title: PYTHON_INFINITE_TRAINING_TASK.title,
  displayNumber: PYTHON_INFINITE_TRAINING_TASK.displayNumber,
  [String(levelId || PYTHON_INFINITE_TRAINING_LEVEL_ID)]: PYTHON_INFINITE_TRAINING_QUESTIONS,
});

export const mergePythonInfiniteTrainingTestsDb = (
  testsDb,
  levelId = PYTHON_INFINITE_TRAINING_LEVEL_ID
) => {
  const safeDb = testsDb && typeof testsDb === 'object' && !Array.isArray(testsDb)
    ? testsDb
    : {};
  return {
    ...safeDb,
    [String(PYTHON_INFINITE_TRAINING_TASK_NUMBER)]: buildPythonInfiniteTrainingTaskEntry(levelId),
  };
};
