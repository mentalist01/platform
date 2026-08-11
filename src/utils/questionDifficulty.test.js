import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PYTHON_QUESTION_TIME_CAP_MS,
  STANDARD_QUESTION_TIME_CAP_MS,
  calculateQuestionDifficulty,
  calculateRobustMean,
  formatQuestionDifficultyDuration,
  formatQuestionDifficultyTooltip,
  getQuestionDifficultyCategory,
  getQuestionDifficultyMeta,
  hasEnoughQuestionDifficultyData,
} from './questionDifficulty.js';

const observation = (activeDurationMs, wrongAttempts = 0) => ({
  activeDurationMs,
  wrongAttempts,
});

test('difficulty uses the documented 60/40 weights and stays inside 0-100', () => {
  const timeOnly = calculateQuestionDifficulty(
    Array.from({ length: 5 }, () => observation(STANDARD_QUESTION_TIME_CAP_MS / 2, 0))
  );
  const attemptsOnly = calculateQuestionDifficulty(
    Array.from({ length: 5 }, () => observation(0, 5))
  );
  const maximum = calculateQuestionDifficulty(
    Array.from({ length: 5 }, () => observation(STANDARD_QUESTION_TIME_CAP_MS, 5))
  );

  assert.equal(timeOnly.score, 30);
  assert.equal(attemptsOnly.score, 40);
  assert.equal(maximum.score, 100);
  assert.equal(maximum.category, 'very_hard');
});

test('Python has a separate 60 minute time cap', () => {
  const observations = Array.from({ length: 5 }, () => observation(30 * 60 * 1000, 0));
  const standard = calculateQuestionDifficulty(observations);
  const python = calculateQuestionDifficulty(observations, { isPython: true });

  assert.equal(standard.timeCapMs, STANDARD_QUESTION_TIME_CAP_MS);
  assert.equal(python.timeCapMs, PYTHON_QUESTION_TIME_CAP_MS);
  assert.equal(standard.score, 60);
  assert.equal(python.score, 30);
  assert.equal(python.type, 'python');
});

test('robust averages and hard caps prevent outliers from dominating', () => {
  const result = calculateQuestionDifficulty([
    observation(5 * 60 * 1000, 0),
    observation(5 * 60 * 1000, 0),
    observation(5 * 60 * 1000, 0),
    observation(5 * 60 * 1000, 0),
    observation(1000 * 60 * 60 * 1000, 100000),
  ]);

  assert.ok(result.averageActiveDurationMs < 7 * 60 * 1000);
  assert.ok(result.averageWrongAttempts < 1);
  assert.ok(result.score < 25);
  assert.equal(calculateRobustMean([10, 10, 10, Number.POSITIVE_INFINITY]), 10);
});

test('invalid observations are ignored and a small sample is marked provisional', () => {
  const result = calculateQuestionDifficulty([
    observation(60 * 1000, 0),
    observation(-1, 0),
    observation(Number.NaN, 1),
    { activeDurationMs: 1000, wrongAttempts: '1' },
    null,
  ]);

  assert.equal(result.sampleSize, 1);
  assert.equal(result.confidence, 0.1);
  assert.equal(result.confidenceLevel, 'low');
  assert.equal(result.provisional, true);
  assert.equal(calculateQuestionDifficulty([]), null);
});

test('student-facing difficulty waits for the configured minimum sample', () => {
  assert.equal(hasEnoughQuestionDifficultyData(undefined, 5), false);
  assert.equal(hasEnoughQuestionDifficultyData({ sampleSize: 0 }, 5), false);
  assert.equal(hasEnoughQuestionDifficultyData({ sampleSize: 4 }, 5), false);
  assert.equal(hasEnoughQuestionDifficultyData({ sampleSize: 5 }, 5), true);
  assert.equal(hasEnoughQuestionDifficultyData({ sampleSize: '5' }, 5), true);
  assert.equal(hasEnoughQuestionDifficultyData({ sampleSize: Number.NaN }, 5), false);
  assert.equal(hasEnoughQuestionDifficultyData({ sampleSize: 1 }), true);
  assert.equal(hasEnoughQuestionDifficultyData(null, 5), false);
});

test('all five categories have stable score boundaries and metadata', () => {
  assert.equal(getQuestionDifficultyCategory(0), 'very_easy');
  assert.equal(getQuestionDifficultyCategory(20), 'easy');
  assert.equal(getQuestionDifficultyCategory(40), 'medium');
  assert.equal(getQuestionDifficultyCategory(60), 'hard');
  assert.equal(getQuestionDifficultyCategory(80), 'very_hard');
  assert.equal(getQuestionDifficultyCategory(1000), 'very_hard');
  assert.equal(getQuestionDifficultyCategory(-1), null);
  assert.equal(getQuestionDifficultyMeta(60).label, 'Сложное');
  assert.equal(getQuestionDifficultyMeta('missing'), null);
});

test('duration and tooltip formatting expose the metric in Russian', () => {
  assert.equal(formatQuestionDifficultyDuration(0), '0 сек');
  assert.equal(formatQuestionDifficultyDuration(90 * 1000), '1 мин 30 сек');
  assert.equal(formatQuestionDifficultyDuration(65 * 60 * 1000), '1 ч 5 мин');
  assert.equal(formatQuestionDifficultyDuration(Number.NaN), '—');

  const tooltip = formatQuestionDifficultyTooltip({
    score: 42,
    category: 'medium',
    averageActiveDurationMs: 90 * 1000,
    averageWrongAttempts: 1.25,
    sampleSize: 3,
    provisional: true,
  });
  assert.match(tooltip, /^Предварительно: Среднее · 42\/100/);
  assert.match(tooltip, /1 мин 30 сек/);
  assert.match(tooltip, /1,3/);
  assert.match(tooltip, /3 ученика$/);
});
