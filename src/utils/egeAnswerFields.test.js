import test from 'node:test';
import assert from 'node:assert/strict';
import {getAnswerCountForTask, getMockAnswerCountForTask, preparedAnswerTask, splitLegacyPreparedAnswer} from './egeAnswerFields.js';

test('prepared tasks use question-bank counts; mock game-theory slots keep their existing rules', () => {
  for (const number of [17, 18, 26]) assert.equal(preparedAnswerTask({answers: ['']}, number).answers.length, 2);
  assert.equal(getAnswerCountForTask(19), 4);
  assert.equal(getMockAnswerCountForTask(19), 1);
  assert.equal(getMockAnswerCountForTask(20), 2);
  assert.equal(getAnswerCountForTask(25), 20);
  assert.equal(getAnswerCountForTask(27), 4);
  assert.equal(preparedAnswerTask({answers: [''], answerCountOverride: 2}, 25).answers.length, 2);
});

test('legacy answers split only when all fields are unambiguous, preserving order and leading zeros', () => {
  const task = {format: 'exact', answers: ['294 1356810']};
  assert.deepEqual(splitLegacyPreparedAnswer(task, 17).answers, ['294', '1356810']);
  assert.deepEqual(preparedAnswerTask({format: 'exact', answers: ['007\t0012']}, 17).answers, ['007', '0012']);
  assert.equal(splitLegacyPreparedAnswer({answers: ['294']}, 17), null);
  assert.equal(splitLegacyPreparedAnswer(task, 3), null);
  assert.equal(splitLegacyPreparedAnswer({...task, answerCountOverride: 1}, 17), null);
  assert.equal(splitLegacyPreparedAnswer({answers: ['1 2 3']}, 17), null);
  assert.deepEqual(preparedAnswerTask({answers: ['a', 'b', 'c']}, 3).answers, ['a', 'b', 'c']);
});

test('independent questions preserve per-question lists, explicit counts and comparison format', () => {
  const task={answerMode:'independent',answerCountOverride:4,format:'unordered',answers:['1 2','3 4','5','6']};
  assert.deepEqual(preparedAnswerTask(task,22),task);
  assert.deepEqual(preparedAnswerTask({...task,answers:['1 2 3 4']},22).answers,['1 2 3 4','','','']);
  assert.equal(splitLegacyPreparedAnswer({...task,answers:['1 2 3 4']},22),null);
  assert.equal(preparedAnswerTask({...task,format:'number'},17).format,'number');
  assert.equal(preparedAnswerTask({answers:['1','2'],format:'exact'},17).format,'fields');
});
