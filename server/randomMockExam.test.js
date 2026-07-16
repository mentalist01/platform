import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPersonalRandomMockTasks } from './randomMockExam.js';

const SOURCE_TASK_NUMBERS = [
  ...Array.from({ length: 19 }, (_, index) => index + 1),
  ...Array.from({ length: 6 }, (_, index) => index + 22),
];

const makeQuestion = (taskNumber, levelId, suffix = '1') => {
  const question = {
    id: `${levelId}-${taskNumber}-${suffix}`,
    text: `${levelId} question ${taskNumber}`,
    answer: `${taskNumber}`,
  };
  if (taskNumber === 19) {
    delete question.answer;
    question.answers = ['19', '20-a', '20-b', '21'];
  }
  return question;
};

const makeCompleteTestsDb = () => Object.fromEntries(
  SOURCE_TASK_NUMBERS.map((taskNumber) => [String(taskNumber), {
    basic: [makeQuestion(taskNumber, 'basic')],
    advanced: [makeQuestion(taskNumber, 'advanced')],
  }])
);

const buildAdvanced = (testsDb, overrides = {}) => buildPersonalRandomMockTasks({
  testsDb,
  levelId: 'advanced',
  pickIndex: () => 0,
  ...overrides,
});

test('advanced generation falls back to basic for an ordinary missing task number', () => {
  const testsDb = makeCompleteTestsDb();
  delete testsDb['4'].advanced;
  testsDb['4'].basic = [
    makeQuestion(4, 'basic', 'solved'),
    makeQuestion(4, 'basic', 'fresh'),
  ];

  const generated = buildAdvanced(testsDb, {
    solvedByTask: {
      4: {
        basic: { solved: ['basic-4-solved'] },
      },
    },
  });

  assert.equal(generated.summary.levelId, 'advanced');
  assert.equal(generated.summary.taskCount, 27);
  assert.deepEqual(generated.summary.missingTaskNumbers, []);
  assert.equal(generated.summary.fallbackTaskCount, 1);
  assert.equal(generated.summary.usedFallbacks, true);
  assert.equal(generated.tasks['4'].sourceLevelId, 'basic');
  assert.equal(generated.tasks['4'].sourceQuestionId, 'basic-4-fresh');
  assert.equal(generated.tasks['4'].randomSelection, 'fresh');
  assert.equal(generated.tasks['3'].sourceLevelId, 'advanced');
});

test('basic fallback for source task 19 fills mock tasks 19, 20 and 21', () => {
  const testsDb = makeCompleteTestsDb();
  delete testsDb['19'].advanced;

  const generated = buildAdvanced(testsDb);

  assert.equal(generated.summary.taskCount, 27);
  assert.deepEqual(generated.summary.missingTaskNumbers, []);
  assert.equal(generated.summary.fallbackTaskCount, 3);
  assert.equal(generated.summary.usedFallbacks, true);
  assert.deepEqual(
    [19, 20, 21].map((taskNumber) => generated.tasks[String(taskNumber)].sourceLevelId),
    ['basic', 'basic', 'basic']
  );
  assert.deepEqual(
    [19, 20, 21].map((taskNumber) => generated.tasks[String(taskNumber)].sourceTaskNumber),
    [19, 19, 19]
  );
  assert.deepEqual(generated.tasks['19'].answer, '19');
  assert.deepEqual(generated.tasks['20'].answers, ['20-a', '20-b']);
  assert.deepEqual(generated.tasks['21'].answer, '21');
});

test('advanced generation never uses basic when an advanced question exists', () => {
  const generated = buildAdvanced(makeCompleteTestsDb());

  assert.equal(generated.summary.taskCount, 27);
  assert.equal(generated.summary.fallbackTaskCount, 0);
  assert.equal(generated.summary.usedFallbacks, false);
  assert.deepEqual(generated.summary.missingTaskNumbers, []);
  Object.values(generated.tasks).forEach((question) => {
    assert.equal(question.sourceLevelId, 'advanced');
    assert.match(question.sourceQuestionId, /^advanced-/);
  });
});

test('advanced generation reports a number missing from both levels', () => {
  const testsDb = makeCompleteTestsDb();
  delete testsDb['4'].advanced;
  delete testsDb['4'].basic;

  const generated = buildAdvanced(testsDb);

  assert.equal(generated.summary.taskCount, 26);
  assert.deepEqual(generated.summary.missingTaskNumbers, [4]);
  assert.equal(generated.summary.fallbackTaskCount, 0);
  assert.equal(generated.tasks['4'], undefined);
});

test('solved advanced stays a repeat instead of falling back to basic', () => {
  const testsDb = makeCompleteTestsDb();
  const generated = buildAdvanced(testsDb, {
    solvedByTask: {
      4: {
        advanced: { solved: ['advanced-4-1'] },
      },
    },
  });

  assert.equal(generated.summary.taskCount, 27);
  assert.equal(generated.summary.fallbackTaskCount, 0);
  assert.equal(generated.summary.repeatTaskCount, 1);
  assert.equal(generated.summary.usedFallbacks, true);
  assert.equal(generated.tasks['4'].sourceLevelId, 'advanced');
  assert.equal(generated.tasks['4'].randomSelection, 'repeat');
});
