import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMockExamProgressEntries,
  getMockPrimaryScoreFromSolved,
  getMockSecondaryScoreFromSolved,
  summarizeMockExamProgress,
} from './mockExamProgress.js';

test('mock exam progress combines stored results and completed online attempts chronologically', () => {
  const entries = buildMockExamProgressEntries({
    studentData: {
      mocks: [{
        id: 'outside',
        date: '2026-09-05',
        score: 45,
        comment: 'Внешний пробник',
      }],
    },
    mockAttemptsByExam: {
      'exam-1': {
        mode: 'timer',
        timerStartedAt: '2026-10-10T08:00:00.000Z',
        timerFinishedAt: '2026-10-10T10:00:00.000Z',
        updatedAt: '2026-10-10T10:00:00.000Z',
        answers: { 1: '1', 26: '26' },
        solved: { 1: true, 26: true },
      },
    },
    mockExams: [{
      id: 'exam-1',
      title: 'Октябрьский вариант',
      tasks: { 1: {}, 26: {} },
    }],
  });

  assert.deepEqual(entries.map((entry) => entry.id), ['stored:outside', 'online:exam-1']);
  assert.equal(entries[0].score, 45);
  assert.equal(entries[1].title, 'Октябрьский вариант');
  assert.equal(entries[1].score, 20);
  assert.equal(entries[1].academicYear.key, '2026');
});

test('unfinished timer attempts are excluded while a finished zero-score attempt is kept', () => {
  const entries = buildMockExamProgressEntries({
    mockAttemptsByExam: {
      unfinished: {
        mode: 'timer',
        timerStartedAt: '2026-09-01T10:00:00.000Z',
        answers: { 1: 'wrong' },
        solved: { 1: false },
      },
      finished: {
        mode: 'timer',
        timerStartedAt: '2026-09-02T10:00:00.000Z',
        timerFinishedAt: '2026-09-02T12:00:00.000Z',
        answers: { 1: 'wrong' },
        solved: { 1: false },
      },
    },
  });

  assert.deepEqual(entries.map((entry) => entry.id), ['online:finished']);
  assert.equal(entries[0].score, 0);
});

test('academic years change on September 1', () => {
  const entries = buildMockExamProgressEntries({
    mockAttemptsByExam: {
      exam: {
        mode: 'timer',
        timerFinishedAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
        answers: { 1: '1', 2: '2' },
        solved: { 1: true, 2: true },
      },
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].academicYear.key, '2026');
  assert.equal(entries[0].score, 14);
});

test('mock score uses EGE task weights and the primary-to-secondary scale', () => {
  const solved = { 1: true, 2: true, 26: true, 27: true };
  assert.equal(getMockPrimaryScoreFromSolved(solved), 6);
  assert.equal(getMockSecondaryScoreFromSolved(solved), 40);
});

test('partial mock exam assignments are excluded from the EGE score trend', () => {
  const entries = buildMockExamProgressEntries({
    mockAttemptsByExam: {
      exam: {
        mode: 'timer',
        timerFinishedAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
        targetTaskKeys: ['1', '26'],
        answers: { 1: '1', 2: '2', 26: '26' },
        solved: { 1: true, 2: true, 26: true },
      },
    },
    mockExams: [{
      id: 'exam',
      tasks: { 1: {}, 2: {}, 26: {} },
    }],
  });

  assert.deepEqual(entries, []);
});

test('classic attempts appear only after every task has an answer', () => {
  const baseAttempt = {
    mode: 'classic',
    updatedAt: '2026-09-01T12:00:00.000Z',
    solved: { 1: true, 2: false },
  };
  const mockExams = [{ id: 'exam', tasks: { 1: {}, 2: {} } }];
  const partialEntries = buildMockExamProgressEntries({
    mockAttemptsByExam: {
      exam: {
        ...baseAttempt,
        answers: { 1: '1' },
      },
    },
    mockExams,
  });
  const completedEntries = buildMockExamProgressEntries({
    mockAttemptsByExam: {
      exam: {
        ...baseAttempt,
        answers: { 1: '1', 2: 'wrong' },
      },
    },
    mockExams,
  });

  assert.deepEqual(partialEntries, []);
  assert.equal(completedEntries.length, 1);
  assert.equal(completedEntries[0].score, 7);
});

test('two frozen attempts of the same exam produce two separate progress points', () => {
  const entries = buildMockExamProgressEntries({
    studentData: {
      mockAttemptResults: [
        {
          resultId: 'result-1',
          attemptId: 'attempt-1',
          examId: 'exam',
          examTitle: 'Пробник №1',
          mode: 'timer',
          finishedAt: '2026-09-01T12:00:00.000Z',
          solved: { 1: true, 2: false },
          tasks: { 1: {}, 2: {} },
          secondaryScore: 7,
        },
        {
          resultId: 'result-2',
          attemptId: 'attempt-2',
          examId: 'exam',
          examTitle: 'Пробник №1',
          mode: 'timer',
          finishedAt: '2026-11-01T12:00:00.000Z',
          solved: { 1: true, 2: true },
          tasks: { 1: {}, 2: {} },
          secondaryScore: 14,
        },
      ],
    },
  });

  assert.deepEqual(
    entries.map((entry) => [entry.id, entry.score]),
    [
      ['online-result:result-1', 7],
      ['online-result:result-2', 14],
    ]
  );
});

test('a finalized classic attempt is included even when some answers are missing', () => {
  const entries = buildMockExamProgressEntries({
    studentData: {
      mockAttemptResults: [{
        id: 'classic-result',
        attemptId: 'classic-attempt',
        examId: 'exam',
        title: 'Классический пробник',
        mode: 'classic',
        finishedAt: '2026-10-01T12:00:00.000Z',
        solved: { 1: true, 2: false },
        targetTaskKeys: [],
        tasks: { 1: {}, 2: {} },
      }],
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'online-result:classic-result');
  assert.equal(entries[0].score, 7);
});

test('the current attempt is not duplicated when its attemptId is already frozen', () => {
  const entries = buildMockExamProgressEntries({
    studentData: {
      mockAttemptResults: [{
        resultId: 'frozen',
        attemptId: 'attempt-1',
        examId: 'exam',
        mode: 'timer',
        finishedAt: '2026-10-01T12:00:00.000Z',
        solved: { 1: true },
        tasks: { 1: {} },
        secondaryScore: 7,
      }],
    },
    mockAttemptsByExam: {
      exam: {
        attemptId: 'attempt-1',
        mode: 'timer',
        timerFinishedAt: '2026-10-01T12:00:00.000Z',
        solved: { 1: true },
      },
    },
    mockExams: [{ id: 'exam', tasks: { 1: {} } }],
  });

  assert.deepEqual(entries.map((entry) => entry.id), ['online-result:frozen']);
});

test('frozen progress score is recalculated from its solved task map', () => {
  const entries = buildMockExamProgressEntries({
    studentData: {
      mockAttemptResults: [{
        resultId: 'stale-score',
        attemptId: 'attempt-1',
        examId: 'exam',
        mode: 'timer',
        finishedAt: '2026-09-08T12:00:00.000Z',
        solved: {
          1: true,
          3: true,
          4: true,
          7: true,
          19: true,
          20: true,
          21: true,
        },
        tasks: Object.fromEntries(Array.from({ length: 27 }, (_, index) => [String(index + 1), {}])),
        secondaryScore: 27,
      }],
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].score, 43);
});

test('a completed current attempt repairs a stale frozen solved map for the same attempt', () => {
  const tasks = Object.fromEntries(Array.from({ length: 27 }, (_, index) => [String(index + 1), {}]));
  const entries = buildMockExamProgressEntries({
    studentData: {
      mockAttemptResults: [{
        resultId: 'stale-result',
        attemptId: 'attempt-1',
        examId: 'exam',
        mode: 'timer',
        finishedAt: '2026-09-08T12:00:00.000Z',
        solved: { 1: true, 3: true, 4: true, 7: true },
        tasks,
        secondaryScore: 27,
      }],
    },
    mockAttemptsByExam: {
      exam: {
        attemptId: 'attempt-1',
        mode: 'timer',
        timerFinishedAt: '2026-09-08T12:00:00.000Z',
        solved: {
          1: true,
          3: true,
          4: true,
          7: true,
          19: true,
          20: true,
          21: true,
        },
      },
    },
    mockExams: [{ id: 'exam', tasks }],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].score, 43);
});

test('an active continuation does not overwrite the frozen first-attempt score', () => {
  const tasks = { 1: {}, 2: {} };
  const entries = buildMockExamProgressEntries({
    studentData: {
      mockAttemptResults: [{
        resultId: 'first-result',
        attemptId: 'attempt-1',
        examId: 'exam',
        mode: 'timer',
        finishedAt: '2026-09-08T12:00:00.000Z',
        solved: { 1: true, 2: false },
        tasks,
        secondaryScore: 7,
      }],
    },
    mockAttemptsByExam: {
      exam: {
        attemptId: 'attempt-1',
        mode: 'timer',
        status: 'active',
        solved: { 1: true, 2: true },
      },
    },
    mockExams: [{ id: 'exam', tasks }],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].score, 7);
});

test('invalid calendar dates are ignored instead of rolling into another month', () => {
  const entries = buildMockExamProgressEntries({
    studentData: {
      mocks: [{ id: 'invalid', date: '2026-02-31', score: 50 }],
    },
  });

  assert.deepEqual(entries, []);
});

test('a completed current attempt keeps its original scope after the mock is edited', () => {
  const entries = buildMockExamProgressEntries({
    mockExams: [{
      id: 'edited',
      title: 'Новая редакция',
      tasks: { 1: { answer: 'new' }, 2: { answer: 'added' } },
    }],
    mockAttemptsByExam: {
      edited: {
        attemptId: 'old-attempt',
        mode: 'classic',
        updatedAt: '2026-09-09T10:00:00.000Z',
        answers: { 1: 'old' },
        solved: { 1: true },
        examSnapshot: {
          id: 'edited',
          title: 'Редакция ученика',
          contentRevision: 1,
          tasks: { 1: { answer: 'old' } },
        },
      },
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Редакция ученика');
  assert.equal(entries[0].score, 7);
});

test('mock progress summary reports first, latest, best, average and delta', () => {
  assert.deepEqual(
    summarizeMockExamProgress([{ score: 45 }, { score: 62 }, { score: 58 }]),
    {
      count: 3,
      firstScore: 45,
      latestScore: 58,
      delta: 13,
      bestScore: 62,
      averageScore: 55,
    }
  );
});
