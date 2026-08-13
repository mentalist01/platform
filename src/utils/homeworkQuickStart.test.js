import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHomeworkQuickTaskQueue,
  buildHomeworkTimePlans,
  completeHomeworkQuickTaskSession,
  pickNextHomeworkQuickTask,
  rankHomeworkQuickTaskQueueByDifficulty,
} from './homeworkQuickStart.js';

test('buildHomeworkQuickTaskQueue keeps only unfinished atomic homework tasks', () => {
  const queue = buildHomeworkQuickTaskQueue([
    {
      type: 'task',
      taskNumber: 8,
      levelId: 'basic',
      taskTitle: 'Системы счисления',
      targetStatus: [
        { num: 1, questionId: 'q-1', solved: true },
        { num: 2, questionId: 'q-2', solved: false },
      ],
    },
    {
      type: 'mock',
      mockExamId: 'mock-1',
      assignmentTier: 'optional',
      targetStatus: [{ num: 1, solved: false }],
    },
  ]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].questionId, 'q-2');
  assert.equal(queue[0].questionNumber, 2);
  assert.equal(queue[0].key, '8|basic|q-2');
});

test('buildHomeworkQuickTaskQueue deduplicates repeated homework targets', () => {
  const duplicate = {
    type: 'task',
    taskNumber: 5,
    levelId: 'medium',
    targetStatus: [{ num: 3, questionId: 'same', solved: false }],
  };

  assert.equal(buildHomeworkQuickTaskQueue([duplicate, duplicate]).length, 1);
});

test('pickNextHomeworkQuickTask skips current and completed tasks', () => {
  const queue = [
    { key: 'first' },
    { key: 'second' },
    { key: 'third' },
  ];

  assert.deepEqual(
    pickNextHomeworkQuickTask(queue, ['second'], 'first'),
    { key: 'third' }
  );
});

test('required homework targets come before optional targets', () => {
  const queue = buildHomeworkQuickTaskQueue([
    {
      type: 'task',
      assignmentTier: 'optional',
      taskNumber: 9,
      levelId: 'basic',
      targetStatus: [{ num: 1, questionId: 'optional', solved: false }],
    },
    {
      type: 'task',
      assignmentTier: 'required',
      taskNumber: 4,
      levelId: 'basic',
      targetStatus: [{ num: 2, questionId: 'required', solved: false }],
    },
  ]);

  assert.deepEqual(queue.map((item) => item.questionId), ['required', 'optional']);
});

test('reliable difficulty orders quick homework from easiest to hardest', () => {
  const queue = buildHomeworkQuickTaskQueue([{
    type: 'task',
    assignmentTier: 'required',
    taskNumber: 8,
    levelId: 'basic',
    targetStatus: [
      { num: 1, questionId: 'hard', solved: false },
      { num: 2, questionId: 'easy', solved: false },
      { num: 3, questionId: 'medium', solved: false },
    ],
  }]);
  const ranked = rankHomeworkQuickTaskQueueByDifficulty(queue, {
    8: {
      basic: {
        hard: { score: 78, sampleSize: 7 },
        easy: { score: 12, sampleSize: 5 },
        medium: { score: 43, sampleSize: 10 },
      },
    },
  });

  assert.deepEqual(ranked.map((item) => item.questionId), ['easy', 'medium', 'hard']);
  assert.deepEqual(ranked.map((item) => item.difficultyScore), [12, 43, 78]);
});

test('unknown and provisional difficulty stays after reliable estimates in original order', () => {
  const queue = buildHomeworkQuickTaskQueue([{
    type: 'task',
    taskNumber: 6,
    levelId: 'basic',
    targetStatus: [
      { num: 1, questionId: 'unknown-first', solved: false },
      { num: 2, questionId: 'known', solved: false },
      { num: 3, questionId: 'provisional', solved: false },
      { num: 4, questionId: 'unknown-last', solved: false },
    ],
  }]);
  const ranked = rankHomeworkQuickTaskQueueByDifficulty(queue, {
    6: {
      basic: {
        known: { score: 24, sampleSize: 5 },
        provisional: { score: 3, sampleSize: 4 },
      },
    },
  });

  assert.deepEqual(
    ranked.map((item) => item.questionId),
    ['known', 'unknown-first', 'provisional', 'unknown-last']
  );
  assert.equal(ranked[0].difficultyKnown, true);
  assert.equal(ranked[2].difficultyKnown, false);
});

test('required work remains before easier optional work', () => {
  const queue = buildHomeworkQuickTaskQueue([
    {
      type: 'task',
      assignmentTier: 'optional',
      taskNumber: 9,
      levelId: 'basic',
      targetStatus: [{ num: 1, questionId: 'optional-easy', solved: false }],
    },
    {
      type: 'task',
      assignmentTier: 'required',
      taskNumber: 4,
      levelId: 'basic',
      targetStatus: [{ num: 2, questionId: 'required-hard', solved: false }],
    },
  ]);
  const ranked = rankHomeworkQuickTaskQueueByDifficulty(queue, {
    9: { basic: { 'optional-easy': { score: 1, sampleSize: 8 } } },
    4: { basic: { 'required-hard': { score: 90, sampleSize: 8 } } },
  });

  assert.deepEqual(ranked.map((item) => item.questionId), ['required-hard', 'optional-easy']);
});

test('malformed goals and targets are ignored', () => {
  const queue = buildHomeworkQuickTaskQueue([
    { type: 'task', taskNumber: '', levelId: 'basic', targetStatus: [{ num: 1 }] },
    { type: 'task', taskNumber: 5, levelId: '', targetStatus: [{ num: 1 }] },
    { type: 'task', taskNumber: 5, levelId: 'basic', targetStatus: [{ num: 0 }] },
  ]);

  assert.deepEqual(queue, []);
});

test('completing a quick task advances once and becomes complete on the last item', () => {
  const first = { key: 'first' };
  const second = { key: 'second' };
  const initial = {
    status: 'solving',
    currentTask: first,
    completedKeys: [],
    completedCount: 0,
  };
  const afterFirst = completeHomeworkQuickTaskSession(initial, [first, second], first);
  assert.equal(afterFirst.status, 'celebrate');
  assert.equal(afterFirst.completedCount, 1);

  const duplicate = completeHomeworkQuickTaskSession(afterFirst, [first, second], first);
  assert.equal(duplicate, afterFirst);

  const secondSession = { ...afterFirst, status: 'solving', currentTask: second };
  const afterSecond = completeHomeworkQuickTaskSession(secondSession, [first, second], second);
  assert.equal(afterSecond.status, 'complete');
  assert.equal(afterSecond.completedCount, 2);
});

const MINUTE_MS = 60_000;

const timeCandidate = (
  key,
  minutes,
  score,
  { sampleSize = 1, assignmentTier = 'required', ...overrides } = {}
) => ({
  key,
  kind: 'question',
  status: 'pending',
  assignmentTier,
  analytics: {
    averageActiveDurationMs: minutes * MINUTE_MS,
    sampleSize,
    score,
  },
  ...overrides,
});

test('classic mock goals add stable pending atomic quick-start candidates', () => {
  const queue = buildHomeworkQuickTaskQueue([{
    type: 'mock',
    mockExamId: 'exam-1',
    mockExamTitle: 'August mock',
    assignmentTier: 'optional',
    mode: 'classic',
    taskStatus: [
      { taskKey: '1', taskNumber: 1, solved: true },
      { taskKey: '7', taskNumber: 7, solved: false },
      { taskKey: '7', taskNumber: 7, solved: false },
      { taskKey: '8', taskNumber: 8, status: 'completed' },
    ],
  }]);

  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0], {
    kind: 'mock',
    mode: 'classic',
    status: 'pending',
    mockExamId: 'exam-1',
    mockExamTitle: 'August mock',
    taskKey: '7',
    taskNumber: 7,
    assignmentTier: 'optional',
    goalIndex: 0,
    targetIndex: 1,
    key: 'mock|exam-1|7',
  });
});

test('required timer mock goals become non-openable plan blockers, not atomic tasks', () => {
  const timerGoal = {
    type: 'mock',
    mockExamId: 'exam-1',
    mockExamTitle: 'Timer mock',
    taskStatus: [{ taskKey: '1', solved: false }],
  };

  const byMode = buildHomeworkQuickTaskQueue([{ ...timerGoal, mode: 'timer' }]);
  assert.deepEqual(byMode, [{
    kind: 'blocker',
    blockerKind: 'timer-mock',
    isPlanBlocker: true,
    openable: false,
    status: 'pending',
    assignmentTier: 'required',
    mockExamId: 'exam-1',
    mockExamTitle: 'Timer mock',
    mode: 'timer',
    goalIndex: 0,
    key: 'blocker|timer-mock|exam-1',
  }]);
  assert.deepEqual(
    buildHomeworkQuickTaskQueue([{ ...timerGoal, requiredMode: 'timer' }]),
    byMode
  );
  assert.deepEqual(buildHomeworkQuickTaskQueue([timerGoal]), byMode);
  assert.deepEqual(buildHomeworkQuickTaskQueue([{
    ...timerGoal,
    mode: 'timer',
    assignmentTier: 'optional',
  }]), []);
  assert.deepEqual(buildHomeworkQuickTaskQueue([{
    ...timerGoal,
    mode: 'timer',
    completed: true,
  }]), []);
});

test('ordinary quick candidates expose their task kind without changing their key', () => {
  const standard = buildHomeworkQuickTaskQueue([{
    type: 'task',
    taskNumber: 4,
    levelId: 'basic',
    targetStatus: [{ questionId: 'q-1', num: 1, solved: false }],
  }])[0];
  const python = buildHomeworkQuickTaskQueue([{
    type: 'task',
    taskNumber: 101,
    levelId: 'python',
    targetStatus: [{ questionId: 'py-1', num: 1, solved: false }],
  }])[0];

  assert.equal(standard.kind, 'question');
  assert.equal(standard.questionKind, 'standard');
  assert.equal(standard.key, '4|basic|q-1');
  assert.equal(python.questionKind, 'python');
});

test('time plans use the local one-observation threshold', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('a', 3, 10),
    timeCandidate('b', 3, 20),
    timeCandidate('c', 4, 30),
  ]);

  assert.equal(result.measuredTaskCount, 3);
  assert.deepEqual(result.availablePlans.map((plan) => plan.budgetMinutes), [3, 6, 10]);
  assert.deepEqual(result.availablePlans.map((plan) => plan.estimatedMinutes), [3, 6, 10]);
  assert.deepEqual(result.availablePlans.at(-1).tasks.map((task) => task.key), ['a', 'b', 'c']);
  assert.equal(result.fallbackTask, null);
});

test('an item needs positive duration, sample and known difficulty to be measured', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('valid', 5, 0, { sampleSize: 1 }),
    timeCandidate('zero-duration', 0, 10),
    timeCandidate('no-samples', 5, 10, { sampleSize: 0 }),
    timeCandidate('no-difficulty', 5, null),
    timeCandidate('known-category', 5, null, {
      analytics: { averageDurationMs: 5 * MINUTE_MS, sampleSize: 1, category: 'hard' },
    }),
  ]);

  assert.equal(result.measuredTaskCount, 2);
  assert.deepEqual(result.measuredTasks.map((task) => task.key), ['valid', 'known-category']);
  assert.equal(result.measuredTasks[0].difficultyScore, 0);
  assert.equal(result.measuredTasks[1].difficultyScore, 60);
});

test('solved and completed candidates never enter a time plan', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('pending-a', 4, 10),
    timeCandidate('solved-flag', 4, 20, { solved: true }),
    timeCandidate('completed-status', 4, 30, { status: 'completed' }),
    timeCandidate('pending-b', 4, 40),
    timeCandidate('pending-c', 4, 50),
  ]);

  assert.deepEqual(result.eligibleTasks.map((task) => task.key), [
    'pending-a',
    'pending-b',
    'pending-c',
  ]);
  assert.deepEqual(result.availablePlans.at(-1).tasks.map((task) => task.key), [
    'pending-a',
    'pending-b',
    'pending-c',
  ]);
});

test('one or two measured candidates only produce the easiest fallback', () => {
  const one = buildHomeworkTimePlans([timeCandidate('only', 10, 40)]);
  assert.deepEqual(one.availablePlans, []);
  assert.equal(one.fallbackTask.key, 'only');

  const two = buildHomeworkTimePlans([
    timeCandidate('shorter-but-harder', 3, 30),
    timeCandidate('easier', 30, 10),
  ]);
  assert.deepEqual(two.availablePlans, []);
  assert.equal(two.fallbackTask.key, 'easier');
});

test('fallback tie-breaking uses duration and then original order', () => {
  const durationTieBreak = buildHomeworkTimePlans([
    timeCandidate('long', 6, 10),
    timeCandidate('short', 4, 10),
  ]);
  assert.equal(durationTieBreak.fallbackTask.key, 'short');

  const orderTieBreak = buildHomeworkTimePlans([
    timeCandidate('first', 4, 10),
    timeCandidate('second', 4, 10),
  ]);
  assert.equal(orderTieBreak.fallbackTask.key, 'first');
});

test('fallback never selects optional work while openable required work remains', () => {
  const measuredRequired = buildHomeworkTimePlans([
    timeCandidate('optional-easy', 2, 1, { assignmentTier: 'optional' }),
    timeCandidate('required-hard', 5, 90),
  ]);
  assert.equal(measuredRequired.fallbackTask.key, 'required-hard');

  const unknownRequired = buildHomeworkTimePlans([
    timeCandidate('optional-measured', 2, 1, { assignmentTier: 'optional' }),
    { key: 'required-unknown', status: 'pending', assignmentTier: 'required' },
  ]);
  assert.equal(unknownRequired.fallbackTask.key, 'required-unknown');
});

test('zero measured candidates fall back to the first pending candidate', () => {
  const result = buildHomeworkTimePlans([
    { key: 'solved', solved: true },
    { key: 'first-pending', status: 'pending' },
    { key: 'second-pending' },
  ]);

  assert.deepEqual(result.availablePlans, []);
  assert.equal(result.measuredTaskCount, 0);
  assert.equal(result.fallbackTask.key, 'first-pending');
  assert.equal(result.fallbackTask.measured, false);
});

test('plans expose three progressive honest durations when less than thirty minutes are available', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('a', 4, 10),
    timeCandidate('b', 4, 20),
    timeCandidate('c', 4, 30),
    timeCandidate('d', 4, 40),
    timeCandidate('e', 4, 50),
  ]);

  assert.deepEqual(
    result.availablePlans.map((plan) => [plan.budgetMinutes, plan.estimatedMinutes]),
    [[8, 8], [12, 12], [20, 20]]
  );
});

test('short plan durations follow cumulative easiest-first work', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('five', 5, 10),
    timeCandidate('four', 4, 20),
    timeCandidate('two', 2, 30),
  ]);
  assert.deepEqual(result.availablePlans.map((plan) => plan.estimatedMinutes), [5, 9, 11]);
  assert.deepEqual(result.availablePlans.at(-1).tasks.map((task) => task.key), ['five', 'four', 'two']);
});

test('thirty or more available minutes produce familiar 10, 20 and 30 minute choices', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('ten', 10, 10),
    timeCandidate('ten-more', 10, 20),
    timeCandidate('ten-last', 10, 30),
    timeCandidate('extra', 5, 40),
  ]);
  assert.deepEqual(result.availablePlans.map((plan) => plan.budgetMinutes), [10, 20, 30]);
});

test('required tasks are selected before optional tasks', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('required-a', 4, 90),
    timeCandidate('required-b', 4, 80),
    timeCandidate('optional-perfect', 10, 1, { assignmentTier: 'optional' }),
  ]);

  assert.deepEqual(result.availablePlans.at(-1).tasks.map((task) => task.key), [
    'required-a',
    'required-b',
    'optional-perfect',
  ]);
  assert.ok(result.availablePlans.every((plan) => {
    const keys = plan.tasks.map((task) => task.key);
    return !keys.includes('optional-perfect')
      || (keys.includes('required-a') && keys.includes('required-b'));
  }));
});

test('optional tasks fill a plan only after all required work is exhausted', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('required-a', 3, 80),
    timeCandidate('required-b', 3, 90),
    timeCandidate('optional-a', 2, 10, { assignmentTier: 'optional' }),
    timeCandidate('optional-b', 2, 20, { assignmentTier: 'optional' }),
  ]);

  assert.deepEqual(result.availablePlans.at(-1).tasks.map((task) => task.key), [
    'required-a',
    'required-b',
    'optional-a',
    'optional-b',
  ]);
});

test('optional tasks can improve an already valid plan only after all required tasks', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('required-a', 4, 80),
    timeCandidate('required-b', 4, 90),
    timeCandidate('optional', 2, 10, { assignmentTier: 'optional' }),
  ]);

  assert.deepEqual(result.availablePlans.at(-1).tasks.map((task) => task.key), [
    'required-a',
    'required-b',
    'optional',
  ]);
  assert.equal(result.availablePlans.at(-1).estimatedMinutes, 10);
});

test('unknown-duration required work blocks optional tasks from every time plan', () => {
  const result = buildHomeworkTimePlans([
    { key: 'required-unknown', status: 'pending', assignmentTier: 'required' },
    timeCandidate('required-known-a', 4, 70),
    timeCandidate('required-known-b', 4, 80),
    timeCandidate('required-known-c', 2, 90),
    timeCandidate('optional-perfect', 2, 1, { assignmentTier: 'optional' }),
  ]);

  assert.equal(result.hasUnknownRequired, true);
  assert.ok(result.availablePlans.length > 0);
  assert.deepEqual(result.availablePlans.at(-1).tasks.map((task) => task.key), [
    'required-known-a',
    'required-known-b',
    'required-known-c',
  ]);
  assert.ok(result.availablePlans.every((plan) => (
    plan.tasks.every((task) => task.assignmentTier !== 'optional')
  )));
});

test('timer mock blocker prevents optional-only plans and is never a fallback or next task', () => {
  const [blocker] = buildHomeworkQuickTaskQueue([{
    type: 'mock',
    mode: 'timer',
    assignmentTier: 'required',
    mockExamId: 'exam-timer',
    taskStatus: [{ taskKey: '1', solved: false }],
  }]);
  const result = buildHomeworkTimePlans([
    blocker,
    timeCandidate('optional-a', 3, 10, { assignmentTier: 'optional' }),
    timeCandidate('optional-b', 3, 20, { assignmentTier: 'optional' }),
    timeCandidate('optional-c', 4, 30, { assignmentTier: 'optional' }),
  ]);

  assert.deepEqual(result.availablePlans, []);
  assert.equal(result.fallbackTask, null);
  assert.equal(result.hasUnknownRequired, true);
  assert.deepEqual(result.blockerTasks.map((task) => task.key), [blocker.key]);
  assert.equal(pickNextHomeworkQuickTask([blocker], [], ''), null);
});

test('mock analytics participates in quick queue difficulty ranking', () => {
  const ranked = rankHomeworkQuickTaskQueueByDifficulty([
    {
      key: 'mock-hard',
      kind: 'mock',
      taskNumber: 8,
      assignmentTier: 'required',
      analytics: { score: 80, sampleSize: 1 },
    },
    {
      key: 'mock-easy',
      kind: 'mock',
      taskNumber: 2,
      assignmentTier: 'required',
      analytics: { category: 'easy', sampleSize: 1 },
    },
  ], {}, { minimumSampleSize: 1 });

  assert.deepEqual(ranked.map((task) => task.key), ['mock-easy', 'mock-hard']);
  assert.deepEqual(ranked.map((task) => task.difficultyScore), [20, 80]);
});

test('very long available work still exposes the first three progressive choices', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('hard', 40, 90),
    timeCandidate('easy', 40, 5),
    timeCandidate('medium', 40, 50),
  ]);

  assert.deepEqual(result.availablePlans.map((plan) => plan.budgetMinutes), [40]);
  assert.equal(result.availablePlans[0].tasks[0].key, 'hard');
  assert.equal(result.fallbackTask, null);
});

test('plan selection is deterministic for equal-duration alternatives', () => {
  const candidates = [
    timeCandidate('first', 5, 10),
    timeCandidate('second', 5, 20),
    timeCandidate('third', 5, 30),
  ];
  const firstRun = buildHomeworkTimePlans(candidates);
  const secondRun = buildHomeworkTimePlans(candidates);

  assert.deepEqual(firstRun, secondRun);
  assert.deepEqual(firstRun.availablePlans.map((plan) => plan.tasks.map((task) => task.key)), [
    ['first'],
    ['first', 'second'],
    ['first', 'second', 'third'],
  ]);
});

test('sub-fifteen-second observations do not create absurd time plans but still rank fallback', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('slower', 12_000 / MINUTE_MS, 0),
    timeCandidate('fastest', 1_400 / MINUTE_MS, 0),
    timeCandidate('middle', 4_000 / MINUTE_MS, 0),
  ]);

  assert.equal(result.measuredTaskCount, 0);
  assert.equal(result.excludedShortDurationCount, 3);
  assert.deepEqual(result.availablePlans, []);
  assert.equal(result.fallbackTask.key, 'fastest');
});

test('a fifteen-second observation is valid for a time plan', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('a', 15_000 / MINUTE_MS, 10),
    timeCandidate('b', 20_000 / MINUTE_MS, 20),
    timeCandidate('c', 25_000 / MINUTE_MS, 30),
  ]);

  assert.equal(result.measuredTaskCount, 3);
  assert.equal(result.excludedShortDurationCount, 0);
  assert.deepEqual(result.availablePlans.map((plan) => plan.displayMinutes), [1]);
  assert.deepEqual(result.availablePlans[0].tasks.map((task) => task.key), ['a']);
});

test('three observations confirm a genuinely fast task from three seconds', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('three-seconds', 3_000 / MINUTE_MS, 10, { sampleSize: 3 }),
    timeCandidate('eleven-seconds', 11_000 / MINUTE_MS, 20, { sampleSize: 5 }),
    timeCandidate('fourteen-seconds', 14_000 / MINUTE_MS, 30, { sampleSize: 3 }),
  ]);

  assert.equal(result.measuredTaskCount, 3);
  assert.equal(result.excludedShortDurationCount, 0);
  assert.deepEqual(result.availablePlans[0].tasks.map((task) => task.key), [
    'three-seconds',
    'eleven-seconds',
  ]);
});

test('less than three seconds stays technical noise at any sample size', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('noise-a', 2_999 / MINUTE_MS, 10, { sampleSize: 5 }),
    timeCandidate('noise-b', 1_000 / MINUTE_MS, 20, { sampleSize: 100 }),
    timeCandidate('valid', 3_000 / MINUTE_MS, 30, { sampleSize: 3 }),
  ]);

  assert.equal(result.measuredTaskCount, 1);
  assert.equal(result.excludedShortDurationCount, 2);
  assert.deepEqual(result.availablePlans, []);
  assert.equal(result.fallbackTask.key, 'noise-a');
});

test('actual duration rounds upward only for the displayed whole-minute estimate', () => {
  const result = buildHomeworkTimePlans([
    timeCandidate('a', 2.2, 10),
    timeCandidate('b', 2.2, 20),
    timeCandidate('c', 3.1, 30),
  ]);

  assert.deepEqual(result.availablePlans.map((plan) => plan.estimatedMinutes), [2.2, 4.4, 7.5]);
  assert.deepEqual(result.availablePlans.map((plan) => plan.displayMinutes), [3, 5, 8]);
});
