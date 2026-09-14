import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePythonTaskCatalog,
  pythonTaskCatalogsEqual,
} from './pythonTaskCatalog.js';

test('python task catalog keeps valid custom cards and groups them in display order', () => {
  const catalog = normalizePythonTaskCatalog([
    { number: 205, title: 'Подготовка к заданию 5', displayNumber: '5', sectionId: 'exam-prep' },
    { number: 112, title: 'Словари', displayNumber: '10', sectionId: 'topics' },
    { number: 101, title: 'Ввод и вывод', displayNumber: '1.0', sectionId: 'topics' },
    { number: 112, title: 'Дубликат', displayNumber: '11', sectionId: 'topics' },
    { number: 99, title: 'Слишком маленький id', displayNumber: '0', sectionId: 'topics' },
  ]);

  assert.deepEqual(catalog.map(({ number, title, sectionId }) => ({ number, title, sectionId })), [
    { number: 100, title: 'Слишком маленький id', sectionId: 'topics' },
    { number: 101, title: 'Ввод и вывод', sectionId: 'topics' },
    { number: 112, title: 'Словари', sectionId: 'topics' },
    { number: 205, title: 'Подготовка к заданию 5', sectionId: 'exam-prep' },
  ]);
  assert.equal(pythonTaskCatalogsEqual(catalog, [...catalog]), true);
});

test('python task catalog falls back to built-in cards when the saved catalog is absent', () => {
  const fallback = [{ number: 101, title: 'Переменные', displayNumber: '1.1', sectionId: 'topics' }];
  assert.deepEqual(normalizePythonTaskCatalog(null, fallback), [{
    id: 101,
    number: 101,
    title: 'Переменные',
    displayNumber: '1.1',
    sectionId: 'topics',
  }]);
});
