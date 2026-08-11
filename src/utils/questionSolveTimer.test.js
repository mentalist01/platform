import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ActiveQuestionSolveTimer,
  buildQuestionSolveTimerStorageKey,
  clearQuestionSolveTimerState,
  getLatestUnsolvedDurationMs,
  readQuestionSolveTimerState,
} from './questionSolveTimer.js';

const createMemoryStorage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    has: (key) => entries.has(key),
  };
};

test('active question timer accumulates visible time per question', () => {
  let now = 0;
  const timer = new ActiveQuestionSolveTimer({ now: () => now });
  timer.activate('q1', 2000);
  now = 3000;
  assert.equal(timer.getElapsedMs(), 5000);

  timer.setEnvironmentActive(false);
  now = 9000;
  assert.equal(timer.getElapsedMs(), 5000);

  timer.setEnvironmentActive(true);
  now = 11000;
  timer.activate('q2');
  now = 12000;
  assert.equal(timer.getElapsedMs('q1'), 7000);
  assert.equal(timer.getElapsedMs('q2'), 1000);
});

test('timer keeps the greatest persisted baseline without double counting', () => {
  let now = 100;
  const timer = new ActiveQuestionSolveTimer({ now: () => now });
  timer.activate('q1');
  now = 1100;
  timer.activate('q1', 5000);
  now = 2100;
  assert.equal(timer.getElapsedMs(), 6000);
});

test('late history baseline is added without losing time accrued while history loaded', () => {
  let now = 0;
  const timer = new ActiveQuestionSolveTimer({ now: () => now });
  timer.activate('q1');
  now = 5000;
  timer.activate('q1', 10000, { baselineMode: 'late' });
  assert.equal(timer.getElapsedMs(), 15000);

  now = 8000;
  timer.acknowledgeBaseline(18000);
  now = 10000;
  timer.activate('q1', 18000, { baselineMode: 'late' });
  assert.equal(timer.getElapsedMs(), 20000);
});

test('elapsed and acknowledged baseline survive timer recreation in local storage', () => {
  const storage = createMemoryStorage();
  const storageKey = buildQuestionSolveTimerStorageKey({
    studentId: 'student:1',
    taskNumber: 7,
    levelId: 'advanced',
    questionId: 'q/2',
  });
  let now = 0;
  const first = new ActiveQuestionSolveTimer({ now: () => now, storage });
  first.activate(storageKey, 2000);
  now = 3000;
  first.acknowledgeBaseline(5000);
  first.checkpoint();

  assert.match(storageKey, /student%3A1/);
  assert.deepEqual(readQuestionSolveTimerState(storageKey, { storage }), {
    elapsedMs: 5000,
    baselineMs: 5000,
  });

  const second = new ActiveQuestionSolveTimer({ now: () => now, storage });
  second.activate(storageKey, 5000);
  now = 4000;
  assert.equal(second.getElapsedMs(), 6000);
  second.clear(storageKey);
  assert.equal(storage.has(storageKey), false);
  assert.deepEqual(readQuestionSolveTimerState(storageKey, { storage }), {
    elapsedMs: 0,
    baselineMs: 0,
  });
});

test('pause, environment activity and page checkpoints never count inactive time', () => {
  let now = 0;
  const timer = new ActiveQuestionSolveTimer({ now: () => now });
  timer.activate('q1');
  now = 1000;
  timer.pause();
  now = 5000;
  assert.equal(timer.getElapsedMs(), 1000);
  timer.resume();
  now = 7000;
  timer.setEnvironmentActive(false);
  now = 12000;
  timer.resume();
  assert.equal(timer.getElapsedMs(), 3000);
  timer.setEnvironmentActive(true);
  now = 13000;
  assert.equal(timer.getElapsedMs(), 4000);
});

test('storage helpers tolerate unavailable and corrupt storage', () => {
  const storage = createMemoryStorage();
  storage.setItem('broken', '{');
  assert.deepEqual(readQuestionSolveTimerState('broken', { storage }), {
    elapsedMs: 0,
    baselineMs: 0,
  });
  assert.equal(clearQuestionSolveTimerState('', { storage }), false);
  assert.equal(buildQuestionSolveTimerStorageKey({ taskNumber: 1, levelId: 'x' }), '');
});

test('latest unsolved duration ignores completed histories', () => {
  assert.equal(getLatestUnsolvedDurationMs([
    { correct: false, solveDurationMs: 1000 },
    { correct: false, solveDurationMs: 3500 },
  ]), 3500);
  assert.equal(getLatestUnsolvedDurationMs([
    { correct: false, solveDurationMs: 3500 },
    { correct: true, solveDurationMs: 4000 },
  ]), 0);
});
