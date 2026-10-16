import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPythonSubsectionModel } from './pythonSubsections.js';
import { pythonGiftTopicTheory, pythonGiftTheoryStart } from './pythonGiftTheory.js';
test('topic-wide video stored in __default__ remains available above named subsections', () => {
  const entry = { python: [{ id: 'a', subsectionId: 'input' }], pythonSubsections: [{ id: 'input', title: 'Ввод' }], pythonTheory: { gdoc: { type: 'gdoc', content: 'old' } }, pythonTheoryBySubsection: { __default__: { gdoc: { type: 'gdoc', content: 'current' }, rutube: { type: 'rutube', content: 'video' } } } };
  assert.deepEqual(Object.keys(pythonGiftTopicTheory(entry)), ['gdoc', 'rutube']);
  assert.equal(pythonGiftTopicTheory(entry).gdoc.content, 'current');
  const model = buildPythonSubsectionModel(entry, 'python', { includeEmptySections: true });
  assert.deepEqual(pythonGiftTheoryStart(model), { index: 0, subsectionId: 'input' });
});
test('an explanation with no questions opens in an existing section instead of waiting for an empty one', () => {
  const entry = { python: [{ id: 'a', subsectionId: 'practice' }], pythonSubsections: [{ id: 'video', title: 'Объяснение' }, { id: 'practice', title: 'Задачи' }] };
  assert.deepEqual(pythonGiftTheoryStart(buildPythonSubsectionModel(entry, 'python', { includeEmptySections: true }), 'video'), { index: 0, subsectionId: 'practice' });
  assert.deepEqual(pythonGiftTheoryStart(buildPythonSubsectionModel({}, 'python')), { index: 0, subsectionId: '__default__' });
});
