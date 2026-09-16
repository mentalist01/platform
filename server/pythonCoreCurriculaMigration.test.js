import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migratePythonCoreCurriculaStore,
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
