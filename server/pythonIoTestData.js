// Canonical cases for the IO exercises added to the live bank. Keep stdin
// explicit: output alone is insufficient to reconstruct a general Python test.
export const PYTHON_IO_EXTRA_TASKS = [
  {
    id: 'py101-address-label', section: 'strings', title: 'Адрес на конверте',
    summary: 'Считайте имя получателя, улицу и город. Выведите адрес тремя строками с подписями «Кому:», «Улица:» и «Город:».',
    input: 'Имя, улица и город, каждое значение на отдельной строке.',
    output: 'Три строки с подписями и значениями.',
    starterCode: 'name = input()\nstreet = input()\ncity = input()\n\n# Соберите адрес',
    tests: [
      { input: 'Ольга\nЛесная 7\nТула\n', output: 'Кому: Ольга\nУлица: Лесная 7\nГород: Тула' },
      { input: 'Илья\nМира 12\nОмск\n', output: 'Кому: Илья\nУлица: Мира 12\nГород: Омск' },
      { input: 'Ли\nНовая 1\nУфа\n', output: 'Кому: Ли\nУлица: Новая 1\nГород: Уфа' },
    ],
  },
  {
    id: 'py101-command-argument', section: 'strings', title: 'Команда и аргумент',
    summary: 'Считайте название команды и её аргумент. Выведите их с подписями «Команда:» и «Аргумент:».',
    input: 'Команда и аргумент на отдельных строках.', output: 'Две подписанные строки.',
    starterCode: 'command = input()\nargument = input()\n\n# Выведите две подписанные строки',
    tests: [
      { input: 'copy\nnotes.txt\n', output: 'Команда: copy\nАргумент: notes.txt' },
      { input: 'run\nmain.py\n', output: 'Команда: run\nАргумент: main.py' },
      { input: 'open\nreport.pdf\n', output: 'Команда: open\nАргумент: report.pdf' },
    ],
  },
  {
    id: 'py101-file-label', section: 'format', title: 'Имя файла',
    summary: 'Считайте имя файла без расширения и расширение. Выведите одну строку в формате «Файл: имя.расширение».',
    input: 'Имя файла и расширение на отдельных строках.', output: 'Имя файла с подписью.',
    starterCode: 'name = input()\nextension = input()\n\n# Соедините части имени файла',
    tests: [
      { input: 'report\npdf\n', output: 'Файл: report.pdf' },
      { input: 'photo\njpg\n', output: 'Файл: photo.jpg' },
      { input: 'data backup\ncsv\n', output: 'Файл: data backup.csv' },
    ],
  },
  {
    id: 'py101-checklist', section: 'format', title: 'Чек-лист',
    summary: 'Считайте три пункта чек-листа. Выведите их с номерами 1, 2 и 3, каждый пункт с новой строки.',
    input: 'Три пункта, каждый на отдельной строке.', output: 'Три пронумерованных пункта.',
    starterCode: 'first = input()\nsecond = input()\nthird = input()\n\n# Выведите пункты с номерами',
    tests: [
      { input: 'прочитать условие\nнаписать код\nпроверить тесты\n', output: '1. прочитать условие\n2. написать код\n3. проверить тесты' },
      { input: 'открыть файл\nизменить код\nсохранить решение\n', output: '1. открыть файл\n2. изменить код\n3. сохранить решение' },
    ],
  },
];

export const PYTHON_IO_SEPARATOR_TESTS = [
  { input: 'a\nb\nc\n-\n', output: 'a-b-c' },
  { input: 'один\nдва\nтри\n | \n', output: 'один | два | три' },
  // The fourth input is an empty line, not EOF after the third line.
  { input: '1\n2\n3\n\n', output: '123' },
  { input: 'x\ny\nz\n#\n', output: 'x#y#z' },
];

const lf = (value) => String(value ?? '').replace(/\r\n?/g, '\n');

// Narrow, repeatable repair: retain IDs, order, question text, extra tests and
// teacher edits. Only recognized broken input/output pairs are changed.
export function repairPythonIoTests(testsDb) {
  let changed = false;
  for (const question of testsDb?.['101']?.python || []) {
    const known = PYTHON_IO_EXTRA_TASKS.find((task) => task.id === String(question.id) && task.title === question.title);
    const separator = ['python-io-separator', '1770015261015'].includes(String(question.id))
      || (question.title === 'Свой разделитель' && question.subsectionId === 'python-io-format');
    const cases = known?.tests || (separator ? PYTHON_IO_SEPARATOR_TESTS : []);
    for (const actual of question.tests || []) {
      const canonical = cases.find((item) => item.output === lf(actual?.output));
      if (!canonical || !actual || typeof actual !== 'object') continue;
      const input = lf(actual.input);
      const brokenEmpty = known && input === '' && !actual.stdin;
      const brokenSeparator = separator && input !== canonical.input && (
        input === canonical.input.trimEnd()
        || (canonical.output === '123' && input === '1\n2\n3\n')
      );
      if (!brokenEmpty && !brokenSeparator) continue;
      actual.input = canonical.input;
      changed = true;
    }
  }
  return changed;
}
