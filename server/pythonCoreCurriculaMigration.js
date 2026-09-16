const CURRICULUM_VERSION = 1;
const LEVEL_ID = 'python';

const clone = (value) => structuredClone(value);
const test = (input, output) => ({ input, output });

const formatQuestion = ({ summary, input, output }) => [
  summary,
  '',
  'Формат входных данных:',
  input,
  '',
  'Формат выходных данных:',
  output,
].join('\n');

const findExistingId = (questions, titles, fallbackId, fallbackIndex = -1) => {
  const wanted = new Set((titles || []).map((title) => String(title || '').trim()).filter(Boolean));
  const match = questions.find((question) => wanted.has(String(question?.title || '').trim()));
  if (match?.id !== null && typeof match?.id !== 'undefined') return match.id;
  const indexed = Number.isInteger(fallbackIndex) && fallbackIndex >= 0
    ? questions[fallbackIndex]
    : null;
  return indexed?.id ?? fallbackId;
};

const getExistingSectionId = (entry, titles, fallbackId) => {
  const wanted = new Set((titles || []).map((title) => String(title || '').trim()).filter(Boolean));
  const sections = Array.isArray(entry?.pythonSubsections) ? entry.pythonSubsections : [];
  return sections.find((section) => wanted.has(String(section?.title || '').trim()))?.id || fallbackId;
};

const buildCurriculum = (entry, definition) => {
  const currentQuestions = Array.isArray(entry?.[LEVEL_ID]) ? entry[LEVEL_ID] : [];
  const usedQuestionIds = new Set();
  const sections = definition.sections.map((section, order) => ({
    id: getExistingSectionId(entry, [section.title, ...(section.legacyTitles || [])], section.id),
    title: section.title,
    order,
  }));
  const sectionByKey = new Map(definition.sections.map((section, index) => [section.key, sections[index]]));
  const questions = definition.tasks.map((item, index) => {
    const section = sectionByKey.get(item.section);
    const preferredId = findExistingId(
      currentQuestions,
      [item.title, ...(item.legacyTitles || [])],
      item.id,
      Number.isInteger(item.legacyIndex) ? item.legacyIndex : -1,
    );
    let questionId = preferredId;
    if (usedQuestionIds.has(String(questionId))) questionId = item.id;
    if (usedQuestionIds.has(String(questionId))) questionId = `${item.id}-${index + 1}`;
    usedQuestionIds.add(String(questionId));
    return {
      id: questionId,
      subsectionId: section.id,
      subsectionTitle: section.title,
      title: item.title,
      question: formatQuestion(item),
      starterCode: item.starterCode || '',
      tests: item.tests,
    };
  });
  return { questions, sections };
};

const definitions = [
  {
    taskNumber: '101',
    versionField: 'pythonIoCurriculumVersion',
    signatures: ['Вежливый бот', 'Следующее и предыдущее', 'Кастомный разделитель (sep)'],
    sections: [
      { key: 'print', id: 'python-io-print', title: 'Точный вывод' },
      { key: 'strings', id: 'python-io-strings', title: 'Ввод строк' },
      { key: 'numbers', id: 'python-io-numbers', title: 'Ввод чисел' },
      { key: 'format', id: 'python-io-format', title: 'Форматирование ответа' },
    ],
    tasks: [
      {
        id: 'python-io-hello', section: 'print', title: 'Первая программа',
        summary: 'Выведите точную строку: Привет, Python! В программе не требуется input().',
        input: 'Входных данных нет.', output: 'Одна строка: Привет, Python!',
        starterCode: "# Напишите один вызов print()",
        tests: [test('', 'Привет, Python!')],
      },
      {
        id: 'python-io-three-lines', section: 'print', title: 'Три строки',
        summary: 'Выведите слова «ввод», «обработка» и «вывод» на трёх отдельных строках в указанном порядке.',
        input: 'Входных данных нет.', output: 'Три заданных слова, каждое на новой строке.',
        starterCode: "# Можно использовать три print()",
        tests: [test('', 'ввод\nобработка\nвывод')],
      },
      {
        id: 'python-io-labels', section: 'print', title: 'Подписи и значения',
        summary: 'Выведите две строки строго по образцу: «Язык: Python» и «Версия: 3».',
        input: 'Входных данных нет.', output: 'Две строки по образцу.',
        starterCode: "# Следите за двоеточиями и пробелами",
        tests: [test('', 'Язык: Python\nВерсия: 3')],
      },
      {
        id: 'python-io-echo', section: 'strings', title: 'Повторить ввод',
        summary: 'Считайте одну строку и выведите её без изменений.',
        input: 'Одна строка.', output: 'Та же строка.',
        starterCode: "text = input()\n\n# Выведите text",
        tests: [test('Python', 'Python'), test('Привет, мир!', 'Привет, мир!'), test('123 456', '123 456'), test('x', 'x')],
      },
      {
        id: 'python-io-greeting', section: 'strings', title: 'Вежливое приветствие',
        legacyTitles: ['Вежливый бот'], legacyIndex: 0,
        summary: 'Считайте имя и выведите приветствие точно в формате: Привет, Имя!',
        input: 'Одна строка - имя.', output: 'Строка приветствия.',
        starterCode: "name = input()\n\n# Соберите приветствие",
        tests: [test('Иван', 'Привет, Иван!'), test('Anna', 'Привет, Anna!'), test('Пётр', 'Привет, Пётр!'), test('X', 'Привет, X!')],
      },
      {
        id: 'python-io-full-name', section: 'strings', title: 'Фамилия перед именем',
        summary: 'Считайте имя и фамилию на разных строках. Выведите фамилию, пробел и имя.',
        input: 'Имя, затем фамилия.', output: 'Фамилия и имя через пробел.',
        starterCode: "name = input()\nsurname = input()\n\n# Измените порядок при выводе",
        tests: [test('Иван\nПетров', 'Петров Иван'), test('Anna\nSmith', 'Smith Anna'), test('Ли\nВан', 'Ван Ли'), test('A\nB', 'B A')],
      },
      {
        id: 'python-io-next-prev', section: 'numbers', title: 'Следующее и предыдущее',
        legacyTitles: ['Следующее и предыдущее'], legacyIndex: 1,
        summary: 'Считайте целое число. Выведите следующее число, затем предыдущее число - каждое на новой строке.',
        input: 'Одно целое число.', output: 'N + 1 и N - 1 на разных строках.',
        starterCode: "number = int(input())\n\n# Выведите два результата",
        tests: [test('10', '11\n9'), test('0', '1\n-1'), test('-5', '-4\n-6'), test('999', '1000\n998')],
      },
      {
        id: 'python-io-two-results', section: 'numbers', title: 'Сумма и произведение',
        legacyTitles: ['Геометрия прямоугольника (из вашего файла)'], legacyIndex: 2,
        summary: 'Считайте два целых числа. Выведите их сумму и произведение на разных строках. Формулы придумывать не нужно - задача проверяет чтение нескольких чисел и точный вывод.',
        input: 'Два целых числа, каждое на новой строке.', output: 'Сумма, затем произведение.',
        starterCode: "a = int(input())\nb = int(input())\n\n# Выведите два результата",
        tests: [test('3\n4', '7\n12'), test('-2\n5', '3\n-10'), test('0\n9', '9\n0'), test('-3\n-2', '-5\n6')],
      },
      {
        id: 'python-io-double', section: 'numbers', title: 'Удвоить число',
        summary: 'Считайте целое число и выведите его удвоенное значение.',
        input: 'Одно целое число.', output: 'Исходное число, умноженное на 2.',
        starterCode: "number = int(input())\n\n# Выполните одно вычисление",
        tests: [test('7', '14'), test('0', '0'), test('-8', '-16'), test('100', '200')],
      },
      {
        id: 'python-io-separator', section: 'format', title: 'Свой разделитель',
        legacyTitles: ['Кастомный разделитель (sep)'], legacyIndex: 3,
        summary: 'Считайте три слова и строку-разделитель. Выведите слова одной функцией print(), передав разделитель через параметр sep.',
        input: 'Три слова и разделитель, каждое значение на новой строке.', output: 'Три слова с заданным разделителем.',
        starterCode: "first = input()\nsecond = input()\nthird = input()\nseparator = input()\n\n# Используйте print(..., sep=separator)",
        tests: [test('a\nb\nc\n-', 'a-b-c'), test('один\nдва\nтри\n | ', 'один | два | три'), test('1\n2\n3\n', '123'), test('x\ny\nz\n#', 'x#y#z')],
      },
      {
        id: 'python-io-future-age', section: 'format', title: 'Возраст в будущем',
        legacyTitles: ['Машина времени'], legacyIndex: 4,
        summary: 'Считайте текущий возраст и число лет. Выведите фразу: Через N лет вам будет X лет.',
        input: 'Два целых числа: возраст и число лет.', output: 'Фраза по указанному шаблону.',
        starterCode: "age = int(input())\nyears = int(input())\n\n# Вычислите будущий возраст и используйте f-строку",
        tests: [test('15\n5', 'Через 5 лет вам будет 20 лет.'), test('20\n1', 'Через 1 лет вам будет 21 лет.'), test('0\n10', 'Через 10 лет вам будет 10 лет.'), test('37\n3', 'Через 3 лет вам будет 40 лет.')],
      },
      {
        id: 'python-io-card', section: 'format', title: 'Карточка пользователя',
        summary: 'Считайте имя, город и целый возраст. Выведите три строки с подписями «Имя:», «Город:» и «Возраст:».',
        input: 'Имя, город и возраст на отдельных строках.', output: 'Три строки с подписями и значениями.',
        starterCode: "name = input()\ncity = input()\nage = int(input())\n\n# Выведите аккуратную карточку",
        tests: [test('Иван\nМосква\n17', 'Имя: Иван\nГород: Москва\nВозраст: 17'), test('Anna\nOmsk\n20', 'Имя: Anna\nГород: Omsk\nВозраст: 20'), test('Ли\nУфа\n15', 'Имя: Ли\nГород: Уфа\nВозраст: 15'), test('X\nY\n1', 'Имя: X\nГород: Y\nВозраст: 1')],
      },
    ],
  },
  {
    taskNumber: '102',
    versionField: 'pythonVariablesCurriculumVersion',
    signatures: ['Электронная визитка', 'Стоимость покупки', 'Копилка (Обновление переменной)'],
    sections: [
      { key: 'names', id: 'python-vars-names', title: 'Хранение данных' },
      { key: 'types', id: 'python-vars-types', title: 'Типы и преобразования' },
      { key: 'update', id: 'python-vars-update', title: 'Обновление переменной' },
      { key: 'multiple', id: 'python-vars-multiple', title: 'Несколько переменных' },
    ],
    tasks: [
      {
        id: 'python-vars-card', section: 'names', title: 'Электронная визитка',
        legacyTitles: ['Электронная визитка'], legacyIndex: 0,
        summary: 'Считайте имя, фамилию и должность в отдельные переменные. Выведите строку в формате: Фамилия Имя - Должность.',
        input: 'Имя, фамилия и должность на отдельных строках.', output: 'Одна строка по заданному шаблону.',
        starterCode: "name = input()\nsurname = input()\nrole = input()\n\n# Используйте переменные в нужном порядке",
        tests: [test('Иван\nПетров\nразработчик', 'Петров Иван - разработчик'), test('Anna\nSmith\ndesigner', 'Smith Anna - designer'), test('Ли\nВан\nаналитик', 'Ван Ли - аналитик'), test('A\nB\nC', 'B A - C')],
      },
      {
        id: 'python-vars-address', section: 'names', title: 'Адрес из частей',
        summary: 'Считайте город, улицу и номер дома в три переменные. Выведите адрес: Город, улица Улица, дом N.',
        input: 'Город, улица и номер дома на отдельных строках.', output: 'Адрес по указанному шаблону.',
        starterCode: "city = input()\nstreet = input()\nhouse = input()\n\n# Соберите строку из переменных",
        tests: [test('Москва\nТверская\n10', 'Москва, улица Тверская, дом 10'), test('Омск\nМира\n5', 'Омск, улица Мира, дом 5'), test('Уфа\nЛенина\n1А', 'Уфа, улица Ленина, дом 1А'), test('X\nY\n7', 'X, улица Y, дом 7')],
      },
      {
        id: 'python-vars-copy', section: 'names', title: 'Копия значения',
        summary: 'Считайте слово в переменную original, скопируйте его в backup. Затем допишите к original символ ! и выведите original и backup на разных строках.',
        input: 'Одно слово.', output: 'Изменённое и сохранённое значения.',
        starterCode: "original = input()\nbackup = original\n\n# Измените только original",
        tests: [test('Python', 'Python!\nPython'), test('код', 'код!\nкод'), test('x', 'x!\nx'), test('123', '123!\n123')],
      },
      {
        id: 'python-vars-purchase', section: 'types', title: 'Стоимость покупки',
        legacyTitles: ['Стоимость покупки'], legacyIndex: 1,
        summary: 'Считайте целые цену и количество в переменные price и count. Сохраните произведение в total и выведите total.',
        input: 'Цена и количество, каждое на новой строке.', output: 'Общая стоимость.',
        starterCode: "price = int(input())\ncount = int(input())\n\n# Создайте переменную total",
        tests: [test('50\n3', '150'), test('0\n10', '0'), test('125\n2', '250'), test('7\n8', '56')],
      },
      {
        id: 'python-vars-convert', section: 'types', title: 'Число из строки',
        summary: 'Считайте две строки с целыми числами. Преобразуйте каждую строку в int и выведите сумму. Без преобразования строки склеились бы.',
        input: 'Две строки, каждая содержит целое число.', output: 'Числовая сумма.',
        starterCode: "first_text = input()\nsecond_text = input()\n\n# Преобразуйте строки перед сложением",
        tests: [test('12\n3', '15'), test('0\n7', '7'), test('-2\n5', '3'), test('100\n200', '300')],
      },
      {
        id: 'python-vars-float', section: 'types', title: 'Дробный результат',
        summary: 'Считайте два вещественных числа и сохраните их среднее значение в переменную average. Выведите average.',
        input: 'Два вещественных числа.', output: 'Их среднее арифметическое.',
        starterCode: "first = float(input())\nsecond = float(input())\n\n# Создайте average",
        tests: [test('1\n2', '1.5'), test('2.5\n3.5', '3.0'), test('-1\n1', '0.0'), test('10\n10', '10.0')],
      },
      {
        id: 'python-vars-piggy-bank', section: 'update', title: 'Пополнение копилки',
        legacyTitles: ['Копилка (Обновление переменной)'], legacyIndex: 2,
        summary: 'Начните с balance = 0. Считайте три пополнения и после каждого обновите balance оператором +=. Выведите: Всего в копилке: S.',
        input: 'Три целых числа на отдельных строках.', output: 'Фраза с итоговой суммой.',
        starterCode: "balance = 0\n\n# Считайте три значения и обновляйте balance",
        tests: [test('10\n20\n30', 'Всего в копилке: 60'), test('0\n5\n5', 'Всего в копилке: 10'), test('-5\n10\n2', 'Всего в копилке: 7'), test('100\n0\n1', 'Всего в копилке: 101')],
      },
      {
        id: 'python-vars-progress', section: 'update', title: 'Прогресс после двух шагов',
        summary: 'Считайте начальный прогресс и два изменения. Последовательно прибавьте оба изменения к progress и выведите значение после каждого шага.',
        input: 'Три целых числа: старт и два изменения.', output: 'Прогресс после первого и второго изменения.',
        starterCode: "progress = int(input())\nfirst_change = int(input())\nsecond_change = int(input())\n\n# Дважды обновите progress",
        tests: [test('10\n5\n3', '15\n18'), test('0\n1\n1', '1\n2'), test('20\n-5\n10', '15\n25'), test('-2\n2\n4', '0\n4')],
      },
      {
        id: 'python-vars-remaining', section: 'update', title: 'Остаток ресурса',
        legacyTitles: ['Потерянное время'], legacyIndex: 3,
        summary: 'Считайте начальный запас и два расхода. Последовательно уменьшите переменную stock оператором -= и выведите остаток.',
        input: 'Три целых числа: запас, первый и второй расход.', output: 'Оставшееся значение.',
        starterCode: "stock = int(input())\nfirst_use = int(input())\nsecond_use = int(input())\n\n# Дважды уменьшите stock",
        tests: [test('100\n20\n30', '50'), test('10\n5\n5', '0'), test('50\n0\n7', '43'), test('8\n3\n2', '3')],
      },
      {
        id: 'python-vars-roles', section: 'multiple', title: 'Герой и злодей',
        legacyTitles: ['Обмен ролями (Логика)'], legacyIndex: 4,
        summary: 'Считайте имена героя и злодея в отдельные переменные. Выведите: Злодей победил персонажа Герой.',
        input: 'Имя героя и имя злодея на разных строках.', output: 'Фраза с переменными в обратном порядке.',
        starterCode: "hero = input()\nvillain = input()\n\n# Выведите villain перед hero",
        tests: [test('Бэтмен\nДжокер', 'Джокер победил персонажа Бэтмен.'), test('A\nB', 'B победил персонажа A.'), test('Кот\nПёс', 'Пёс победил персонажа Кот.'), test('1\n2', '2 победил персонажа 1.')],
      },
      {
        id: 'python-vars-swap', section: 'multiple', title: 'Поменять местами',
        summary: 'Считайте значения A и B. Поменяйте содержимое переменных местами с помощью a, b = b, a и выведите их.',
        input: 'Две строки A и B.', output: 'Новые A и B на разных строках.',
        starterCode: "a = input()\nb = input()\n\n# Выполните обмен одной строкой",
        tests: [test('лево\nправо', 'право\nлево'), test('1\n2', '2\n1'), test('x\ny', 'y\nx'), test('один\nдва', 'два\nодин')],
      },
      {
        id: 'python-vars-rotate', section: 'multiple', title: 'Циклический обмен',
        summary: 'Считайте A, B и C. Выполните циклический обмен: новое A получает B, новое B получает C, новое C получает A. Выведите новые значения.',
        input: 'Три строки A, B и C.', output: 'Новые A, B и C на отдельных строках.',
        starterCode: "a = input()\nb = input()\nc = input()\n\n# Используйте множественное присваивание",
        tests: [test('1\n2\n3', '2\n3\n1'), test('a\nb\nc', 'b\nc\na'), test('x\ny\nx', 'y\nx\nx'), test('лево\nцентр\nправо', 'центр\nправо\nлево')],
      },
    ],
  },
  {
    taskNumber: '103',
    versionField: 'pythonConditionsCurriculumVersion',
    signatures: ['Фейсконтроль', 'Оценка за тест', 'Кто больше?'],
    sections: [
      { key: 'simple', id: 'python-if-simple', title: 'Простой выбор' },
      { key: 'elif', id: 'python-if-elif', title: 'Несколько вариантов' },
      { key: 'logic', id: 'python-if-logic', title: 'Составные условия' },
      { key: 'strings', id: 'python-if-strings', title: 'Условия со строками' },
      { key: 'decisions', id: 'python-if-decisions', title: 'Проверка данных' },
    ],
    tasks: [
      {
        id: 'python-if-age', section: 'simple', title: 'Проверка возраста',
        legacyTitles: ['Фейсконтроль'], legacyIndex: 0,
        summary: 'Если возраст не меньше 18, выведите «Доступ разрешен», иначе - «Доступ запрещен».',
        input: 'Одно целое число - возраст.', output: 'Одно из двух сообщений.',
        starterCode: "age = int(input())\n\n# Сравните age с 18",
        tests: [test('18', 'Доступ разрешен'), test('25', 'Доступ разрешен'), test('17', 'Доступ запрещен'), test('0', 'Доступ запрещен')],
      },
      {
        id: 'python-if-sign', section: 'simple', title: 'Знак числа',
        summary: 'Определите знак числа: выведите «положительное», «отрицательное» или «ноль».',
        input: 'Одно целое число.', output: 'Одна из трёх строк.',
        starterCode: "number = int(input())\n\n# Сначала проверьте один знак, затем другой",
        tests: [test('7', 'положительное'), test('-3', 'отрицательное'), test('0', 'ноль'), test('100', 'положительное')],
      },
      {
        id: 'python-if-compare', section: 'simple', title: 'Сравнить два числа',
        legacyTitles: ['Кто больше?'], legacyIndex: 4,
        summary: 'Сравните A и B. Выведите «Первое больше», «Второе больше» или «Числа равны».',
        input: 'Два целых числа, каждое на новой строке.', output: 'Результат сравнения.',
        starterCode: "a = int(input())\nb = int(input())\n\n# Нужны три возможных исхода",
        tests: [test('5\n2', 'Первое больше'), test('1\n9', 'Второе больше'), test('4\n4', 'Числа равны'), test('-3\n-5', 'Первое больше')],
      },
      {
        id: 'python-if-grade', section: 'elif', title: 'Оценка результата',
        legacyTitles: ['Оценка за тест'], legacyIndex: 1,
        summary: 'По баллу выведите: от 90 - «Отлично», от 70 - «Хорошо», от 50 - «Удовлетворительно», иначе «Неудовлетворительно».',
        input: 'Целое число от 0 до 100.', output: 'Текстовая оценка.',
        starterCode: "score = int(input())\n\n# Проверяйте границы сверху вниз",
        tests: [test('100', 'Отлично'), test('90', 'Отлично'), test('89', 'Хорошо'), test('70', 'Хорошо'), test('69', 'Удовлетворительно'), test('50', 'Удовлетворительно'), test('49', 'Неудовлетворительно'), test('0', 'Неудовлетворительно')],
      },
      {
        id: 'python-if-traffic', section: 'elif', title: 'Сигнал светофора',
        legacyTitles: ['Светофор'], legacyIndex: 3,
        summary: 'Для красного выведите «Стой», для жёлтого или желтого - «Жди», для зелёного или зеленого - «Иди», иначе «Непонятный сигнал». Регистр не важен.',
        input: 'Одна строка - цвет.', output: 'Действие для сигнала.',
        starterCode: "color = input().lower()\n\n# Используйте цепочку if / elif / else",
        tests: [test('красный', 'Стой'), test('ЖЕЛТЫЙ', 'Жди'), test('зелёный', 'Иди'), test('синий', 'Непонятный сигнал'), test('Красный', 'Стой')],
      },
      {
        id: 'python-if-command', section: 'elif', title: 'Команда меню',
        summary: 'По команде start, pause или stop выведите «Запуск», «Пауза» или «Остановка». Для другой команды выведите «Неизвестная команда».',
        input: 'Одна строка - команда.', output: 'Соответствующее сообщение.',
        starterCode: "command = input().lower()\n\n# Сопоставьте строку с тремя командами",
        tests: [test('start', 'Запуск'), test('PAUSE', 'Пауза'), test('Stop', 'Остановка'), test('run', 'Неизвестная команда')],
      },
      {
        id: 'python-if-range', section: 'logic', title: 'Число в диапазоне',
        summary: 'Проверьте, находится ли число X в диапазоне от A до B включительно. Гарантируется A ≤ B. Выведите «да» или «нет».',
        input: 'Три целых числа X, A и B.', output: 'да или нет.',
        starterCode: "x = int(input())\na = int(input())\nb = int(input())\n\n# Объедините две границы оператором and",
        tests: [test('5\n1\n10', 'да'), test('1\n1\n10', 'да'), test('10\n1\n10', 'да'), test('11\n1\n10', 'нет')],
      },
      {
        id: 'python-if-even-positive', section: 'logic', title: 'Положительное чётное',
        summary: 'Выведите «да», если число одновременно положительное и чётное. Во всех остальных случаях выведите «нет».',
        input: 'Одно целое число.', output: 'да или нет.',
        starterCode: "number = int(input())\n\n# Нужны две проверки, соединённые and",
        tests: [test('8', 'да'), test('7', 'нет'), test('-4', 'нет'), test('0', 'нет')],
      },
      {
        id: 'python-if-weekend', section: 'logic', title: 'Выходной день',
        summary: 'Считайте сокращение дня недели. Если введено «сб» или «вс» без учёта регистра, выведите «выходной», иначе «будний».',
        input: 'Одна строка.', output: 'выходной или будний.',
        starterCode: "day = input().lower()\n\n# Объедините два допустимых значения оператором or или in",
        tests: [test('сб', 'выходной'), test('ВС', 'выходной'), test('пн', 'будний'), test('ср', 'будний')],
      },
      {
        id: 'python-if-access-pair', section: 'logic', title: 'Логин и пароль',
        summary: 'Доступ разрешён только при логине admin и пароле qwerty. Выведите «Вход выполнен» или «Ошибка доступа».',
        input: 'Логин и пароль на разных строках.', output: 'Результат проверки.',
        starterCode: "login = input()\npassword = input()\n\n# Обе проверки должны быть истинны",
        tests: [test('admin\nqwerty', 'Вход выполнен'), test('admin\n123', 'Ошибка доступа'), test('user\nqwerty', 'Ошибка доступа'), test('Admin\nqwerty', 'Ошибка доступа')],
      },
      {
        id: 'python-if-password', section: 'strings', title: 'Строгий пароль',
        legacyTitles: ['Строгий пароль'], legacyIndex: 2,
        summary: 'Правильный пароль - Python2026 с точным регистром. Выведите «Вход выполнен» при совпадении, иначе «Ошибка доступа».',
        input: 'Одна строка - пароль.', output: 'Результат проверки.',
        starterCode: "password = input()\n\n# Сравните строки точно",
        tests: [test('Python2026', 'Вход выполнен'), test('python2026', 'Ошибка доступа'), test('Python2026 ', 'Ошибка доступа'), test('Python2025', 'Ошибка доступа')],
      },
      {
        id: 'python-if-confirm', section: 'strings', title: 'Подтверждение действия',
        summary: 'Считайте ответ. Значения «да», «yes» и «y» без учёта регистра означают подтверждение. Выведите «Подтверждено» или «Отменено».',
        input: 'Одна строка.', output: 'Подтверждено или Отменено.',
        starterCode: "answer = input().lower()\n\n# Проверьте принадлежность к набору ответов",
        tests: [test('да', 'Подтверждено'), test('YES', 'Подтверждено'), test('Y', 'Подтверждено'), test('нет', 'Отменено')],
      },
      {
        id: 'python-if-prefix', section: 'strings', title: 'Служебный префикс',
        summary: 'Если строка начинается с «admin:», выведите «служебная», если с «user:» - «пользовательская», иначе «неизвестная».',
        input: 'Одна строка.', output: 'Тип строки.',
        starterCode: "text = input()\n\n# Используйте startswith() и elif",
        tests: [test('admin:reset', 'служебная'), test('user:ivan', 'пользовательская'), test('guest:test', 'неизвестная'), test('admin:', 'служебная')],
      },
      {
        id: 'python-if-max-three', section: 'decisions', title: 'Наибольшее из трёх',
        summary: 'Считайте три целых числа и выведите наибольшее, используя условия. Не используйте max().',
        input: 'Три целых числа на отдельных строках.', output: 'Наибольшее значение.',
        starterCode: "a = int(input())\nb = int(input())\nc = int(input())\nanswer = a\n\n# Обновляйте answer, если найдено большее число",
        tests: [test('1\n5\n3', '5'), test('9\n2\n4', '9'), test('-3\n-1\n-2', '-1'), test('7\n7\n5', '7')],
      },
      {
        id: 'python-if-time', section: 'decisions', title: 'Проверка времени',
        summary: 'Время корректно, если часы от 0 до 23, а минуты от 0 до 59. Выведите «корректно» или «ошибка».',
        input: 'Целые часы и минуты на разных строках.', output: 'корректно или ошибка.',
        starterCode: "hours = int(input())\nminutes = int(input())\n\n# Проверьте обе границы для обоих значений",
        tests: [test('12\n30', 'корректно'), test('23\n59', 'корректно'), test('24\n0', 'ошибка'), test('10\n60', 'ошибка')],
      },
      {
        id: 'python-if-username', section: 'decisions', title: 'Проверка имени пользователя',
        summary: 'Имя пользователя допустимо, если его длина от 3 до 12 символов включительно и оно состоит только из букв и цифр. Выведите «принято» или «ошибка».',
        input: 'Одна непустая строка.', output: 'принято или ошибка.',
        starterCode: "username = input()\n\n# Объедините проверку длины и isalnum()",
        tests: [test('ivan100', 'принято'), test('ab', 'ошибка'), test('verylongname99', 'ошибка'), test('ivan_100', 'ошибка')],
      },
    ],
  },
  {
    taskNumber: '104',
    versionField: 'pythonCalculationsCurriculumVersion',
    signatures: ['Обмен валют', 'Электронные часы', 'Дележ яблок'],
    sections: [
      { key: 'operators', id: 'python-calc-operators', title: 'Операции и типы' },
      { key: 'division', id: 'python-calc-division', title: 'Целочисленное деление' },
      { key: 'precision', id: 'python-calc-precision', title: 'Точность и округление' },
      { key: 'state', id: 'python-calc-state', title: 'Изменение значений' },
      { key: 'formulas', id: 'python-calc-formulas', title: 'Составные вычисления' },
    ],
    tasks: [
      {
        id: 'python-calc-sum-two', section: 'operators', title: 'Сумма двух чисел',
        summary: 'Считайте два целых числа и выведите их сумму. Задача закрепляет int(input()) и оператор +.',
        input: 'Два целых числа, каждое на новой строке.', output: 'Одно целое число - сумма.',
        starterCode: "a = int(input())\nb = int(input())\n\n# Выведите сумму",
        tests: [test('2\n5', '7'), test('-4\n9', '5'), test('0\n0', '0'), test('100\n-250', '-150')],
      },
      {
        id: 'python-calc-order', section: 'operators', title: 'Порядок действий',
        legacyTitles: ['Магия куба'], legacyIndex: 1,
        summary: 'Даны A, B и C. Вычислите (A + B) * C и A + B * C. Выведите результаты на разных строках. Скобки в первой формуле обязательны.',
        input: 'Три целых числа, каждое на новой строке.', output: 'Два результата, каждый на новой строке.',
        starterCode: "a = int(input())\nb = int(input())\nc = int(input())\n\n# Сравните два порядка действий",
        tests: [test('2\n3\n4', '20\n14'), test('-1\n5\n2', '8\n9'), test('0\n7\n3', '21\n21'), test('10\n-2\n5', '40\n0')],
      },
      {
        id: 'python-calc-cast', section: 'operators', title: 'Целая и дробная части',
        summary: 'Считайте дробное число. Выведите его целую часть с помощью int(), затем разность между исходным числом и целой частью.',
        input: 'Одно неотрицательное вещественное число.', output: 'Целая часть и остаток, округлённый до двух знаков, на разных строках.',
        starterCode: "value = float(input())\n\n# Получите целую и дробную части",
        tests: [test('12.75', '12\n0.75'), test('8.0', '8\n0.0'), test('0.3', '0\n0.3'), test('101.09', '101\n0.09')],
      },
      {
        id: 'python-calc-minutes', section: 'division', title: 'Минуты в часы',
        legacyTitles: ['Электронные часы'], legacyIndex: 2,
        summary: 'Дано количество минут с начала отсчёта. Выведите число полных часов и оставшихся минут. Используйте // и %.',
        input: 'Одно неотрицательное целое число - количество минут.', output: 'Строка вида: H ч. M мин.',
        starterCode: "minutes = int(input())\n\n# // даст часы, % даст остаток",
        tests: [test('135', '2 ч. 15 мин.'), test('59', '0 ч. 59 мин.'), test('60', '1 ч. 0 мин.'), test('1441', '24 ч. 1 мин.')],
      },
      {
        id: 'python-calc-quotient-remainder', section: 'division', title: 'Частное и остаток',
        legacyTitles: ['Дележ яблок', 'Делёж яблок'], legacyIndex: 3,
        summary: 'Считайте два целых числа A и B, B не равно нулю. Выведите результат целочисленного деления A на B и остаток от деления.',
        input: 'Два целых числа A и B, каждое на новой строке.', output: 'Частное и остаток, каждый на новой строке.',
        starterCode: "a = int(input())\nb = int(input())\n\n# Используйте // и %",
        tests: [test('17\n5', '3\n2'), test('20\n4', '5\n0'), test('3\n8', '0\n3'), test('100\n9', '11\n1')],
      },
      {
        id: 'python-calc-seconds', section: 'division', title: 'Секунды в формат времени',
        summary: 'Переведите общее количество секунд в часы, минуты и секунды. Сначала отделите полные часы, затем минуты.',
        input: 'Одно неотрицательное целое число.', output: 'Три числа H M S через пробел.',
        starterCode: "total = int(input())\n\n# Последовательно отделите часы и минуты",
        tests: [test('3661', '1 1 1'), test('59', '0 0 59'), test('3600', '1 0 0'), test('7325', '2 2 5')],
      },
      {
        id: 'python-calc-last-digits', section: 'division', title: 'Последние две цифры',
        summary: 'Считайте неотрицательное целое число. Выведите его предпоследнюю и последнюю цифры через пробел. Для однозначного числа предпоследняя цифра равна 0.',
        input: 'Одно неотрицательное целое число.', output: 'Две цифры через пробел.',
        starterCode: "number = int(input())\n\n# Используйте // и %",
        tests: [test('583', '8 3'), test('7', '0 7'), test('120', '2 0'), test('9999', '9 9')],
      },
      {
        id: 'python-calc-round', section: 'precision', title: 'Округление результата',
        summary: 'Считайте два вещественных числа. Выведите их среднее арифметическое, округлённое функцией round() до двух знаков.',
        input: 'Два вещественных числа, каждое на новой строке.', output: 'Среднее значение, округлённое до двух знаков.',
        starterCode: "a = float(input())\nb = float(input())\n\n# Найдите среднее и примените round",
        tests: [test('1\n2', '1.5'), test('2.25\n3.1', '2.67'), test('-1\n1', '0.0'), test('10.999\n11.001', '11.0')],
      },
      {
        id: 'python-calc-money-format', section: 'precision', title: 'Денежный формат',
        summary: 'Даны цена одного товара и количество. Выведите общую стоимость ровно с двумя цифрами после точки. Используйте форматирование :.2f.',
        input: 'Вещественная цена и целое количество, каждое на новой строке.', output: 'Стоимость в формате 0.00.',
        starterCode: "price = float(input())\ncount = int(input())\n\n# Выведите f-строку с форматом .2f",
        tests: [test('12.5\n3', '37.50'), test('0.99\n2', '1.98'), test('100\n1', '100.00'), test('7.333\n3', '22.00')],
      },
      {
        id: 'python-calc-percent', section: 'precision', title: 'Изменение на процент',
        legacyTitles: ['Обмен валют'], legacyIndex: 0,
        summary: 'Даны исходное значение и процент изменения. Увеличьте значение на этот процент и выведите результат с двумя знаками после точки. Формула: value * (1 + percent / 100).',
        input: 'Вещественное значение и вещественный процент.', output: 'Новое значение с двумя знаками после точки.',
        starterCode: "value = float(input())\npercent = float(input())\n\n# Примените данную формулу",
        tests: [test('100\n10', '110.00'), test('80\n25', '100.00'), test('12.5\n4', '13.00'), test('0\n50', '0.00')],
      },
      {
        id: 'python-calc-swap', section: 'state', title: 'Обмен значений',
        summary: 'Считайте значения A и B, поменяйте их местами одной операцией присваивания и выведите новый A, затем новый B.',
        input: 'Две строки A и B.', output: 'Значения после обмена, каждое на новой строке.',
        starterCode: "a = input()\nb = input()\n\n# Используйте a, b = b, a",
        tests: [test('лево\nправо', 'право\nлево'), test('1\n2', '2\n1'), test('x\nx', 'x\nx'), test('Python\nкод', 'код\nPython')],
      },
      {
        id: 'python-calc-counter-update', section: 'state', title: 'Обновление счётчика',
        summary: 'Дано начальное значение счётчика и три изменения. Последовательно примените изменения оператором += и выведите итог.',
        input: 'Четыре целых числа: начальное значение и три изменения.', output: 'Итоговое значение счётчика.',
        starterCode: "counter = int(input())\n\n# Трижды считайте изменение и обновите counter",
        tests: [test('10\n2\n-3\n5', '14'), test('0\n1\n1\n1', '3'), test('7\n-7\n10\n-2', '8'), test('-5\n2\n2\n2', '1')],
      },
      {
        id: 'python-calc-balance', section: 'state', title: 'Баланс после операций',
        summary: 'Считайте начальный баланс, пополнение и списание. Сначала прибавьте пополнение, затем вычтите списание. Выведите итоговый баланс.',
        input: 'Три целых числа, каждое на новой строке.', output: 'Одно целое число - итоговый баланс.',
        starterCode: "balance = int(input())\ndeposit = int(input())\nwithdrawal = int(input())\n\n# Обновите balance по порядку",
        tests: [test('1000\n500\n200', '1300'), test('0\n100\n40', '60'), test('50\n0\n50', '0'), test('-20\n30\n5', '5')],
      },
      {
        id: 'python-calc-trip', section: 'formulas', title: 'Расчёт по формуле',
        legacyTitles: ['Стоимость поездки'], legacyIndex: 4,
        summary: 'Вычислите стоимость поездки по готовой формуле: distance / 100 * consumption * price. Выведите результат с двумя знаками после точки.',
        input: 'Расстояние, расход на 100 км и цена литра - три числа.', output: 'Стоимость поездки с двумя знаками после точки.',
        starterCode: "distance = float(input())\nconsumption = float(input())\nprice = float(input())\n\n# Подставьте значения в формулу",
        tests: [test('200\n8\n50', '800.00'), test('100\n5.5\n60', '330.00'), test('0\n10\n70', '0.00'), test('350\n7\n55', '1347.50')],
      },
      {
        id: 'python-calc-weighted', section: 'formulas', title: 'Взвешенный результат',
        summary: 'Даны две оценки и вес первой оценки в процентах. Вес второй равен 100 минус первый вес. Выведите взвешенный результат с двумя знаками после точки.',
        input: 'Первая оценка, вторая оценка и целый вес первой оценки.', output: 'Взвешенный результат с двумя знаками.',
        starterCode: "first = float(input())\nsecond = float(input())\nfirst_weight = int(input())\n\n# Переведите проценты в доли",
        tests: [test('80\n100\n25', '95.00'), test('50\n70\n50', '60.00'), test('10\n20\n100', '10.00'), test('4.5\n5\n60', '4.70')],
      },
      {
        id: 'python-calc-page', section: 'formulas', title: 'Номер страницы и позиция',
        summary: 'Элементы нумеруются с 1 и выводятся по K элементов на странице. По номеру элемента N найдите номер страницы и позицию на странице.',
        input: 'Целые N и K, каждое на новой строке.', output: 'Номер страницы и позиция через пробел.',
        starterCode: "n = int(input())\nk = int(input())\n\n# Для нумерации с 1 удобно использовать n - 1",
        tests: [test('1\n10', '1 1'), test('10\n10', '1 10'), test('11\n10', '2 1'), test('37\n8', '5 5')],
      },
    ],
  },
  {
    taskNumber: '106',
    versionField: 'pythonStringsCurriculumVersion',
    signatures: ['Первый и последний', 'Убираем границы (Срезы)', 'Имя файла'],
    sections: [
      { key: 'access', id: 'python-strings-access', title: 'Индексы и срезы' },
      { key: 'methods', id: 'python-strings-methods', title: 'Методы строк' },
      { key: 'checks', id: 'python-strings-checks', title: 'Проверка содержимого' },
      { key: 'analysis', id: 'python-strings-analysis', title: 'Анализ символов' },
      { key: 'build', id: 'python-strings-build', title: 'Сборка новой строки' },
    ],
    tasks: [
      {
        id: 'python-strings-first-last', section: 'access', title: 'Первый, последний и длина',
        legacyTitles: ['Первый и последний'], legacyIndex: 0,
        summary: 'Считайте непустую строку. Выведите её длину, первый символ и последний символ - каждое значение на новой строке.',
        input: 'Одна непустая строка.', output: 'Длина, первый и последний символы на разных строках.',
        starterCode: "text = input()\n\n# Используйте len(), [0] и [-1]",
        tests: [test('Python', '6\nP\nn'), test('я', '1\nя\nя'), test('12345', '5\n1\n5'), test('hello world', '11\nh\nd')],
      },
      {
        id: 'python-strings-inner', section: 'access', title: 'Строка без границ',
        legacyTitles: ['Убираем границы (Срезы)'], legacyIndex: 1,
        summary: 'Считайте строку длиной не меньше двух символов и выведите её без первого и последнего символов.',
        input: 'Одна строка длиной не меньше 2.', output: 'Срез строки без крайних символов.',
        starterCode: "text = input()\n\n# Возьмите срез от второго символа до последнего",
        tests: [test('Python', 'ytho'), test('ab', ''), test('[данные]', 'данные'), test('12345', '234')],
      },
      {
        id: 'python-strings-reverse', section: 'access', title: 'Разворот строки',
        legacyTitles: ['Разворот строки'], legacyIndex: 9,
        summary: 'Считайте строку и выведите символы в обратном порядке. Используйте срез с отрицательным шагом.',
        input: 'Одна строка.', output: 'Исходная строка задом наперёд.',
        starterCode: "text = input()\n\n# Срез с шагом -1 развернёт строку",
        tests: [test('Python', 'nohtyP'), test('топот', 'топот'), test('123 45', '54 321'), test('a', 'a')],
      },
      {
        id: 'python-strings-every-second', section: 'access', title: 'Символы через один',
        legacyTitles: ['Шаг через один'], legacyIndex: 10,
        summary: 'Выведите символы строки с индексами 0, 2, 4 и так далее. Используйте срез с шагом 2.',
        input: 'Одна строка.', output: 'Символы на чётных индексах.',
        starterCode: "text = input()\n\n# Укажите шаг в срезе",
        tests: [test('Крокодил', 'Коои'), test('abcdef', 'ace'), test('12345', '135'), test('x', 'x')],
      },
      {
        id: 'python-strings-case', section: 'methods', title: 'Два регистра',
        legacyTitles: ['Громкоговоритель'], legacyIndex: 4,
        summary: 'Считайте строку. Выведите её сначала в нижнем, затем в верхнем регистре.',
        input: 'Одна строка.', output: 'Строка в нижнем и верхнем регистре на разных строках.',
        starterCode: "text = input()\n\n# Примените lower() и upper()",
        tests: [test('PyThOn', 'python\nPYTHON'), test('ПрИвЕт', 'привет\nПРИВЕТ'), test('123abc', '123abc\n123ABC'), test('A B', 'a b\nA B')],
      },
      {
        id: 'python-strings-replace', section: 'methods', title: 'Замена фрагмента',
        legacyTitles: ['Автозамена'], legacyIndex: 3,
        summary: 'Считайте строку, искомый фрагмент и замену. Замените все вхождения искомого фрагмента методом replace().',
        input: 'Три строки: текст, что заменить, на что заменить.', output: 'Строка после всех замен.',
        starterCode: "text = input()\nold = input()\nnew = input()\n\n# Замените все вхождения",
        tests: [test('мне плохо и коту плохо\nплохо\nхорошо', 'мне хорошо и коту хорошо'), test('aaaa\naa\nb', 'bb'), test('hello\nx\ny', 'hello'), test('1-2-3\n-\n:', '1:2:3')],
      },
      {
        id: 'python-strings-find', section: 'methods', title: 'Позиция фрагмента',
        legacyTitles: ['Где собака зарыта?'], legacyIndex: 2,
        summary: 'Считайте строку и фрагмент. Выведите индекс первого вхождения фрагмента. Если его нет, метод find() вернёт -1.',
        input: 'Текст и искомый фрагмент на разных строках.', output: 'Индекс первого вхождения.',
        starterCode: "text = input()\nfragment = input()\n\n# Используйте find()",
        tests: [test('mail@example.ru\n@', '4'), test('banana\nna', '2'), test('python\nz', '-1'), test('aaaa\naa', '0')],
      },
      {
        id: 'python-strings-strip', section: 'methods', title: 'Очистка краёв',
        legacyTitles: ['Очистка от пробелов'], legacyIndex: 13,
        summary: 'Удалите пробелы в начале и конце строки методом strip(). Выведите очищенную строку и её длину.',
        input: 'Одна строка, возможно с пробелами по краям.', output: 'Очищенная строка и её длина на разных строках.',
        starterCode: "text = input()\n\n# Сохраните результат strip()",
        tests: [test('  Привет  ', 'Привет\n6'), test('Python', 'Python\n6'), test('   x', 'x\n1'), test('a b  ', 'a b\n3')],
      },
      {
        id: 'python-strings-digits', section: 'checks', title: 'Строка из цифр',
        legacyTitles: ['Детектор чисел'], legacyIndex: 6,
        summary: 'Проверьте методом isdigit(), состоит ли строка только из цифр. Выведите «да» или «нет».',
        input: 'Одна непустая строка.', output: 'да, если все символы - цифры, иначе нет.',
        starterCode: "text = input()\n\n# Проверьте строку методом isdigit()",
        tests: [test('12345', 'да'), test('12a5', 'нет'), test('-42', 'нет'), test('007', 'да')],
      },
      {
        id: 'python-strings-name', section: 'checks', title: 'Корректное имя',
        legacyTitles: ['Только буквы'], legacyIndex: 7,
        summary: 'Имя считается корректным, если оно непустое и состоит только из букв. Выведите приветствие или сообщение «Некорректное имя».',
        input: 'Одна строка - имя.', output: 'Привет, Имя! или Некорректное имя.',
        starterCode: "name = input()\n\n# Используйте isalpha()",
        tests: [test('Иван', 'Привет, Иван!'), test('Ivan777', 'Некорректное имя'), test('Анна Мария', 'Некорректное имя'), test('Li', 'Привет, Li!')],
      },
      {
        id: 'python-strings-file-type', section: 'checks', title: 'Тип файла',
        legacyTitles: ['Имя файла'], legacyIndex: 14,
        summary: 'Определите тип файла по окончанию имени без учёта регистра: .py - «Python», .jpg или .png - «Изображение», иначе «Другой».',
        input: 'Одна строка - имя файла.', output: 'Python, Изображение или Другой.',
        starterCode: "filename = input().lower()\n\n# Проверьте окончания методом endswith()",
        tests: [test('main.py', 'Python'), test('PHOTO.PNG', 'Изображение'), test('cat.jpg', 'Изображение'), test('notes.txt', 'Другой')],
      },
      {
        id: 'python-strings-word-count', section: 'analysis', title: 'Количество слов',
        legacyTitles: ['Калькулятор слов'], legacyIndex: 5,
        summary: 'В строке слова разделены одним пробелом, лишних пробелов нет. Выведите количество слов.',
        input: 'Одна непустая строка.', output: 'Количество слов.',
        starterCode: "text = input()\n\n# Можно посчитать пробелы или использовать split()",
        tests: [test('Мама мыла раму', '3'), test('Python', '1'), test('a b c d e', '5'), test('два слова', '2')],
      },
      {
        id: 'python-strings-char-count', section: 'analysis', title: 'Сколько раз встретился символ',
        summary: 'Считайте строку и один символ. Посчитайте его вхождения без учёта регистра.',
        input: 'Строка и один символ на разных строках.', output: 'Количество вхождений.',
        starterCode: "text = input()\nsymbol = input()\n\n# Приведите обе строки к одному регистру",
        tests: [test('Banana\na', '3'), test('Привет, Пётр!\nп', '2'), test('123123\n4', '0'), test('AAAA\na', '4')],
      },
      {
        id: 'python-strings-vowels', section: 'analysis', title: 'Количество гласных',
        legacyTitles: ['Поиск гласных'], legacyIndex: 11,
        summary: 'Посчитайте русские гласные в строке без учёта регистра. Гласные: а, у, о, ы, и, э, я, ю, ё, е.',
        input: 'Одна строка.', output: 'Количество гласных букв.',
        starterCode: "text = input().lower()\nvowels = 'ауоыиэяюёе'\ncount = 0\n\n# Переберите символы строки",
        tests: [test('Молоко', '3'), test('Ёжик', '2'), test('Python', '0'), test('АЭРОПОРТ', '4')],
      },
      {
        id: 'python-strings-alternating', section: 'analysis', title: 'Чередование регистра',
        legacyTitles: ['Заборчик (Верхний и нижний регистр)'], legacyIndex: 8,
        summary: 'Постройте строку, где символы на чётных индексах записаны в нижнем регистре, а на нечётных - в верхнем.',
        input: 'Одна строка.', output: 'Строка с чередующимся регистром.',
        starterCode: "text = input()\nresult = ''\n\n# Переберите индексы и добавляйте символы в result",
        tests: [test('привет', 'пРиВеТ'), test('PYTHON', 'pYtHoN'), test('a1b2c', 'a1b2c'), test('Ab', 'aB')],
      },
      {
        id: 'python-strings-double', section: 'build', title: 'Удвоение символов',
        legacyTitles: ['Удвоитель'], legacyIndex: 12,
        summary: 'Создайте новую строку, в которой каждый символ исходной строки повторяется два раза.',
        input: 'Одна строка.', output: 'Строка с удвоенными символами.',
        starterCode: "text = input()\nresult = ''\n\n# Добавляйте каждый символ дважды",
        tests: [test('Кот', 'ККоотт'), test('ab!', 'aabb!!'), test('1', '11'), test('a b', 'aa  bb')],
      },
      {
        id: 'python-strings-only-digits', section: 'build', title: 'Оставить только цифры',
        summary: 'Соберите новую строку только из цифр, встречающихся в исходной строке, сохранив их порядок.',
        input: 'Одна строка.', output: 'Все цифры исходной строки подряд. Если цифр нет, пустая строка.',
        starterCode: "text = input()\nresult = ''\n\n# Проверяйте каждый символ методом isdigit()",
        tests: [test('тел. +7 (999) 12-34', '79991234'), test('abc', ''), test('20 котов и 3 пса', '203'), test('001-a', '001')],
      },
      {
        id: 'python-strings-collapse', section: 'build', title: 'Убрать соседние повторы',
        summary: 'Удалите повторяющиеся подряд символы, оставив по одному символу из каждой серии. Порядок остальных символов сохраните.',
        input: 'Одна непустая строка.', output: 'Строка без соседних повторов.',
        starterCode: "text = input()\nresult = text[0]\n\n# Сравнивайте очередной символ с последним добавленным",
        tests: [test('aaabbccccaa', 'abca'), test('Python', 'Python'), test('111223', '123'), test('   a  b', ' a b')],
      },
    ],
  },
  {
    taskNumber: '107',
    versionField: 'pythonWhileCurriculumVersion',
    signatures: ['Эхо до стоп-слова', 'Сумма цифр числа', 'Упорный пароль'],
    sections: [
      { key: 'sentinel', id: 'python-while-sentinel', title: 'Цикл до сигнала' },
      { key: 'counter', id: 'python-while-counter', title: 'Счётчик цикла' },
      { key: 'digits', id: 'python-while-digits', title: 'Обработка цифр' },
      { key: 'threshold', id: 'python-while-threshold', title: 'Движение к цели' },
      { key: 'search', id: 'python-while-search', title: 'Проверка и поиск' },
    ],
    tasks: [
      {
        id: 'python-while-echo', section: 'sentinel', title: 'Эхо до стоп-слова',
        legacyTitles: ['Эхо до стоп-слова'], legacyIndex: 0,
        summary: 'Читайте строки и сразу выводите их, пока не встретится слово «стоп» без учёта регистра. Само стоп-слово не выводите.',
        input: 'Несколько строк, последняя строка - стоп в любом регистре.', output: 'Все строки до стоп-слова, каждая на новой строке.',
        starterCode: "text = input()\n\n# Продолжайте, пока text.lower() не равно 'стоп'",
        tests: [test('один\nдва\nстоп', 'один\nдва'), test('СТОП', ''), test('Python\nСтОп', 'Python'), test('stop\nстоп', 'stop')],
      },
      {
        id: 'python-while-sum-zero', section: 'sentinel', title: 'Сумма до нуля',
        summary: 'Читайте целые числа и накапливайте их сумму, пока не встретится 0. Ноль завершает ввод и в сумму не входит.',
        input: 'Последовательность целых чисел, завершающаяся нулём.', output: 'Сумма чисел до нуля.',
        starterCode: "total = 0\nnumber = int(input())\n\n# Обновляйте total и считывайте следующее число",
        tests: [test('3\n5\n-2\n0', '6'), test('0', '0'), test('-5\n-5\n10\n0', '0'), test('100\n1\n0', '101')],
      },
      {
        id: 'python-while-password', section: 'sentinel', title: 'Пароль до успеха',
        legacyTitles: ['Упорный пароль'], legacyIndex: 3,
        summary: 'Читайте варианты пароля, пока не введено secret. Для каждой неверной попытки выведите «Неверно», после верной - «Доступ разрешен».',
        input: 'Несколько строк, последняя строка равна secret.', output: 'Сообщения для попыток в порядке ввода.',
        starterCode: "password = input()\n\n# Повторяйте проверку до правильного пароля",
        tests: [test('123\nqwerty\nsecret', 'Неверно\nНеверно\nДоступ разрешен'), test('secret', 'Доступ разрешен'), test('Secret\nsecret', 'Неверно\nДоступ разрешен'), test('x\nsecret', 'Неверно\nДоступ разрешен')],
      },
      {
        id: 'python-while-one-to-n', section: 'counter', title: 'Числа от 1 до N',
        summary: 'Выведите числа от 1 до N включительно в одну строку через пробел, используя while.',
        input: 'Одно целое число N, N не меньше 1.', output: 'Числа от 1 до N через пробел.',
        starterCode: "n = int(input())\nnumber = 1\nresult = []\n\n# Добавляйте числа и увеличивайте number",
        tests: [test('1', '1'), test('5', '1 2 3 4 5'), test('8', '1 2 3 4 5 6 7 8'), test('3', '1 2 3')],
      },
      {
        id: 'python-while-step', section: 'counter', title: 'Шаг до границы',
        summary: 'Даны начальное число A, граница B и положительный шаг K. Выведите A, A + K и далее, пока значение не станет больше B.',
        input: 'Три целых числа A, B и K, каждое на новой строке. A ≤ B, K > 0.', output: 'Полученные числа через пробел.',
        starterCode: "value = int(input())\nlimit = int(input())\nstep = int(input())\nresult = []\n\n# Увеличивайте value на step",
        tests: [test('2\n10\n3', '2 5 8'), test('5\n5\n2', '5'), test('-3\n4\n2', '-3 -1 1 3'), test('0\n10\n5', '0 5 10')],
      },
      {
        id: 'python-while-countdown', section: 'counter', title: 'Обратный отсчёт',
        summary: 'Выведите числа от N до 0 включительно в одну строку через пробел. После каждого шага уменьшайте счётчик на 1.',
        input: 'Одно неотрицательное целое число N.', output: 'Числа от N до 0 через пробел.',
        starterCode: "number = int(input())\nresult = []\n\n# Уменьшайте number после добавления",
        tests: [test('3', '3 2 1 0'), test('0', '0'), test('5', '5 4 3 2 1 0'), test('1', '1 0')],
      },
      {
        id: 'python-while-digit-sum', section: 'digits', title: 'Сумма цифр',
        legacyTitles: ['Сумма цифр числа'], legacyIndex: 2,
        summary: 'Найдите сумму цифр неотрицательного целого числа с помощью % 10 и // 10. Не переводите число в строку.',
        input: 'Одно неотрицательное целое число.', output: 'Сумма его цифр.',
        starterCode: "number = int(input())\ntotal = 0\n\n# Отделяйте последнюю цифру, пока number больше 0",
        tests: [test('12345', '15'), test('0', '0'), test('9001', '10'), test('777', '21')],
      },
      {
        id: 'python-while-digit-count', section: 'digits', title: 'Количество цифр',
        summary: 'Посчитайте количество цифр в неотрицательном целом числе, последовательно удаляя последнюю цифру. У числа 0 одна цифра.',
        input: 'Одно неотрицательное целое число.', output: 'Количество цифр.',
        starterCode: "number = int(input())\ncount = 1 if number == 0 else 0\n\n# Делите number на 10 на каждом шаге",
        tests: [test('0', '1'), test('7', '1'), test('1000', '4'), test('987654', '6')],
      },
      {
        id: 'python-while-reverse-number', section: 'digits', title: 'Разворот числа',
        summary: 'Постройте число с цифрами исходного числа в обратном порядке. Используйте арифметику и while, без преобразования в строку.',
        input: 'Одно неотрицательное целое число.', output: 'Число с цифрами в обратном порядке.',
        starterCode: "number = int(input())\nreversed_number = 0\n\n# Добавляйте последнюю цифру справа",
        tests: [test('1234', '4321'), test('1200', '21'), test('7', '7'), test('10001', '10001')],
      },
      {
        id: 'python-while-max-digit', section: 'digits', title: 'Наибольшая цифра',
        summary: 'Найдите наибольшую цифру неотрицательного целого числа, перебирая цифры арифметически.',
        input: 'Одно неотрицательное целое число.', output: 'Наибольшая цифра.',
        starterCode: "number = int(input())\nmax_digit = 0\n\n# Сравнивайте number % 10 с max_digit",
        tests: [test('58342', '8'), test('0', '0'), test('1111', '1'), test('909', '9')],
      },
      {
        id: 'python-while-power-two', section: 'threshold', title: 'Следующая степень двойки',
        legacyTitles: ['Степень двойки'], legacyIndex: 4,
        summary: 'Начните со значения 1 и удваивайте его, пока оно не станет строго больше N. Выведите полученное значение.',
        input: 'Одно неотрицательное целое число N.', output: 'Минимальная степень двойки, строго большая N.',
        starterCode: "n = int(input())\nvalue = 1\n\n# Удваивайте value, пока оно не превысит n",
        tests: [test('5', '8'), test('8', '16'), test('0', '1'), test('31', '32')],
      },
      {
        id: 'python-while-savings', section: 'threshold', title: 'Шаги до цели',
        legacyTitles: ['Копилка (Сколько лет копить?)'], legacyIndex: 1,
        summary: 'Даны начальное значение, цель и прибавка за один шаг. Посчитайте, сколько шагов нужно, чтобы значение стало не меньше цели.',
        input: 'Три целых числа: start, target и step. start ≤ target, step > 0.', output: 'Количество шагов.',
        starterCode: "value = int(input())\ntarget = int(input())\nstep = int(input())\nsteps = 0\n\n# Двигайтесь к target одинаковыми шагами",
        tests: [test('10\n25\n5', '3'), test('7\n7\n2', '0'), test('0\n10\n3', '4'), test('-5\n5\n4', '3')],
      },
      {
        id: 'python-while-growth', section: 'threshold', title: 'Рост до границы',
        summary: 'Даны положительные start и target. На каждом шаге значение удваивается. Выведите число удвоений, после которых значение впервые стало не меньше target.',
        input: 'Два положительных целых числа start и target.', output: 'Количество удвоений.',
        starterCode: "value = int(input())\ntarget = int(input())\nsteps = 0\n\n# Удваивайте value до достижения цели",
        tests: [test('3\n20', '3'), test('10\n10', '0'), test('1\n16', '4'), test('7\n8', '1')],
      },
      {
        id: 'python-while-nonnegative', section: 'search', title: 'Первое допустимое значение',
        summary: 'Читайте целые числа, пока не встретится неотрицательное. Выведите первое неотрицательное число.',
        input: 'Несколько целых чисел; гарантируется, что одно из них неотрицательное.', output: 'Первое число, которое не меньше 0.',
        starterCode: "number = int(input())\n\n# Повторяйте ввод, пока number отрицательное",
        tests: [test('-3\n-1\n5', '5'), test('0', '0'), test('-10\n2', '2'), test('7\n9', '7')],
      },
      {
        id: 'python-while-manual-find', section: 'search', title: 'Поиск символа вручную',
        summary: 'Найдите индекс первого вхождения символа в строку с помощью while, не используя find() и index(). Если символа нет, выведите -1.',
        input: 'Непустая строка и один символ на новой строке.', output: 'Индекс первого вхождения или -1.',
        starterCode: "text = input()\nsymbol = input()\nindex = 0\nanswer = -1\n\n# Двигайтесь по индексам, пока символ не найден",
        tests: [test('banana\na', '1'), test('Python\nz', '-1'), test('aaaa\na', '0'), test('12345\n5', '4')],
      },
      {
        id: 'python-while-leading-zeroes', section: 'search', title: 'Убрать ведущие нули',
        summary: 'Удалите ведущие нули из записи неотрицательного числа с помощью индекса и while. Если строка состоит только из нулей, выведите 0.',
        input: 'Непустая строка, состоящая из цифр.', output: 'Запись без ведущих нулей.',
        starterCode: "text = input()\nindex = 0\n\n# Пропускайте нули, пока справа остаются символы",
        tests: [test('000123', '123'), test('0', '0'), test('0000', '0'), test('501', '501')],
      },
    ],
  },
  {
    taskNumber: '108',
    versionField: 'pythonListsCurriculumVersion',
    signatures: ['Границы списка', 'Статистика', 'Рокировка (Max и Min)'],
    sections: [
      { key: 'basics', id: 'python-lists-basics', title: 'Создание и доступ' },
      { key: 'transform', id: 'python-lists-transform', title: 'Фильтрация и замена' },
      { key: 'methods', id: 'python-lists-methods', title: 'Методы и порядок' },
      { key: 'neighbors', id: 'python-lists-neighbors', title: 'Соседние элементы' },
      { key: 'indexes', id: 'python-lists-indexes', title: 'Индексы и изменение' },
    ],
    tasks: [
      {
        id: 'python-lists-bounds', section: 'basics', title: 'Первый и последний элемент',
        legacyTitles: ['Границы списка'], legacyIndex: 0,
        summary: 'Считайте непустой список целых чисел из одной строки. Выведите первый и последний элементы через пробел.',
        input: 'Целые числа через пробел.', output: 'Первый и последний элементы.',
        starterCode: "numbers = list(map(int, input().split()))\n\n# Используйте индексы 0 и -1",
        tests: [test('1 2 3 4', '1 4'), test('7', '7 7'), test('-5 0 9', '-5 9'), test('10 20', '10 20')],
      },
      {
        id: 'python-lists-stats', section: 'basics', title: 'Сводка списка',
        legacyTitles: ['Статистика'], legacyIndex: 1,
        summary: 'Для непустого списка выведите сумму, минимальный и максимальный элементы - каждый результат на новой строке.',
        input: 'Целые числа через пробел.', output: 'Сумма, минимум и максимум на разных строках.',
        starterCode: "numbers = list(map(int, input().split()))\n\n# Используйте sum(), min() и max()",
        tests: [test('1 2 3', '6\n1\n3'), test('-5 10 0', '5\n-5\n10'), test('7', '7\n7\n7'), test('4 4 4', '12\n4\n4')],
      },
      {
        id: 'python-lists-count-value', section: 'basics', title: 'Количество заданного значения',
        legacyTitles: ['Подсчет пятерок'], legacyIndex: 5,
        summary: 'Считайте список целых чисел и искомое число на второй строке. Выведите, сколько раз оно встречается в списке.',
        input: 'Список чисел через пробел, затем искомое число.', output: 'Количество вхождений.',
        starterCode: "numbers = list(map(int, input().split()))\ntarget = int(input())\n\n# Используйте count()",
        tests: [test('5 4 5 3 5\n5', '3'), test('1 2 3\n4', '0'), test('7 7\n7', '2'), test('-1 0 -1\n-1', '2')],
      },
      {
        id: 'python-lists-even', section: 'transform', title: 'Только чётные',
        legacyTitles: ['Только чётные'], legacyIndex: 2,
        summary: 'Создайте новый список из чётных элементов исходного списка, сохранив их порядок.',
        input: 'Целые числа через пробел.', output: 'Чётные элементы через пробел. Если их нет, пустая строка.',
        starterCode: "numbers = list(map(int, input().split()))\nresult = []\n\n# Добавляйте подходящие элементы методом append()",
        tests: [test('1 2 3 4 6', '2 4 6'), test('1 3 5', ''), test('-2 -1 0 7', '-2 0'), test('8', '8')],
      },
      {
        id: 'python-lists-replace-negative', section: 'transform', title: 'Замена отрицательных',
        legacyTitles: ['Замена (Очистка данных)'], legacyIndex: 4,
        summary: 'Замените каждый отрицательный элемент списка на -1. Остальные элементы оставьте без изменений.',
        input: 'Целые числа через пробел.', output: 'Изменённый список через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\n\n# Переберите индексы, чтобы менять элементы списка",
        tests: [test('3 -5 0 -2 7', '3 -1 0 -1 7'), test('1 2 3', '1 2 3'), test('-9', '-1'), test('-1 -2 -3', '-1 -1 -1')],
      },
      {
        id: 'python-lists-double', section: 'transform', title: 'Удвоить каждый элемент',
        summary: 'Создайте новый список, умножив каждый элемент исходного списка на 2.',
        input: 'Целые числа через пробел.', output: 'Новый список через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\nresult = []\n\n# Добавляйте удвоенные значения",
        tests: [test('1 2 3', '2 4 6'), test('-2 0 5', '-4 0 10'), test('7', '14'), test('10 -10', '20 -20')],
      },
      {
        id: 'python-lists-reverse', section: 'transform', title: 'Обратный порядок',
        legacyTitles: ['Перевертыш', 'Перевёртыш'], legacyIndex: 3,
        summary: 'Выведите элементы списка в обратном порядке. Исходные элементы являются строками.',
        input: 'Слова через пробел.', output: 'Те же слова в обратном порядке.',
        starterCode: "items = input().split()\n\n# Используйте срез или reverse()",
        tests: [test('один два три', 'три два один'), test('x', 'x'), test('a b c d', 'd c b a'), test('1 2', '2 1')],
      },
      {
        id: 'python-lists-sort', section: 'methods', title: 'Сортировка по возрастанию',
        legacyTitles: ['По ранжиру (Сортировка)'], legacyIndex: 6,
        summary: 'Отсортируйте список целых чисел по возрастанию методом sort() и выведите элементы.',
        input: 'Целые числа через пробел.', output: 'Отсортированные числа через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\n\n# Метод sort() изменяет список",
        tests: [test('3 1 2', '1 2 3'), test('-1 5 0 -3', '-3 -1 0 5'), test('7', '7'), test('2 2 1', '1 2 2')],
      },
      {
        id: 'python-lists-hashtag', section: 'methods', title: 'Объединение через решётку',
        legacyTitles: ['Хэштег-генератор'], legacyIndex: 8,
        summary: 'Считайте слова в список и объедините их в одну строку, используя символ # как разделитель.',
        input: 'Слова через пробел.', output: 'Слова, соединённые символом #.',
        starterCode: "words = input().split()\n\n# Используйте '#'.join(words)",
        tests: [test('python это просто', 'python#это#просто'), test('одно', 'одно'), test('a b c', 'a#b#c'), test('2026 год', '2026#год')],
      },
      {
        id: 'python-lists-unique', section: 'methods', title: 'Уникальные по порядку',
        summary: 'Создайте список без повторов: оставьте только первое появление каждого числа и сохраните исходный порядок.',
        input: 'Целые числа через пробел.', output: 'Уникальные элементы через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\nresult = []\n\n# Добавляйте число, только если его ещё нет в result",
        tests: [test('1 2 1 3 2', '1 2 3'), test('5 5 5', '5'), test('-1 0 -1 0 2', '-1 0 2'), test('4 3 2 1', '4 3 2 1')],
      },
      {
        id: 'python-lists-shift', section: 'methods', title: 'Сдвиг вправо',
        summary: 'Переместите последний элемент непустого списка в начало, остальные сдвиньте вправо на одну позицию.',
        input: 'Целые числа через пробел.', output: 'Список после циклического сдвига.',
        starterCode: "numbers = list(map(int, input().split()))\n\n# Соедините последний элемент и срез без него",
        tests: [test('1 2 3 4', '4 1 2 3'), test('7', '7'), test('-1 0 1', '1 -1 0'), test('5 6', '6 5')],
      },
      {
        id: 'python-lists-greater-prev', section: 'neighbors', title: 'Больше предыдущего',
        legacyTitles: ['Больше предыдущего'], legacyIndex: 7,
        summary: 'Выведите элементы, которые строго больше элемента слева. Первый элемент не выводите.',
        input: 'Целые числа через пробел.', output: 'Подходящие элементы через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\nresult = []\n\n# Начните перебор с индекса 1",
        tests: [test('1 5 2 4 4 9', '5 4 9'), test('5 4 3', ''), test('1 2 3', '2 3'), test('7', '')],
      },
      {
        id: 'python-lists-local-max', section: 'neighbors', title: 'Локальные максимумы',
        summary: 'Выведите элементы, которые строго больше обоих соседей. Первый и последний элементы не проверяются.',
        input: 'Не меньше трёх целых чисел через пробел.', output: 'Локальные максимумы через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\nresult = []\n\n# Проверяйте индексы от 1 до len(numbers) - 2",
        tests: [test('1 5 2 7 3', '5 7'), test('1 2 3 4', ''), test('3 1 3', ''), test('5 9 5', '9')],
      },
      {
        id: 'python-lists-differences', section: 'neighbors', title: 'Разности соседей',
        summary: 'Постройте список разностей: каждый новый элемент равен текущему элементу исходного списка минус предыдущий.',
        input: 'Не меньше двух целых чисел через пробел.', output: 'Разности соседних элементов через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\nresult = []\n\n# Для каждого индекса от 1 вычислите numbers[i] - numbers[i - 1]",
        tests: [test('1 4 9 10', '3 5 1'), test('5 3 1', '-2 -2'), test('7 7', '0'), test('-2 3 0', '5 -3')],
      },
      {
        id: 'python-lists-increasing-run', section: 'neighbors', title: 'Длина возрастающей серии',
        summary: 'Найдите длину самой длинной непрерывной серии, в которой каждый следующий элемент строго больше предыдущего.',
        input: 'Непустой список целых чисел через пробел.', output: 'Максимальная длина возрастающей серии.',
        starterCode: "numbers = list(map(int, input().split()))\ncurrent = 1\nbest = 1\n\n# Сравнивайте соседние элементы",
        tests: [test('1 2 3 1 2', '3'), test('5 4 3', '1'), test('7', '1'), test('1 2 2 3 4', '3')],
      },
      {
        id: 'python-lists-swap-extremes', section: 'indexes', title: 'Поменять минимум и максимум',
        legacyTitles: ['Рокировка (Max и Min)'], legacyIndex: 9,
        summary: 'В списке различных чисел найдите индексы минимального и максимального элементов и поменяйте эти элементы местами.',
        input: 'Различные целые числа через пробел.', output: 'Список после обмена через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\n\n# Найдите значения, затем их индексы методом index()",
        tests: [test('3 1 5 2', '3 5 1 2'), test('-5 0 7', '7 0 -5'), test('2 9', '9 2'), test('4 1 3 8 2', '4 8 3 1 2')],
      },
      {
        id: 'python-lists-first-last-index', section: 'indexes', title: 'Первая и последняя позиция',
        summary: 'Считайте список и искомое число. Выведите индексы его первого и последнего вхождения. Гарантируется, что число есть в списке.',
        input: 'Целые числа через пробел, затем искомое число.', output: 'Два индекса через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\ntarget = int(input())\n\n# Первый индекс можно найти index(), последний - перебором",
        tests: [test('1 2 3 2 4\n2', '1 3'), test('7\n7', '0 0'), test('5 5 5\n5', '0 2'), test('-1 0 -1\n-1', '0 2')],
      },
      {
        id: 'python-lists-insert', section: 'indexes', title: 'Вставка по индексу',
        summary: 'Считайте список, индекс и новое число. Вставьте число перед элементом с указанным индексом методом insert().',
        input: 'Список целых чисел, затем индекс и новое число на отдельных строках.', output: 'Список после вставки через пробел.',
        starterCode: "numbers = list(map(int, input().split()))\nindex = int(input())\nvalue = int(input())\n\n# Используйте insert(index, value)",
        tests: [test('1 2 3\n1\n9', '1 9 2 3'), test('5 6\n0\n4', '4 5 6'), test('7\n1\n8', '7 8'), test('-1 0 1\n2\n5', '-1 0 5 1')],
      },
    ],
  },
];

const isTargetEntry = (entry, definition) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (Number(entry[definition.versionField]) >= CURRICULUM_VERSION) return false;
  const titles = new Set(
    (Array.isArray(entry[LEVEL_ID]) ? entry[LEVEL_ID] : [])
      .map((question) => String(question?.title || '').trim()),
  );
  return definition.signatures.every((title) => titles.has(title));
};

export const migratePythonCoreCurriculaStore = (storeValue) => {
  const store = clone(storeValue || {});
  const teachers = store?.teachers && typeof store.teachers === 'object' ? store.teachers : {};
  let changed = false;
  Object.values(teachers).forEach((teacherEntry) => {
    definitions.forEach((definition) => {
      const entry = teacherEntry?.tests?.[definition.taskNumber];
      if (!isTargetEntry(entry, definition)) return;
      const curriculum = buildCurriculum(entry, definition);
      teacherEntry.tests[definition.taskNumber] = {
        ...entry,
        [LEVEL_ID]: curriculum.questions,
        pythonSubsections: curriculum.sections,
        [definition.versionField]: CURRICULUM_VERSION,
      };
      changed = true;
    });
  });
  return { store, changed };
};

export const PYTHON_CORE_CURRICULUM_VERSION = CURRICULUM_VERSION;
export const PYTHON_CORE_CURRICULUM_TASK_COUNTS = Object.fromEntries(
  definitions.map((definition) => [definition.taskNumber, definition.tasks.length]),
);
