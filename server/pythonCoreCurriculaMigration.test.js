import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migratePythonCoreCurriculaStore,
  migratePythonCoreCurriculaTestsDb,
  PYTHON_CORE_CURRICULUM_TASK_COUNTS,
  PYTHON_CORE_CURRICULUM_VERSION,
} from './pythonCoreCurriculaMigration.js';

const bank = (titles, offset) => ({
  python: titles.map((title, index) => ({
    id: offset + index,
    title,
    question: `Старое условие ${title}`,
    tests: [{ input: '', output: '' }],
  })),
});

const sourceStore = () => ({
  version: 1,
  teachers: {
    teacher1: {
      tests: {
        101: bank(['Вежливый бот', 'Следующее и предыдущее', 'Геометрия прямоугольника (из вашего файла)', 'Кастомный разделитель (sep)', 'Машина времени'], 10100),
        102: bank(['Электронная визитка', 'Стоимость покупки', 'Копилка (Обновление переменной)', 'Потерянное время', 'Обмен ролями (Логика)'], 10200),
        103: bank(['Фейсконтроль', 'Оценка за тест', 'Строгий пароль', 'Светофор', 'Кто больше?'], 10300),
        104: bank(['Обмен валют', 'Магия куба', 'Электронные часы', 'Дележ яблок', 'Стоимость поездки'], 10400),
        106: bank([
          'Первый и последний', 'Убираем границы (Срезы)', 'Где собака зарыта?', 'Автозамена',
          'Громкоговоритель', 'Калькулятор слов', 'Детектор чисел', 'Только буквы',
          'Заборчик (Верхний и нижний регистр)', 'Разворот строки', 'Шаг через один',
          'Поиск гласных', 'Удвоитель', 'Очистка от пробелов', 'Имя файла',
        ], 10600),
        107: bank(['Эхо до стоп-слова', 'Копилка (Сколько лет копить?)', 'Сумма цифр числа', 'Упорный пароль', 'Степень двойки'], 10700),
        108: bank([
          'Границы списка', 'Статистика', 'Только чётные', 'Перевертыш',
          'Замена (Очистка данных)', 'Подсчет пятерок', 'По ранжиру (Сортировка)',
          'Больше предыдущего', 'Хэштег-генератор', 'Рокировка (Max и Min)',
        ], 10800),
        999: bank(['Неизвестная задача'], 99900),
      },
    },
  },
});

const versionFields = {
  101: 'pythonIoCurriculumVersion',
  102: 'pythonVariablesCurriculumVersion',
  103: 'pythonConditionsCurriculumVersion',
  104: 'pythonCalculationsCurriculumVersion',
  106: 'pythonStringsCurriculumVersion',
  107: 'pythonWhileCurriculumVersion',
  108: 'pythonListsCurriculumVersion',
};

test('builds ordered core Python curricula and preserves ids of existing tasks', () => {
  const source = sourceStore();
  const originalIdsByTitle = new Map();
  Object.values(source.teachers.teacher1.tests).forEach((entry) => {
    entry.python.forEach((question) => originalIdsByTitle.set(question.title, question.id));
  });

  const result = migratePythonCoreCurriculaStore(source);
  assert.equal(result.changed, true);
  Object.entries(PYTHON_CORE_CURRICULUM_TASK_COUNTS).forEach(([taskNumber, expectedCount]) => {
    const entry = result.store.teachers.teacher1.tests[taskNumber];
    assert.equal(entry[versionFields[taskNumber]], PYTHON_CORE_CURRICULUM_VERSION);
    assert.equal(entry.python.length, expectedCount, `task ${taskNumber}`);
    assert.ok(entry.pythonSubsections.length >= 4, `task ${taskNumber}`);
    assert.deepEqual(entry.pythonSubsections.map((section) => section.order), entry.pythonSubsections.map((_, index) => index));
    assert.ok(entry.python.every((question) => question.title && question.question && question.starterCode));
    assert.ok(entry.python.every((question) => question.subsectionId && question.subsectionTitle));
    assert.ok(entry.python.every((question) => Array.isArray(question.tests) && question.tests.length > 0));
    assert.equal(new Set(entry.python.map((question) => question.id)).size, entry.python.length);
  });

  ['Вежливый бот', 'Электронная визитка', 'Фейсконтроль', 'Обмен валют', 'Первый и последний', 'Эхо до стоп-слова', 'Границы списка']
    .forEach((oldTitle) => {
      const migrated = Object.values(result.store.teachers.teacher1.tests)
        .flatMap((entry) => entry.python || [])
        .find((question) => question.id === originalIdsByTitle.get(oldTitle));
      assert.ok(migrated, `${oldTitle} id must be preserved`);
    });
  assert.deepEqual(result.store.teachers.teacher1.tests[999], source.teachers.teacher1.tests[999]);
});

test('core curricula migration is idempotent and skips a customized bank without signatures', () => {
  const first = migratePythonCoreCurriculaStore(sourceStore());
  const second = migratePythonCoreCurriculaStore(first.store);
  assert.equal(second.changed, false);
  assert.deepEqual(second.store, first.store);

  const unrelated = sourceStore();
  unrelated.teachers.teacher1.tests[104].python = [{ id: 'custom', title: 'Моя задача' }];
  const skipped = migratePythonCoreCurriculaStore(unrelated);
  assert.equal(skipped.store.teachers.teacher1.tests[104].python[0].title, 'Моя задача');
  assert.equal(skipped.store.teachers.teacher1.tests[104].pythonCalculationsCurriculumVersion, undefined);
});

test('migrates the shared tests database as well as teacher-specific banks', () => {
  const source = structuredClone(sourceStore().teachers.teacher1.tests);
  const migrated = migratePythonCoreCurriculaTestsDb(source);

  assert.equal(migrated.changed, true);
  Object.entries(PYTHON_CORE_CURRICULUM_TASK_COUNTS).forEach(([taskNumber, expectedCount]) => {
    assert.equal(migrated.testsDb[taskNumber].python.length, expectedCount);
    assert.ok(migrated.testsDb[taskNumber].pythonSubsections.length > 0);
  });

  const repeated = migratePythonCoreCurriculaTestsDb(migrated.testsDb);
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.testsDb, migrated.testsDb);
});

test('recognizes production legacy banks by stable ids when titles use an old encoding', () => {
  const source = sourceStore().teachers.teacher1.tests;
  const productionIds = {
    101: ['1770015166176', '1770015217480', '1770015238939', '1770015261015', '1770015283587'],
    102: ['1770016190396', '1770016267645', '1770016427954', '1770016459107', '1770016521794'],
    103: ['1770018871474', '1770018952837', '1770018967161', '1770018984967', '1770019002712'],
    104: ['1770021915415', '1770021949229', '1770021983603', '1770022003909', '1770022028482'],
    106: ['1770023105189', '1770023125502', '1770023145792', '1770023165410', '1770023194207', '1770023437347', '1770023450138', '1770023462846', '1770023492421', '1770023550156', '1770023675183', '1770023686178', '1770023698740', '1770023713511', '1770023725399'],
    107: ['1770025770717', '1770025796116', '1770025807669', '1770025824471', '1770025836251'],
    108: ['1770026275072', '1770026294303', '1770026366928', '1770026385138', '1770026400748', '1770026418188', '1770026428229', '1770026480067', '1770026498467', '1770026512389'],
  };
  Object.entries(productionIds).forEach(([taskNumber, ids]) => {
    source[taskNumber].python.forEach((question, index) => {
      question.id = ids[index];
      question.title = `legacy-title-${taskNumber}-${index}`;
    });
  });

  const migrated = migratePythonCoreCurriculaTestsDb(source);

  assert.equal(migrated.changed, true);
  Object.entries(PYTHON_CORE_CURRICULUM_TASK_COUNTS).forEach(([taskNumber, expectedCount]) => {
    assert.equal(migrated.testsDb[taskNumber].python.length, expectedCount);
  });
});
