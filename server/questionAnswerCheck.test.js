import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQuestionCheckRawValue,
  createQuestionAnswerRules,
} from './questionAnswerCheck.js';

const getAnswerCountForTask = (taskNumber) => {
  const task = Number(taskNumber);
  if (task === 19 || task === 27) return 4;
  if (task === 25) return 20;
  if ([17, 18, 26].includes(task)) return 2;
  return 1;
};

const rules = createQuestionAnswerRules({ getAnswerCountForTask });

test('checks single answers with the same whitespace and case normalization as solving', () => {
  assert.equal(rules.isSolvedAnswerValid({ answer: '  Hello   WORLD ' }, 'hello world', 1), true);
  assert.equal(rules.isSolvedAnswerValid({ answer: '42' }, '41', 1), false);
  assert.equal(rules.isSolvedAnswerValid({ answer: '42' }, '', 1), false);
});

test('supports answer arrays, legacy numbered fields, and option fallbacks', () => {
  assert.equal(
    rules.isSolvedAnswerValid(
      { answers: ['one', 'two'] },
      JSON.stringify({ answers: ['ONE', ' two '] }),
      17
    ),
    true
  );
  assert.equal(
    rules.isSolvedAnswerValid(
      { answer: 'left', answer2: 'right' },
      JSON.stringify({ answers: ['left', 'wrong'] }),
      18
    ),
    false
  );
  assert.equal(rules.isSolvedAnswerValid({ options: ['a', 'b'], correctIndex: 1 }, 'B', 1), true);
});

test('question answerCountOverride takes precedence and is bounded', () => {
  assert.equal(rules.getAnswerCountForQuestion({ answerCountOverride: 2 }, 1), 2);
  assert.equal(rules.getAnswerCountForQuestion({ answerCountOverride: 51 }, 17), 2);
  assert.equal(rules.getAnswerCountForQuestion({ answerCountOverride: 0 }, 27), 4);
});

test('check payload serialization preserves the exact number of answer fields', () => {
  assert.equal(buildQuestionCheckRawValue([' 42 ', 'ignored'], 1), ' 42 ');
  assert.deepEqual(
    JSON.parse(buildQuestionCheckRawValue(['a'], 2)),
    { answers: ['a', ''] }
  );
});

test('all-empty multi-answer submissions are never accepted', () => {
  const rawValue = buildQuestionCheckRawValue(['', ''], 2);
  assert.equal(rules.isSolvedAnswerValid({ answers: ['', ''] }, rawValue, 17), false);
});
