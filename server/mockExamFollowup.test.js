import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMockExamFollowupQuestionId,
  buildMockExamFollowupSourceKey,
  finalizeMockExamFollowup,
  mergeMockExamFollowupQueueIntoTestsDb,
  normalizeMockExamFollowupHistory,
  normalizeMockExamFollowupQueue,
} from './mockExamFollowup.js';

const FINISHED_AT = '2026-09-10T12:00:00.000Z';

const makeQuestion = (id, answer = '42', extra = {}) => ({
  id,
  question: `Question ${id}`,
  answer,
  screenshots: [],
  files: [],
  ...extra,
});

const finalize = (overrides = {}) => finalizeMockExamFollowup({
  history: [],
  queue: [],
  exam: {
    id: 'exam-1',
    title: 'Осенний пробник',
    tasks: {
      5: makeQuestion('mock-5'),
    },
  },
  attempt: {
    solved: { 5: false },
    answers: { 5: '' },
  },
  attemptId: 'attempt-1',
  finishedAt: FINISHED_AT,
  testsDb: {},
  solvedByTask: {},
  ...overrides,
});

test('returns the original tests database when the follow-up queue is empty or invalid', () => {
  const testsDb = {
    5: { basic: [makeQuestion('base-1')] },
  };

  assert.strictEqual(
    mergeMockExamFollowupQueueIntoTestsDb({ testsDb, queue: [] }),
    testsDb
  );
  assert.strictEqual(
    mergeMockExamFollowupQueueIntoTestsDb({ testsDb, queue: [{ invalid: true }] }),
    testsDb
  );
});

test('copies only the task and level changed by a follow-up merge', () => {
  const baseQuestion = makeQuestion('base-1');
  const untouchedLevel = [makeQuestion('advanced-1')];
  const untouchedTask = { basic: [makeQuestion('task-6')] };
  const testsDb = {
    5: {
      title: 'Task 5',
      basic: [baseQuestion],
      advanced: untouchedLevel,
    },
    6: untouchedTask,
  };
  const followup = finalize({
    testsDb,
    solvedByTask: {
      5: { basic: { solved: ['base-1'] } },
    },
  });

  const merged = mergeMockExamFollowupQueueIntoTestsDb({
    testsDb,
    queue: followup.queue,
  });

  assert.notStrictEqual(merged, testsDb);
  assert.notStrictEqual(merged['5'], testsDb['5']);
  assert.notStrictEqual(merged['5'].basic, testsDb['5'].basic);
  assert.strictEqual(merged['5'].basic[0], baseQuestion);
  assert.strictEqual(merged['5'].advanced, untouchedLevel);
  assert.strictEqual(merged['6'], untouchedTask);
  assert.deepEqual(testsDb['5'].basic.map((question) => question.id), ['base-1']);
  assert.deepEqual(
    merged['5'].basic.map((question) => question.id),
    ['base-1', followup.queue[0].question.id]
  );
});

test('places a follow-up immediately after the rightmost solved question in the merged view', () => {
  const testsDb = {
    5: {
      basic: [
        makeQuestion('base-1'),
        makeQuestion('base-2'),
        makeQuestion('base-3'),
      ],
    },
  };
  const result = finalize({
    testsDb,
    solvedByTask: {
      5: {
        basic: { solved: ['base-1', 'base-2'] },
      },
    },
  });

  assert.equal(result.reused, false);
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].afterQuestionId, 'base-2');

  const merged = mergeMockExamFollowupQueueIntoTestsDb({
    testsDb,
    queue: result.queue,
  });
  assert.deepEqual(
    merged['5'].basic.map((question) => String(question.id)),
    ['base-1', 'base-2', result.queue[0].question.id, 'base-3']
  );
});

test('keeps FIFO order for several follow-ups sharing one anchor', () => {
  const testsDb = {
    5: {
      basic: [
        makeQuestion('base-1'),
        makeQuestion('base-2'),
        makeQuestion('base-3'),
      ],
    },
  };
  const solvedByTask = {
    5: {
      basic: { solved: ['base-1', 'base-2'] },
    },
  };
  const first = finalize({
    testsDb,
    solvedByTask,
    exam: {
      id: 'exam-1',
      title: 'Первый',
      tasks: { 5: makeQuestion('mock-first') },
    },
  });
  const second = finalize({
    history: first.history,
    queue: first.queue,
    testsDb,
    solvedByTask,
    exam: {
      id: 'exam-2',
      title: 'Второй',
      tasks: { 5: makeQuestion('mock-second') },
    },
    attemptId: 'attempt-2',
    finishedAt: '2026-10-10T12:00:00.000Z',
  });

  assert.deepEqual(
    second.queue.map((entry) => entry.afterQuestionId),
    ['base-2', 'base-2']
  );
  const merged = mergeMockExamFollowupQueueIntoTestsDb({
    testsDb,
    queue: second.queue,
  });
  assert.deepEqual(
    merged['5'].basic.map((question) => String(question.id)),
    [
      'base-1',
      'base-2',
      first.queue[0].question.id,
      second.queue[1].question.id,
      'base-3',
    ]
  );
});

test('can anchor a later follow-up after a solved question that already came from the queue', () => {
  const testsDb = {
    5: {
      basic: [makeQuestion('base-1'), makeQuestion('base-2')],
    },
  };
  const first = finalize({
    testsDb,
    solvedByTask: {
      5: {
        basic: { solved: ['base-1'] },
      },
    },
  });
  const queuedQuestionId = first.queue[0].question.id;
  const second = finalize({
    history: first.history,
    queue: first.queue,
    testsDb,
    solvedByTask: {
      5: {
        basic: { solved: ['base-1', queuedQuestionId] },
      },
    },
    exam: {
      id: 'exam-after-queue',
      title: 'Следующий',
      tasks: { 5: makeQuestion('mock-after-queue') },
    },
    attemptId: 'attempt-after-queue',
    finishedAt: '2026-11-10T12:00:00.000Z',
  });

  assert.equal(second.queue[1].afterQuestionId, queuedQuestionId);
  const merged = mergeMockExamFollowupQueueIntoTestsDb({
    testsDb,
    queue: second.queue,
  });
  assert.deepEqual(
    merged['5'].basic.map((question) => String(question.id)),
    ['base-1', queuedQuestionId, second.queue[1].question.id, 'base-2']
  );
});

test('queues both blank and wrong tasks, respects target scope, and skips solved tasks', () => {
  const result = finalize({
    exam: {
      id: 'exam-scope',
      title: 'Срез',
      tasks: {
        1: makeQuestion('mock-1', '1', { sourceLevelId: 'advanced' }),
        2: makeQuestion('mock-2', '2'),
        3: makeQuestion('mock-3', '3'),
        4: makeQuestion('mock-4', '4'),
      },
    },
    attempt: {
      answers: {
        1: '',
        2: 'wrong',
        3: '3',
        4: '',
      },
      solved: {
        1: false,
        2: false,
        3: true,
        4: false,
      },
    },
    targetTaskKeys: ['1', '2', '3'],
  });

  assert.deepEqual(
    result.queue.map((entry) => entry.sourceMockTaskNumber),
    [1, 2]
  );
  assert.equal(result.queue[0].levelId, 'advanced');
  assert.equal(result.queue[1].levelId, 'basic');
  assert.deepEqual(result.result.targetTaskKeys, ['1', '2', '3']);
  assert.equal(result.result.attemptSnapshot.answers['1'], '');
  assert.equal(result.result.attemptSnapshot.answers['2'], 'wrong');
  assert.equal(result.result.examSnapshot.tasks['4'].answer, '4');
});

test('finalization is idempotent by attemptId and source keys are not duplicated', () => {
  const first = finalize();
  const second = finalize({
    history: first.history,
    queue: first.queue,
    exam: {
      id: 'exam-1',
      title: 'Изменённое название не должно заменить snapshot',
      tasks: {
        5: makeQuestion('changed-question', 'changed-answer'),
      },
    },
    attempt: {
      solved: { 5: false },
      answers: { 5: 'changed-answer' },
    },
  });

  assert.equal(second.reused, true);
  assert.deepEqual(second.history, first.history);
  assert.deepEqual(second.queue, first.queue);
  assert.deepEqual(second.queuedEntries, []);
  assert.equal(second.result.examTitle, 'Осенний пробник');

  const sourceKey = buildMockExamFollowupSourceKey({
    examId: 'exam-1',
    attemptId: 'attempt-1',
    taskNumber: 5,
  });
  assert.equal(first.queue[0].sourceKey, sourceKey);
  assert.equal(first.queue[0].question.id, buildMockExamFollowupQuestionId(sourceKey));
});

test('creates separate 19, 20 and 21 entries under task 19 with per-question answer counts', () => {
  const originalLabel = { text: 'Исходная метка', color: '#123456' };
  const result = finalize({
    exam: {
      id: 'exam-game',
      title: 'Теория игр',
      tasks: {
        19: makeQuestion('mock-19', '19-answer', { label: originalLabel }),
        20: {
          ...makeQuestion('mock-20'),
          answers: ['20-a', '20-b'],
        },
        21: makeQuestion('mock-21', '21-answer'),
      },
    },
    attempt: {
      answers: { 19: '', 20: ['', ''], 21: 'wrong' },
      solved: { 19: false, 20: false, 21: false },
    },
    testsDb: {
      19: {
        basic: [makeQuestion('game-base')],
      },
    },
    solvedByTask: {
      19: {
        basic: { solved: ['game-base'] },
      },
    },
  });

  assert.deepEqual(
    result.queue.map((entry) => entry.destinationTaskNumber),
    [19, 19, 19]
  );
  assert.deepEqual(
    result.queue.map((entry) => entry.sourceMockTaskNumber),
    [19, 20, 21]
  );
  assert.deepEqual(
    result.queue.map((entry) => entry.answerCountOverride),
    [1, 2, 1]
  );
  assert.deepEqual(
    result.queue.map((entry) => entry.question.answerCountOverride),
    [1, 2, 1]
  );
  result.queue.forEach((entry, index) => {
    assert.deepEqual(entry.question.mockExamSource, {
      examId: 'exam-game',
      examTitle: 'Теория игр',
      taskNumber: 19 + index,
      label: 'Задание из пробника «Теория игр»',
    });
  });
  assert.deepEqual(result.queue[0].question.label, originalLabel);

  const merged = mergeMockExamFollowupQueueIntoTestsDb({
    testsDb: {
      19: {
        basic: [makeQuestion('game-base')],
      },
    },
    queue: result.queue,
  });
  assert.deepEqual(
    merged['19'].basic.map((question) => String(question.id)),
    [
      'game-base',
      result.queue[0].question.id,
      result.queue[1].question.id,
      result.queue[2].question.id,
    ]
  );
});

test('stores immutable deep snapshots and merge does not mutate its inputs', () => {
  const exam = {
    id: 'exam-copy',
    title: 'Snapshot',
    tasks: {
      6: makeQuestion('mock-copy', '6', {
        screenshots: [{ id: 'screen-1', url: '/uploads/original.png' }],
      }),
    },
  };
  const attempt = {
    answers: { 6: 'wrong' },
    solved: { 6: false },
    diagnostics: { elapsedMs: 1234 },
  };
  const testsDb = {
    6: {
      basic: [makeQuestion('base-copy')],
    },
  };
  const result = finalize({
    exam,
    attempt,
    attemptId: 'attempt-copy',
    testsDb,
  });

  exam.title = 'Mutated';
  exam.tasks['6'].answer = 'mutated';
  exam.tasks['6'].screenshots[0].url = '/uploads/mutated.png';
  attempt.answers['6'] = 'mutated';
  attempt.diagnostics.elapsedMs = 9999;

  assert.equal(result.result.examTitle, 'Snapshot');
  assert.equal(result.result.id, 'attempt-copy');
  assert.equal(result.result.status, 'finished');
  assert.equal(result.result.tasks['6'].answer, '6');
  assert.equal(result.result.answers['6'], 'wrong');
  assert.equal(result.result.solved['6'], false);
  assert.equal(result.result.examSnapshot.tasks['6'].answer, '6');
  assert.equal(
    result.result.examSnapshot.tasks['6'].screenshots[0].url,
    '/uploads/original.png'
  );
  assert.equal(result.result.attemptSnapshot.answers['6'], 'wrong');
  assert.equal(result.result.attemptSnapshot.diagnostics.elapsedMs, 1234);
  assert.equal(result.queue[0].question.answer, '6');

  const merged = mergeMockExamFollowupQueueIntoTestsDb({
    testsDb,
    queue: result.queue,
  });
  merged['6'].basic[0].question = 'changed in merge result';
  merged['6'].basic[1].answer = 'changed in merge result';

  assert.equal(testsDb['6'].basic[0].question, 'Question base-copy');
  assert.equal(result.queue[0].question.answer, '6');
});

test('normalizers discard invalid and duplicate history/queue entries without sharing references', () => {
  const historyEntry = {
    attemptId: 'attempt-normalize',
    examId: 'exam-normalize',
    examTitle: 'Normalize',
    finishedAt: FINISHED_AT,
    examSnapshot: { tasks: { 1: makeQuestion('history-question') } },
  };
  const history = normalizeMockExamFollowupHistory([
    historyEntry,
    { ...historyEntry, examTitle: 'Duplicate' },
    null,
  ]);
  assert.equal(history.length, 1);
  assert.equal(history[0].examTitle, 'Normalize');

  const sourceKey = buildMockExamFollowupSourceKey({
    examId: 'exam-normalize',
    attemptId: 'attempt-normalize',
    taskNumber: 1,
  });
  const queueEntry = {
    sourceKey,
    attemptId: 'attempt-normalize',
    examId: 'exam-normalize',
    examTitle: 'Normalize',
    sourceMockTaskNumber: 1,
    destinationTaskNumber: 1,
    levelId: 'basic',
    queueOrder: 1,
    question: makeQuestion('queue-question'),
  };
  const queue = normalizeMockExamFollowupQueue([
    queueEntry,
    { ...queueEntry, id: 'duplicate' },
    { sourceKey: 'invalid-without-question' },
  ]);
  assert.equal(queue.length, 1);

  historyEntry.examSnapshot.tasks['1'].answer = 'mutated';
  queueEntry.question.answer = 'mutated';
  assert.equal(history[0].examSnapshot.tasks['1'].answer, '42');
  assert.equal(queue[0].question.answer, '42');
});
