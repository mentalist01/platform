import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migratePythonForCurriculumStore,
  PYTHON_FOR_CURRICULUM_TASK_COUNT,
  PYTHON_FOR_CURRICULUM_VERSION,
} from './pythonForCurriculumMigration.js';

const sourceStore = () => ({
  version: 1,
  nextTaskNumber: 28,
  teachers: {
    teacher1: {
      tests: {
        105: {
          pythonSubsections: [
            { id: 'range-id', title: 'range() и шаг', order: 0 },
            { id: 'counter-id', title: 'Отбор и счётчики', order: 2 },
            { id: 'search-id', title: 'Делители и простые числа', order: 4 },
          ],
          python: [
            { id: 1, title: 'Повторение — мать учения' },
            { id: 2, title: 'Диапазон чисел' },
            { id: 3, title: 'Сумма чисел' },
            { id: 4, title: 'Подсчет буквы (Цикл по строке)' },
            { id: 5, title: 'Анализ оценок (Ввод внутри цикла)' },
            { id: 6, title: 'Шаг назад' },
            { id: 7, title: 'Чётные на отрезке' },
          ],
        },
      },
    },
  },
});

test('builds a programming-focused, ordered for curriculum and preserves known ids', () => {
  const result = migratePythonForCurriculumStore(sourceStore());
  assert.equal(result.changed, true);
  const entry = result.store.teachers.teacher1.tests[105];
  assert.equal(entry.pythonForCurriculumVersion, PYTHON_FOR_CURRICULUM_VERSION);
  assert.equal(entry.python.length, PYTHON_FOR_CURRICULUM_TASK_COUNT);
  assert.deepEqual(entry.pythonSubsections.map((section) => section.title), [
    'range() и шаг',
    'Накопители',
    'Условия и счётчики',
    'Максимум и серии',
    'Поиск и проверки',
    'Вложенные циклы',
  ]);
  assert.deepEqual(entry.python.slice(0, 4).map((question) => question.title), [
    'Повторить сообщение',
    'Диапазон включительно',
    'Чётные на отрезке',
    'Обратный отсчёт с шагом',
  ]);
  assert.equal(entry.python[0].id, 1);
  assert.equal(entry.python[1].id, 2);
  assert.equal(entry.python[2].id, 7);
  assert.equal(entry.python[3].id, 6);
  assert.ok(entry.python.every((question) => question.tests.length === 4));
  assert.ok(entry.python.every((question) => question.subsectionId && question.subsectionTitle));
});

test('is idempotent and ignores unrelated teacher banks', () => {
  const first = migratePythonForCurriculumStore(sourceStore());
  const second = migratePythonForCurriculumStore(first.store);
  assert.equal(second.changed, false);
  assert.deepEqual(second.store, first.store);

  const unrelated = sourceStore();
  unrelated.teachers.teacher1.tests[105].python = [{ id: 1, title: 'Другая задача' }];
  const skipped = migratePythonForCurriculumStore(unrelated);
  assert.equal(skipped.changed, false);
});
