import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPracticeStatsForTests, buildPythonPracticeTargets, getPythonReviewQuestionIndex, getPythonReviewSolvedIds, isPythonReviewDue, pythonReviewDraftKey } from './pythonTaskPractice.js';
import { buildWeeklyTaskPracticeMilestones, getWeeklyTaskPracticeIndicator } from './weeklyTaskPractice.js';
const testsDb = { 103: { python: ['a', 'b', 'c'].map(id => ({ id })) }, 104: { python: Array.from({ length: 15 }, (_, id) => ({ id })) }, 1: { basic: [{ id: 'ordinary' }] } };
const initial = { solvedByTask: { 103: { python: { solved: ['a', 'b', 'c'] } } }, solvedEvents: ['a', 'b', 'c'].map(questionId => ({ taskNumber: 103, levelId: 'python', questionId, solvedAt: '2026-03-01T12:00:00Z', localDay: '2026-03-01' })) };
test('Python norms fit unique available tasks while ordinary and large topics retain existing norms', () => {
  const targets = buildPythonPracticeTargets({ ...testsDb, 105: { python: [{ id: 'a' }, { id: 'a' }] }, 106: { python: [] } });
  assert.deepEqual(targets['103'], { target: 3, refreshTarget: 3 });
  assert.deepEqual(targets['104'], { target: 10, refreshTarget: 5 });
  assert.deepEqual(targets['105'], { target: 1, refreshTarget: 1 });
  assert.equal(targets['1'], undefined); assert.equal(targets['106'], undefined);
  const stats = buildPracticeStatsForTests({ ...initial, progress: { 1: 50 } }, testsDb, { referenceDayKey: '2026-03-01' });
  assert.equal(stats['103'].initialTarget, 3); assert.ok(stats['103'].initialQualifiedAt);
  assert.equal(stats['1'].initialTarget, 10); assert.equal(stats['1'].refreshTarget, 5);
});
for (const [answers, rating, interval] of [[ [true,true,true], 'strong', 60 ], [[true,false,true], 'medium', 30], [[true,false,false], 'weak', 14]]) {
  test(`small Python review evaluates first attempts as ${rating} and persists next interval`, () => {
    const first = buildPracticeStatsForTests(initial, testsDb, { referenceDayKey: '2026-03-01' });
    const milestone = buildWeeklyTaskPracticeMilestones(first);
    const answerHistory = Object.fromEntries(['a','b','c'].map((id,index) => [id, [
      { submittedAt: `2026-04-01T12:0${index}:00Z`, localDay: '2026-04-01', correct: answers[index] },
      { submittedAt: `2026-04-01T12:1${index}:00Z`, localDay: '2026-04-01', correct: true },
    ]]));
    const data = { ...initial, weeklyTaskPracticeMilestones: milestone, solvedByTask: { 103: { python: { solved: ['a','b','c'], answerHistory } } } };
    const review = buildPracticeStatsForTests(data, testsDb, { referenceDayKey: '2026-04-01' });
    assert.equal(review['103'].currentCount, 3); assert.equal(review['103'].pendingReviewRating, rating);
    const saved = buildWeeklyTaskPracticeMilestones(review, milestone);
    assert.equal(saved['103'].intervalDays, interval); assert.equal(saved['103'].reviewCount, 1);
    const reloaded = buildPracticeStatsForTests({ ...data, weeklyTaskPracticeMilestones: saved }, testsDb, { referenceDayKey: '2026-04-01' });
    assert.equal(buildWeeklyTaskPracticeMilestones(reloaded, saved)['103'].reviewCount, 1);
    assert.equal(saved['103'].nextDueDay, review['103'].refreshQualifiedDay + interval);
  });
}
test('review starts with a solved question not yet attempted in this cycle and ignores deleted questions', () => {
  const stats = buildPracticeStatsForTests(initial, testsDb, { referenceDayKey: '2026-04-01' })['103'];
  const data = { solvedByTask: { 103: { python: { solved: ['deleted','b','c'], answerHistory: { b: [{ correct: false, submittedAt: '2026-04-01T10:00:00Z', localDay: '2026-04-01' }] } } } } };
  assert.equal(getPythonReviewQuestionIndex({ task: { number: 103 }, testsDb, studentData: data, stats }), 2);
});
test('review drafts have distinct owners, questions and cycles', () => {
  const values = [{ studentId: 'one', cycle: '30' }, { studentId: 'two', cycle: '30' }, { studentId: 'one', cycle: '60' }].map(args => pythonReviewDraftKey({ ...args, taskNumber: 103, questionId: 'a' }));
  assert.equal(new Set(values).size, 3);
});

test('small learned topics show a due review even when initial and review norms are equal', () => {
  const milestone = buildWeeklyTaskPracticeMilestones(buildPracticeStatsForTests(initial, testsDb, { referenceDayKey: '2026-03-01' }));
  const stats = buildPracticeStatsForTests({ ...initial, weeklyTaskPracticeMilestones: milestone }, testsDb, { referenceDayKey: '2026-04-01' })['103'];
  const indicator = getWeeklyTaskPracticeIndicator(stats, { progress: 100, availableQuestionCount: 3 });
  assert.equal(indicator.phase, 'refresh');
  assert.equal(indicator.key, 'due');
  assert.equal(isPythonReviewDue(indicator), true);
});

test('review progress shows only correct answers inside the current review window', () => {
  const date = new Date('2026-04-01T12:00:00');
  const day = Math.floor(Date.UTC(2026, 3, 1) / 86400000);
  assert.deepEqual([...getPythonReviewSolvedIds({
    old: [{ correct: true, localDay: '2026-03-01' }],
    wrong: [{ correct: false, localDay: '2026-04-01' }],
    retry: [{ correct: false, localDay: '2026-04-01' }, { correct: true, localDay: '2026-04-01' }],
    future: [{ correct: true, localDay: '2026-04-02' }],
  }, String(day - 1), date)], ['retry']);
});

test('old completed Python topics tracked under the ten-task norm can enter review', () => {
  const data = { progress: { 103: 100 }, weeklyTaskPracticeMilestones: { 103: { tracked: true } },
    solvedByTask: initial.solvedByTask,
    solvedEvents: initial.solvedEvents.map((event, index) => ({ ...event, localDay: `2026-03-${String(1 + index * 10).padStart(2, '0')}`, solvedAt: `2026-03-${String(1 + index * 10).padStart(2, '0')}T12:00:00Z` })),
  };
  const stats = buildPracticeStatsForTests(data, testsDb, { referenceDayKey: '2026-05-01' })['103'];
  assert.equal(stats.hasEstablishedPractice, true);
  assert.equal(isPythonReviewDue(getWeeklyTaskPracticeIndicator(stats, { progress: 100, availableQuestionCount: 3 })), true);
  assert.equal(data.weeklyTaskPracticeMilestones['103'].established, undefined, 'reading practice does not mutate student data');
});
