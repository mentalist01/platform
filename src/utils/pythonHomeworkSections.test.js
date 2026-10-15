import test from 'node:test';
import assert from 'node:assert/strict';
import { pythonHomeworkSections } from './pythonHomeworkSections.js';

test('Python homework groups only assigned questions and retains global numbers and completion', () => {
  const entry = { pythonSubsections: [{ id: 'b', title: 'Строки', order: 0 }, { id: 'a', title: 'Сравнения', order: 1 }], python: [
    { id: 'one', title: 'Первая', subsectionId: 'a' }, { id: 'two', title: 'Вторая', subsectionId: 'b' },
    { id: 'three', title: 'Третья', subsectionId: 'a' }, { id: 'four', title: 'Четвёртая' },
  ] };
  const targets = [{ num: 1, questionId: 'one', solved: true }, { num: 3, questionId: 'three', solved: false }, { num: 4, questionId: 'four', solved: false }];
  const groups = pythonHomeworkSections(entry, 'python', targets);
  assert.deepEqual(groups.map(s => [s.title, s.items.map(i => i.num), s.completed]), [['Сравнения', [1, 3], 1], ['Без подраздела', [4], 0]]);
  assert.equal(groups[0].items[1].title, 'Третья');
  assert.deepEqual(groups.flatMap(s => s.items.map(i => i.questionId)), ['one', 'three', 'four']);
});

test('legacy section titles and missing bank questions remain visible without assigning unrelated tasks', () => {
  const groups = pythonHomeworkSections({ python: [{ id: 'a', subsectionTitle: 'Срезы', label: { text: 'Окно строки' } }] }, 'python', [
    { num: 1, questionId: 'a' }, { num: 7, questionId: 'deleted' },
  ]);
  assert.equal(groups[0].title, 'Срезы'); assert.equal(groups[0].items[0].title, 'Окно строки');
  assert.equal(groups[1].items[0].num, 7); assert.equal(groups.flatMap(s => s.items).length, 2);
});
