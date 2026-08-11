import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQuestionDifficultyIndex,
  collectQuestionDifficultyObservations,
  extractFirstSolveObservation,
  extractFirstSolveTelemetryObservation,
  getQuestionDifficultyFromIndex,
} from './questionDifficulty.js';

const attempt = (submittedAt, correct, extra = {}) => ({
  id: `${submittedAt}-${correct}-${extra.idSuffix || ''}`,
  submittedAt,
  correct,
  ...extra,
});

test('extractFirstSolveObservation uses the first correct answer and only prior wrong attempts', () => {
  const result = extractFirstSolveObservation([
    attempt('2026-01-01T10:03:00.000Z', true, { solveDurationMs: 180000 }),
    attempt('2026-01-01T10:01:00.000Z', false),
    attempt('2026-01-01T10:02:00.000Z', false),
    attempt('2026-01-01T10:04:00.000Z', false),
    attempt('2026-01-01T10:05:00.000Z', true, { solveDurationMs: 999999 }),
  ]);

  assert.deepEqual(result, {
    activeDurationMs: 180000,
    solveDurationMs: 180000,
    wrongAttempts: 2,
    solvedAt: '2026-01-01T10:03:00.000Z',
  });
});

test('the first correct answer must itself contain a valid solveDurationMs', () => {
  assert.equal(extractFirstSolveObservation([
    attempt('2026-01-01T10:00:00.000Z', true),
    attempt('2026-01-01T10:01:00.000Z', true, { solveDurationMs: 60000 }),
  ]), null);
  assert.equal(extractFirstSolveObservation([
    attempt('bad timestamp', true, { solveDurationMs: 60000 }),
  ]), null);
  assert.equal(extractFirstSolveObservation([
    attempt('2026-01-01T10:00:00.000Z', true, { solveDurationMs: -1 }),
  ]), null);
});

test('immutable first-solve telemetry is validated independently of answer history', () => {
  assert.deepEqual(extractFirstSolveTelemetryObservation({
    solveDurationMs: 90_000,
    wrongAttempts: 3,
    solvedAt: '2026-01-01T10:00:00.000Z',
  }), {
    activeDurationMs: 90_000,
    solveDurationMs: 90_000,
    wrongAttempts: 3,
    solvedAt: '2026-01-01T10:00:00.000Z',
  });
  assert.equal(extractFirstSolveTelemetryObservation({
    solveDurationMs: 0,
    wrongAttempts: 1,
    solvedAt: '2026-01-01T10:00:00.000Z',
  }), null);
  assert.equal(extractFirstSolveTelemetryObservation({
    solveDurationMs: 90_000,
    wrongAttempts: 1.5,
    solvedAt: '2026-01-01T10:00:00.000Z',
  }), null);
});

test('collector returns at most one observation per student and question', () => {
  const progressDb = {
    studentA: {
      solvedByTask: {
        1: {
          basic: {
            answerHistory: {
              q1: [
                attempt('2026-01-01T10:00:00.000Z', false),
                attempt('2026-01-01T10:01:00.000Z', true, { solveDurationMs: 60000 }),
                attempt('2026-01-01T10:02:00.000Z', true, { solveDurationMs: 120000 }),
              ],
            },
          },
        },
      },
    },
    studentB: {
      solvedByTask: {
        1: {
          basic: {
            answerHistory: {
              q1: [attempt('2026-01-02T10:00:00.000Z', false)],
              q2: [attempt('2026-01-02T10:00:00.000Z', true)],
            },
          },
        },
      },
    },
  };

  const observations = collectQuestionDifficultyObservations(progressDb);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].studentId, 'studentA');
  assert.equal(observations[0].questionId, 'q1');
  assert.equal(observations[0].wrongAttempts, 1);
});

test('collector prefers immutable telemetry, includes telemetry-only questions, and falls back safely', () => {
  const progressDb = {
    studentA: {
      solvedByTask: {
        1: {
          basic: {
            firstSolveTelemetry: {
              preferred: {
                solveDurationMs: 60_000,
                wrongAttempts: 2,
                solvedAt: '2026-01-01T10:00:00.000Z',
              },
              telemetryOnly: {
                solveDurationMs: 120_000,
                wrongAttempts: 4,
                solvedAt: '2026-01-01T11:00:00.000Z',
              },
              invalidUsesHistory: {
                solveDurationMs: -1,
                wrongAttempts: 99,
                solvedAt: 'bad timestamp',
              },
            },
            answerHistory: {
              preferred: [
                attempt('2026-01-02T10:00:00.000Z', true, { solveDurationMs: 999_000 }),
              ],
              invalidUsesHistory: [
                attempt('2026-01-02T11:00:00.000Z', false),
                attempt('2026-01-02T11:01:00.000Z', true, { solveDurationMs: 180_000 }),
              ],
              historyOnly: [
                attempt('2026-01-02T12:00:00.000Z', true, { solveDurationMs: 240_000 }),
              ],
            },
          },
        },
      },
    },
  };

  const observations = collectQuestionDifficultyObservations(progressDb);
  assert.equal(observations.length, 4);
  const byQuestion = Object.fromEntries(observations.map((entry) => [entry.questionId, entry]));
  assert.equal(byQuestion.preferred.solveDurationMs, 60_000);
  assert.equal(byQuestion.preferred.wrongAttempts, 2);
  assert.equal(byQuestion.telemetryOnly.solveDurationMs, 120_000);
  assert.equal(byQuestion.invalidUsesHistory.solveDurationMs, 180_000);
  assert.equal(byQuestion.invalidUsesHistory.wrongAttempts, 1);
  assert.equal(byQuestion.historyOnly.solveDurationMs, 240_000);
});

test('builder returns task/level/question nesting and separates Python normalization', () => {
  const history = (duration) => [
    attempt('2026-01-01T10:00:00.000Z', true, { solveDurationMs: duration }),
  ];
  const progressDb = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [`student-${index}`, {
      solvedByTask: {
        1: { basic: { answerHistory: { ordinary: history(10 * 60 * 1000) } } },
        101: { python: { answerHistory: { code: history(10 * 60 * 1000) } } },
      },
    }])
  );

  const index = buildQuestionDifficultyIndex(progressDb);
  const ordinary = getQuestionDifficultyFromIndex(index, 1, 'basic', 'ordinary');
  const python = getQuestionDifficultyFromIndex(index, 101, 'python', 'code');

  assert.equal(ordinary.sampleSize, 5);
  assert.equal(ordinary.provisional, false);
  assert.equal(ordinary.score, 30);
  assert.equal(ordinary.type, 'standard');
  assert.equal(python.score, 10);
  assert.equal(python.type, 'python');
  assert.equal(python.timeCapMs, 60 * 60 * 1000);
});

test('provisional entries can be omitted and malformed database values are harmless', () => {
  const progressDb = {
    one: {
      solvedByTask: {
        2: {
          advanced: {
            answerHistory: {
              q: [attempt('2026-01-01T10:00:00.000Z', true, { solveDurationMs: 5000 })],
              broken: 'not-an-array',
            },
          },
        },
      },
    },
    malformed: null,
  };

  assert.deepEqual(buildQuestionDifficultyIndex(progressDb, { includeProvisional: false }), {});
  assert.deepEqual(buildQuestionDifficultyIndex(null), {});
  assert.equal(getQuestionDifficultyFromIndex({}, '__proto__', 'x', 'y'), null);
});
