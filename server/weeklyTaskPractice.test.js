import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWeeklyTaskPracticeMilestones,
  buildWeeklyTaskPracticeStats,
  getWeeklyTaskPracticeIndicator,
  getWeeklyTaskPracticeStats,
} from '../src/utils/weeklyTaskPractice.js';

const REFERENCE_DATE = new Date('2026-07-16T12:00:00.000Z');

const makeEvent = (
  questionId,
  day = '2026-07-16',
  levelId = 'basic',
  extra = {}
) => ({
  taskNumber: 1,
  levelId,
  questionId,
  solvedAt: `${day}T09:00:00.000Z`,
  localDay: day,
  ...extra,
});

const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00.000Z`) / (24 * 60 * 60 * 1000));

const makeAnswerHistory = (results, day = '2026-07-16') => ({
  1: {
    basic: {
      answerHistory: Object.fromEntries(results.map((correct, index) => [
        `review-${index}`,
        [{
          id: `review-${index}-attempt`,
          submittedAt: `${day}T0${index}:00:00.000Z`,
          localDay: day,
          correct,
          answers: [correct ? '1' : '0'],
        }],
      ])),
    },
  },
});

const evaluate = (studentData, availableQuestionCount = 50) => {
  const statsByTask = buildWeeklyTaskPracticeStats(studentData, {
    referenceDate: REFERENCE_DATE,
  });
  const stats = getWeeklyTaskPracticeStats(statsByTask, 1);
  const indicator = getWeeklyTaskPracticeIndicator(stats, {
    progress: studentData?.progress?.['1'] || 0,
    availableQuestionCount,
  });
  return { statsByTask, stats, indicator };
};

test('a new topic needs ten different first solutions in seven days', () => {
  const nine = evaluate({
    solvedEvents: Array.from({ length: 9 }, (_, index) => makeEvent(`new-${index}`)),
  });
  assert.equal(nine.indicator.target, 10);
  assert.equal(nine.indicator.phase, 'initial');
  assert.equal(nine.indicator.key, 'building-high');

  const ten = evaluate({
    solvedEvents: Array.from({ length: 10 }, (_, index) => makeEvent(`new-${index}`)),
  });
  assert.equal(ten.indicator.target, 10);
  assert.equal(ten.indicator.phase, 'initial');
  assert.equal(ten.indicator.key, 'current');
  assert.ok(ten.stats.initialQualifiedAt);

  const milestones = buildWeeklyTaskPracticeMilestones(ten.statsByTask);
  const persisted = evaluate({
    solvedEvents: Array.from({ length: 10 }, (_, index) => makeEvent(`new-${index}`)),
    weeklyTaskPracticeMilestones: milestones,
  });
  assert.equal(persisted.indicator.target, 10);
  assert.equal(persisted.indicator.phase, 'initial');
  assert.equal(persisted.indicator.key, 'current');
});

test('an established topic needs five different first solutions to refresh', () => {
  const initial = Array.from(
    { length: 10 },
    (_, index) => makeEvent(`initial-${index}`, '2026-05-01')
  );
  const four = evaluate({
    solvedEvents: [
      ...initial,
      ...Array.from({ length: 4 }, (_, index) => makeEvent(`refresh-${index}`)),
    ],
  });
  assert.equal(four.indicator.target, 5);
  assert.equal(four.indicator.phase, 'refresh');
  assert.equal(four.indicator.currentCount, 4);
  assert.equal(four.indicator.key, 'building-high');

  const five = evaluate({
    solvedEvents: [
      ...initial,
      ...Array.from({ length: 5 }, (_, index) => makeEvent(`refresh-${index}`)),
    ],
  });
  assert.equal(five.indicator.target, 5);
  assert.equal(five.indicator.key, 'current');
  assert.match(five.stats.qualifiedAt, /^2026-07-16/);
});

test('a progress-only legacy topic stays on five after its first tracked solution', () => {
  const before = evaluate({
    progress: { 1: 35 },
    solvedByTask: {},
    solvedEvents: [],
  });
  const milestones = buildWeeklyTaskPracticeMilestones(before.statsByTask);
  assert.equal(milestones['1'].tracked, true);
  assert.equal(milestones['1'].established, true);
  assert.equal(milestones['1'].legacy, true);

  const after = evaluate({
    progress: { 1: 36 },
    solvedByTask: {
      1: { basic: { solved: ['tracked-first'] } },
    },
    solvedEvents: [makeEvent('tracked-first')],
    weeklyTaskPracticeMilestones: milestones,
  });
  assert.equal(after.indicator.target, 5);
  assert.equal(after.indicator.currentCount, 1);
  assert.equal(after.indicator.key, 'building-low');
});

test('a partially started new topic stays initial after its events are trimmed', () => {
  const started = evaluate({
    progress: { 1: 5 },
    solvedByTask: {
      1: { basic: { solved: ['partial-first'] } },
    },
    solvedEvents: [makeEvent('partial-first')],
  });
  const milestones = buildWeeklyTaskPracticeMilestones(started.statsByTask);
  assert.equal(milestones['1'].tracked, true);
  assert.equal(milestones['1'].established, false);

  const trimmed = evaluate({
    progress: { 1: 5 },
    solvedByTask: {
      1: { basic: { solved: ['partial-first'] } },
    },
    solvedEvents: [],
    weeklyTaskPracticeMilestones: milestones,
  });
  assert.equal(trimmed.stats.hasLegacyPractice, false);
  assert.equal(trimmed.stats.hasEstablishedPractice, false);
  assert.equal(trimmed.indicator.target, 10);
  assert.equal(trimmed.indicator.key, 'below');
});

test('persisted qualification survives solved-event history trimming', () => {
  const completed = evaluate({
    solvedEvents: Array.from(
      { length: 10 },
      (_, index) => makeEvent(`persist-${index}`, '2026-05-01')
    ),
  });
  const milestones = buildWeeklyTaskPracticeMilestones(completed.statsByTask);
  assert.ok(milestones['1'].qualifiedAt);

  const trimmed = evaluate({
    solvedEvents: [],
    solvedByTask: {},
    weeklyTaskPracticeMilestones: milestones,
  });
  assert.equal(trimmed.stats.hasEstablishedPractice, true);
  assert.equal(trimmed.indicator.target, 5);
  assert.equal(trimmed.indicator.key, 'stale');
});

test('persisted local qualification day controls freshness across time zones', () => {
  const qualifiedDay = Math.floor(Date.UTC(2026, 5, 16) / (24 * 60 * 60 * 1000));
  const withCrossMidnightIso = evaluate({
    weeklyTaskPracticeMilestones: {
      1: {
        tracked: true,
        established: true,
        qualifiedAt: '2026-06-17T00:30:00.000Z',
        qualifiedDay,
      },
    },
  });
  assert.equal(withCrossMidnightIso.stats.qualifiedDay, qualifiedDay);
  assert.equal(withCrossMidnightIso.indicator.key, 'due');

  const keyedReference = buildWeeklyTaskPracticeStats({}, {
    referenceDate: new Date('2026-07-17T02:00:00.000Z'),
    referenceDayKey: '2026-07-16',
  });
  assert.equal(keyedReference.__meta.referenceDay, Math.floor(Date.UTC(2026, 6, 16) / (24 * 60 * 60 * 1000)));
});

test('duplicates and mock-exam answers do not count, and an impossible norm is hidden', () => {
  const duplicate = evaluate({
    solvedEvents: [
      makeEvent('same', '2026-07-10'),
      makeEvent('same'),
      makeEvent('same', '2026-07-16', 'advanced'),
      makeEvent('mock', '2026-07-16', 'basic', { source: 'mock-exam' }),
    ],
  });
  assert.equal(duplicate.stats.recordedSolutionCount, 2);
  assert.equal(duplicate.stats.currentCount, 2);

  const solvedEvents = Array.from(
    { length: 8 },
    (_, index) => makeEvent(`limited-${index}`, '2026-05-01')
  );
  const impossible = evaluate({
    solvedEvents,
    solvedByTask: {
      1: { basic: { solved: solvedEvents.map((event) => event.questionId) } },
    },
  }, 10);
  assert.equal(impossible.indicator.target, 10);
  assert.equal(impossible.indicator.key, 'unavailable');
});

test('strong reviews grow the SRS interval from 30 to 60, 90 and 120 days', () => {
  let milestones = {
    1: {
      tracked: true,
      established: true,
      initialQualifiedAt: '2026-06-16T09:00:00.000Z',
      initialQualifiedDay: dayNumber('2026-06-16'),
      qualifiedAt: '2026-06-16T09:00:00.000Z',
      qualifiedDay: dayNumber('2026-06-16'),
      srsLevel: 0,
      intervalDays: 30,
      nextDueDay: dayNumber('2026-07-16'),
    },
  };

  const review = (day) => {
    const statsByTask = buildWeeklyTaskPracticeStats({
      solvedByTask: makeAnswerHistory([true, true, true, true, true], day),
      weeklyTaskPracticeMilestones: milestones,
    }, { referenceDate: new Date(`${day}T12:00:00.000Z`), referenceDayKey: day });
    milestones = buildWeeklyTaskPracticeMilestones(statsByTask, milestones);
    return milestones['1'];
  };

  assert.equal(review('2026-07-16').intervalDays, 60);
  assert.equal(review('2026-09-14').intervalDays, 90);
  assert.equal(review('2026-12-13').intervalDays, 120);
  assert.equal(review('2027-04-12').intervalDays, 120);
});

test('medium review keeps the interval and weak review schedules 14-day recovery', () => {
  const base = {
    1: {
      tracked: true,
      established: true,
      initialQualifiedAt: '2026-04-17T09:00:00.000Z',
      initialQualifiedDay: dayNumber('2026-04-17'),
      qualifiedAt: '2026-04-17T09:00:00.000Z',
      qualifiedDay: dayNumber('2026-04-17'),
      srsLevel: 1,
      intervalDays: 60,
      nextDueDay: dayNumber('2026-06-16'),
    },
  };
  const evaluateReview = (results) => {
    const statsByTask = buildWeeklyTaskPracticeStats({
      solvedByTask: makeAnswerHistory(results),
      weeklyTaskPracticeMilestones: base,
    }, { referenceDate: REFERENCE_DATE, referenceDayKey: '2026-07-16' });
    return buildWeeklyTaskPracticeMilestones(statsByTask, base)['1'];
  };

  const medium = evaluateReview([true, true, true, false, false]);
  assert.equal(medium.lastReviewRating, 'medium');
  assert.equal(medium.intervalDays, 60);

  const weak = evaluateReview([true, true, false, false, false]);
  assert.equal(weak.lastReviewRating, 'weak');
  assert.equal(weak.srsLevel, 0);
  assert.equal(weak.intervalDays, 14);
  assert.equal(weak.nextDueDay - weak.qualifiedDay, 14);
});

test('review score uses the first attempt for each question inside the active seven-day window', () => {
  const base = {
    1: {
      tracked: true,
      established: true,
      initialQualifiedAt: '2026-06-01T09:00:00.000Z',
      initialQualifiedDay: dayNumber('2026-06-01'),
      qualifiedAt: '2026-06-01T09:00:00.000Z',
      qualifiedDay: dayNumber('2026-06-01'),
      srsLevel: 0,
      intervalDays: 30,
      nextDueDay: dayNumber('2026-07-01'),
    },
  };
  const answerHistory = makeAnswerHistory([true, true, true, false], '2026-07-08');
  answerHistory[1].basic.answerHistory['review-window-reset'] = [
    {
      id: 'expired-wrong-attempt',
      submittedAt: '2026-07-01T08:00:00.000Z',
      localDay: '2026-07-01',
      correct: false,
      answers: ['0'],
    },
    {
      id: 'current-correct-attempt',
      submittedAt: '2026-07-08T08:00:00.000Z',
      localDay: '2026-07-08',
      correct: true,
      answers: ['1'],
    },
  ];
  const statsByTask = buildWeeklyTaskPracticeStats({
    solvedByTask: answerHistory,
    weeklyTaskPracticeMilestones: base,
  }, {
    referenceDate: new Date('2026-07-08T12:00:00.000Z'),
    referenceDayKey: '2026-07-08',
  });
  const milestone = buildWeeklyTaskPracticeMilestones(statsByTask, base)['1'];

  assert.equal(milestone.lastReviewScore, 4);
  assert.equal(milestone.lastReviewRating, 'strong');
});
