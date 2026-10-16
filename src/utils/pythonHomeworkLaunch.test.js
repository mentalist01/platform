import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePythonHomeworkNumbers, firstUnsolvedPythonHomeworkIndex } from './pythonHomeworkLaunch.js';

const questions = [
  { id: 'a', subsectionId: 'first' }, { id: 'b', subsectionId: 'second' },
  { id: 'c', subsectionId: 'first' }, { id: 4, subsectionId: 'third' },
];
test('homework launch finds unfinished tasks across subsections without filtering the topic', () => {
  const before = structuredClone(questions);
  assert.equal(firstUnsolvedPythonHomeworkIndex(questions, [1, 4], new Set(['a'])), 3);
  assert.equal(firstUnsolvedPythonHomeworkIndex(questions, [1, 4], new Set(['a', '4'])), 0);
  assert.deepEqual(questions, before);
  assert.equal(questions[1].id, 'b', 'unassigned practice remains available');
});
test('stale and malformed numbers cannot select unrelated tasks', () => {
  assert.deepEqual(normalizePythonHomeworkNumbers([4, '1', 1, 0, -3, 2.5, 99, null], 4), [1, 4]);
  assert.equal(firstUnsolvedPythonHomeworkIndex(questions, [99]), -1);
  assert.deepEqual(normalizePythonHomeworkNumbers(null), []);
});
