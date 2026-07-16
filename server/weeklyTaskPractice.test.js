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
