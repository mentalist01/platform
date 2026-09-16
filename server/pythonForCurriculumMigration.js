const CURRICULUM_VERSION = 1;
const TASK_NUMBER = '105';
const LEVEL_ID = 'python';

const clone = (value) => structuredClone(value);

const task = ({ id, subsectionId, subsectionTitle, title, question, starterCode, tests }) => ({
  id,
  subsectionId,
  subsectionTitle,
  title,
  question,
  starterCode,
  tests,
});

const test = (input, output) => ({ input, output });

const findExistingId = (questions, titles, fallbackId, fallbackIndex = -1) => {
  const wanted = new Set(titles);
  const match = questions.find((question) => wanted.has(String(question?.title || '').trim()));
  if (match?.id !== null && typeof match?.id !== 'undefined') return match.id;
  const indexed = Number.isInteger(fallbackIndex) && fallbackIndex >= 0
    ? questions[fallbackIndex]
    : null;
  return indexed?.id ?? fallbackId;
};

const getSubsectionId = (entry, oldTitle, fallbackId) => {
  const sections = Array.isArray(entry?.pythonSubsections) ? entry.pythonSubsections : [];
  return sections.find((section) => String(section?.title || '').trim() === oldTitle)?.id || fallbackId;
};

const buildCurriculum = (entry, currentQuestions) => {
  const sectionIds = {
    range: getSubsectionId(entry, 'range() и шаг', 'python-for-range'),
    accumulators: getSubsectionId(entry, 'Накопители', 'python-for-accumulators'),
    counters: getSubsectionId(entry, 'Отбор и счётчики', 'python-for-counters'),
    series: getSubsectionId(entry, 'Максимум и серии', 'python-for-series'),
    search: getSubsectionId(entry, 'Делители и простые числа', 'python-for-search'),
    nested: getSubsectionId(entry, 'Вложенные циклы', 'python-for-nested'),
  };
  const sectionTitles = {
    range: 'range() и шаг',
    accumulators: 'Накопители',
    counters: 'Условия и счётчики',
    series: 'Максимум и серии',
    search: 'Поиск и проверки',
    nested: 'Вложенные циклы',
  };
  const make = (section, data) => task({
    ...data,
    subsectionId: sectionIds[section],
    subsectionTitle: sectionTitles[section],
  });

  const questions = [
    make('range', {
      id: findExistingId(currentQuestions, ['Повторение — мать учения', 'Повторить сообщение'], 'python-for-repeat-message', 0),
      title: 'Повторить сообщение',
      question: 'Считайте строку и целое число N. Выведите строку N раз, каждое повторение на новой строке. Используйте цикл for.\n\nФормат входных данных:\nВ первой строке текст, во второй строке целое число N (1 ≤ N ≤ 20).\n\nФормат выходных данных:\nN строк с исходным текстом.',
      starterCode: "text = input()\nn = int(input())\n\n# Повторите вывод n раз",
      tests: [
        test('Привет\n3', 'Привет\nПривет\nПривет'),
        test('x\n1', 'x'),
        test('учим Python\n2', 'учим Python\nучим Python'),
        test('123\n4', '123\n123\n123\n123'),
      ],
    }),
    make('range', {
      id: findExistingId(currentQuestions, ['Диапазон чисел', 'Диапазон включительно'], 'python-for-inclusive-range', 1),
      title: 'Диапазон включительно',
      question: 'Даны два целых числа A и B, причём A не больше B. Выведите все числа от A до B включительно в одну строку через пробел. Используйте range().\n\nФормат входных данных:\nДва целых числа A и B, каждое на новой строке.\n\nФормат выходных данных:\nЧисла от A до B включительно.',
      starterCode: "a = int(input())\nb = int(input())\n\n# Правая граница range() не включается",
      tests: [
        test('2\n5', '2 3 4 5'),
        test('-2\n2', '-2 -1 0 1 2'),
        test('7\n7', '7'),
        test('-5\n-2', '-5 -4 -3 -2'),
      ],
    }),
    make('range', {
      id: findExistingId(currentQuestions, ['Чётные на отрезке'], 'python-for-even-range'),
      title: 'Чётные на отрезке',
      question: 'Даны два целых числа A и B, причём A не больше B. Выведите все чётные числа от A до B включительно в одну строку через пробел. Гарантируется, что на отрезке есть хотя бы одно чётное число.\n\nФормат входных данных:\nДва целых числа A и B, каждое на новой строке.\n\nФормат выходных данных:\nВсе чётные числа отрезка в порядке возрастания.',
      starterCode: "a = int(input())\nb = int(input())\n\n# Найдите первое чётное число и задайте шаг range()",
      tests: [
        test('1\n10', '2 4 6 8 10'),
        test('-5\n3', '-4 -2 0 2'),
        test('8\n8', '8'),
        test('9\n16', '10 12 14 16'),
      ],
    }),
    make('range', {
      id: findExistingId(currentQuestions, ['Шаг назад', 'Обратный отсчёт с шагом'], 'python-for-countdown'),
      title: 'Обратный отсчёт с шагом',
      question: 'Даны целые числа A, B и положительное число K. Гарантируется, что A не меньше B. Выведите числа A, A - K, A - 2K и так далее, пока очередное число не станет меньше B. Числа разделяйте пробелом.\n\nФормат входных данных:\nТри целых числа A, B и K, каждое на новой строке.\n\nФормат выходных данных:\nПолучившаяся последовательность в одну строку.',
      starterCode: "a = int(input())\nb = int(input())\nk = int(input())\n\n# Подберите отрицательный шаг для range()",
      tests: [
        test('10\n1\n3', '10 7 4 1'),
        test('8\n8\n2', '8'),
        test('5\n-5\n4', '5 1 -3'),
        test('20\n0\n6', '20 14 8 2'),
      ],
    }),
    make('accumulators', {
      id: findExistingId(currentQuestions, ['Сумма чисел', 'Сумма введённых чисел'], 'python-for-input-sum', 2),
      title: 'Сумма введённых чисел',
      question: 'Сначала вводится количество чисел N, затем N целых чисел, каждое на новой строке. Найдите их сумму. Значения нужно считывать внутри цикла.\n\nФормат входных данных:\nЦелое число N, затем N целых чисел.\n\nФормат выходных данных:\nСумма введённых чисел.',
      starterCode: "n = int(input())\ntotal = 0\n\n# Считайте n чисел и накапливайте сумму\n\nprint(total)",
      tests: [
        test('5\n1\n2\n3\n4\n5', '15'),
        test('4\n-3\n7\n0\n-2', '2'),
        test('1\n42', '42'),
        test('6\n10\n-10\n5\n-5\n2\n-1', '1'),
      ],
    }),
    make('accumulators', {
      id: 'python-for-total-length',
      title: 'Общая длина строк',
      question: 'Сначала вводится количество строк N, затем N строк. Найдите суммарное количество символов во всех строках. Пробелы внутри строк тоже считаются символами.\n\nФормат входных данных:\nЦелое число N, затем N строк.\n\nФормат выходных данных:\nОдно целое число - общая длина строк.',
      starterCode: "n = int(input())\ntotal = 0\n\n# Прибавляйте длину каждой строки\n\nprint(total)",
      tests: [
        test('3\ncat\nhi\npython', '11'),
        test('2\nhello world\nx', '12'),
        test('1\nкод', '3'),
        test('4\na\nbb\nccc\ndddd', '10'),
      ],
    }),
    make('accumulators', {
      id: 'python-for-command-route',
      title: 'Маршрут из команд',
      question: 'Сначала вводится количество команд N, затем N команд - по одной на строке. Соберите из них одну строку, разделяя соседние команды стрелкой " -> ". После последней команды стрелки быть не должно.\n\nФормат входных данных:\nЦелое число N (1 ≤ N ≤ 20), затем N строк.\n\nФормат выходных данных:\nКоманды в исходном порядке через " -> ".',
      starterCode: "n = int(input())\nroute = ''\n\n# Добавляйте команды и разделитель без лишней стрелки в конце\n\nprint(route)",
      tests: [
        test('3\nвверх\nвправо\nстоп', 'вверх -> вправо -> стоп'),
        test('1\nстарт', 'старт'),
        test('4\nA\nB\nC\nD', 'A -> B -> C -> D'),
        test('2\nоткрыть\nсохранить', 'открыть -> сохранить'),
      ],
    }),
    make('counters', {
      id: findExistingId(currentQuestions, ['Подсчет буквы (Цикл по строке)', 'Сколько раз встретился символ'], 'python-for-count-char', 3),
      title: 'Сколько раз встретился символ',
      question: 'Считайте строку и один символ. Посчитайте, сколько раз этот символ встречается в строке. Регистр имеет значение. Используйте цикл for по строке.\n\nФормат входных данных:\nСтрока, затем один символ.\n\nФормат выходных данных:\nКоличество совпадений.',
      starterCode: "text = input()\ntarget = input()\ncount = 0\n\n# Переберите символы строки\n\nprint(count)",
      tests: [
        test('молоко\nо', '3'),
        test('Python\nP', '1'),
        test('Python\np', '0'),
        test('11101\n1', '4'),
      ],
    }),
    make('counters', {
      id: findExistingId(currentQuestions, ['Анализ оценок (Ввод внутри цикла)', 'Сколько значений равны цели'], 'python-for-count-target', 4),
      title: 'Сколько значений равны цели',
      question: 'Сначала вводятся количество значений N и искомое целое число X. Затем вводятся N целых чисел. Посчитайте, сколько из них равны X.\n\nФормат входных данных:\nВ первой строке N, во второй X, затем N целых чисел.\n\nФормат выходных данных:\nКоличество значений, равных X.',
      starterCode: "n = int(input())\ntarget = int(input())\ncount = 0\n\n# Считайте n значений и сравнивайте каждое с target\n\nprint(count)",
      tests: [
        test('6\n5\n5\n3\n5\n2\n1\n5', '3'),
        test('4\n0\n1\n2\n3\n4', '0'),
        test('5\n-2\n-2\n0\n-2\n4\n-2', '3'),
        test('1\n7\n7', '1'),
      ],
    }),
    make('counters', {
      id: 'python-for-sign-stats',
      title: 'Положительные, отрицательные и нули',
      question: 'Сначала вводится количество чисел N, затем N целых чисел. Посчитайте отдельно количество положительных чисел, отрицательных чисел и нулей.\n\nФормат входных данных:\nЦелое число N, затем N целых чисел.\n\nФормат выходных данных:\nТри числа через пробел: количество положительных, отрицательных и нулей.',
      starterCode: "n = int(input())\npositive = 0\nnegative = 0\nzeros = 0\n\n# Обновляйте один из трёх счётчиков\n\nprint(positive, negative, zeros)",
      tests: [
        test('6\n3\n-1\n0\n5\n0\n-2', '2 2 2'),
        test('4\n1\n2\n3\n4', '4 0 0'),
        test('3\n-5\n-1\n-9', '0 3 0'),
        test('5\n0\n0\n0\n0\n0', '0 0 5'),
      ],
    }),
    make('counters', {
      id: 'python-for-even-stats',
      title: 'Статистика чётных чисел',
      question: 'Сначала вводится количество чисел N, затем N целых чисел. Найдите количество чётных чисел и их сумму. Ноль считается чётным.\n\nФормат входных данных:\nЦелое число N, затем N целых чисел.\n\nФормат выходных данных:\nКоличество и сумма чётных чисел через пробел.',
      starterCode: "n = int(input())\ncount = 0\ntotal = 0\n\n# Для чётных чисел обновите оба накопителя\n\nprint(count, total)",
      tests: [
        test('5\n1\n2\n3\n4\n5', '2 6'),
        test('4\n-2\n-4\n-5\n0', '3 -6'),
        test('3\n1\n3\n5', '0 0'),
        test('6\n8\n8\n2\n1\n6\n3', '4 24'),
      ],
    }),
    make('series', {
      id: 'python-for-first-maximum',
      title: 'Первый максимум',
      question: 'Сначала вводится количество чисел N, затем N целых чисел. Найдите наибольшее значение и номер его первого появления. Нумерация начинается с 1. Не используйте готовый метод index().\n\nФормат входных данных:\nЦелое число N, затем N целых чисел.\n\nФормат выходных данных:\nМаксимальное значение и его первая позиция через пробел.',
      starterCode: "n = int(input())\nfirst = int(input())\nmaximum = first\nposition = 1\n\n# Считайте оставшиеся n - 1 чисел\n\nprint(maximum, position)",
      tests: [
        test('5\n3\n9\n2\n9\n1', '9 2'),
        test('1\n-7', '-7 1'),
        test('4\n-5\n-2\n-8\n-2', '-2 2'),
        test('6\n10\n1\n2\n3\n4\n5', '10 1'),
      ],
    }),
    make('series', {
      id: 'python-for-positive-run',
      title: 'Самая длинная положительная серия',
      question: 'Сначала вводится количество чисел N, затем N целых чисел. Найдите длину самой длинной подряд идущей серии положительных чисел. Ноль прерывает серию.\n\nФормат входных данных:\nЦелое число N, затем N целых чисел.\n\nФормат выходных данных:\nДлина самой длинной серии.',
      starterCode: "n = int(input())\ncurrent = 0\nbest = 0\n\n# Обновляйте текущую и лучшую длину серии\n\nprint(best)",
      tests: [
        test('8\n1\n2\n-1\n3\n4\n5\n0\n6', '3'),
        test('4\n-1\n0\n-2\n-3', '0'),
        test('5\n1\n2\n3\n4\n5', '5'),
        test('7\n-1\n2\n3\n0\n4\n5\n6', '3'),
      ],
    }),
    make('search', {
      id: 'python-for-first-occurrence',
      title: 'Первое вхождение',
      question: 'Сначала вводятся количество строк N и искомая строка. Затем вводятся N строк. Выведите номер первого совпадения, считая с 1. Если совпадений нет, выведите 0.\n\nФормат входных данных:\nЦелое число N, искомая строка, затем N строк.\n\nФормат выходных данных:\nПозиция первого совпадения или 0.',
      starterCode: "n = int(input())\ntarget = input()\nposition = 0\n\n# Запомните только первое совпадение\n\nprint(position)",
      tests: [
        test('5\nred\nblue\nred\ngreen\nred\nblack', '2'),
        test('3\nx\na\nb\nc', '0'),
        test('1\nstart\nstart', '1'),
        test('4\n7\n7\n7\n8\n7', '1'),
      ],
    }),
    make('search', {
      id: 'python-for-nondecreasing',
      title: 'Порядок не нарушен',
      question: 'Сначала вводится количество чисел N, затем N целых чисел. Проверьте, идут ли они в неубывающем порядке: каждое следующее число не меньше предыдущего. Выведите YES или NO.\n\nФормат входных данных:\nЦелое число N (N ≥ 1), затем N целых чисел.\n\nФормат выходных данных:\nYES, если порядок не нарушен, иначе NO.',
      starterCode: "n = int(input())\nprevious = int(input())\nis_ordered = True\n\n# Сравнивайте каждое следующее значение с previous\n\nprint('YES' if is_ordered else 'NO')",
      tests: [
        test('5\n1\n2\n2\n4\n9', 'YES'),
        test('4\n1\n3\n2\n5', 'NO'),
        test('1\n100', 'YES'),
        test('5\n-3\n-3\n-1\n0\n0', 'YES'),
      ],
    }),
    make('nested', {
      id: 'python-for-symbol-stairs',
      title: 'Лестница из символов',
      question: 'Считайте число N и один символ. Выведите N строк: в первой строке один символ, во второй - два, и так далее до N символов. Используйте вложенные циклы, не умножайте строку на число.\n\nФормат входных данных:\nЦелое число N и символ, каждый на новой строке.\n\nФормат выходных данных:\nЛестница высотой N.',
      starterCode: "n = int(input())\nsymbol = input()\n\n# Внешний цикл отвечает за строки, внутренний - за символы",
      tests: [
        test('4\n#', '#\n##\n###\n####'),
        test('1\n*', '*'),
        test('3\nA', 'A\nAA\nAAA'),
        test('5\n+', '+\n++\n+++\n++++\n+++++'),
      ],
    }),
    make('nested', {
      id: 'python-for-symbol-rectangle',
      title: 'Прямоугольник из символов',
      question: 'Считайте количество строк R, количество столбцов C и один символ. Выведите прямоугольник из этого символа размером R × C. Используйте вложенные циклы, не умножайте строку на число.\n\nФормат входных данных:\nЧисла R и C, затем символ - каждое значение на новой строке.\n\nФормат выходных данных:\nR строк по C символов.',
      starterCode: "rows = int(input())\ncols = int(input())\nsymbol = input()\n\n# Постройте каждую строку во внутреннем цикле",
      tests: [
        test('2\n3\n#', '###\n###'),
        test('1\n5\nx', 'xxxxx'),
        test('3\n1\n@', '@\n@\n@'),
        test('4\n4\n0', '0000\n0000\n0000\n0000'),
      ],
    }),
    make('nested', {
      id: 'python-for-checkerboard',
      title: 'Шахматное поле',
      question: 'Даны количество строк R и столбцов C. Выведите поле из символов # и ., чередуя их по строкам и столбцам. Левый верхний символ всегда #.\n\nФормат входных данных:\nДва целых числа R и C, каждое на новой строке.\n\nФормат выходных данных:\nR строк длины C.',
      starterCode: "rows = int(input())\ncols = int(input())\n\n# Выберите символ по номеру строки и столбца",
      tests: [
        test('3\n4', '#.#.\n.#.#\n#.#.'),
        test('1\n5', '#.#.#'),
        test('4\n1', '#\n.\n#\n.'),
        test('2\n2', '#.\n.#'),
      ],
    }),
  ];

  const subsections = [
    { id: sectionIds.range, title: sectionTitles.range, order: 0 },
    { id: sectionIds.accumulators, title: sectionTitles.accumulators, order: 1 },
    { id: sectionIds.counters, title: sectionTitles.counters, order: 2 },
    { id: sectionIds.series, title: sectionTitles.series, order: 3 },
    { id: sectionIds.search, title: sectionTitles.search, order: 4 },
    { id: sectionIds.nested, title: sectionTitles.nested, order: 5 },
  ];

  return { questions, subsections };
};

const isTargetEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (Number(entry.pythonForCurriculumVersion) >= CURRICULUM_VERSION) return false;
  const questions = Array.isArray(entry[LEVEL_ID]) ? entry[LEVEL_ID] : [];
  const titles = new Set(questions.map((question) => String(question?.title || '').trim()));
  const subsectionTitles = new Set(
    (Array.isArray(entry.pythonSubsections) ? entry.pythonSubsections : [])
      .map((section) => String(section?.title || '').trim())
  );
  return questions.length >= 7
    && titles.has('Шаг назад')
    && titles.has('Чётные на отрезке')
    && subsectionTitles.has('range() и шаг')
    && subsectionTitles.has('Накопители');
};

export const migratePythonForCurriculumStore = (storeValue) => {
  const store = clone(storeValue || {});
  const teachers = store?.teachers && typeof store.teachers === 'object' ? store.teachers : {};
  let changed = false;
  Object.values(teachers).forEach((teacherEntry) => {
    const entry = teacherEntry?.tests?.[TASK_NUMBER];
    if (!isTargetEntry(entry)) return;
    const currentQuestions = Array.isArray(entry[LEVEL_ID]) ? entry[LEVEL_ID] : [];
    const curriculum = buildCurriculum(entry, currentQuestions);
    teacherEntry.tests[TASK_NUMBER] = {
      ...entry,
      [LEVEL_ID]: curriculum.questions,
      pythonSubsections: curriculum.subsections,
      pythonForCurriculumVersion: CURRICULUM_VERSION,
    };
    changed = true;
  });
  return { store, changed };
};

export const PYTHON_FOR_CURRICULUM_VERSION = CURRICULUM_VERSION;
export const PYTHON_FOR_CURRICULUM_TASK_COUNT = 18;
