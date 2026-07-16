import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOCK_EXAM_MODE_CLASSIC,
  MOCK_EXAM_MODE_TIMER,
  getMockExamRequiredMode,
  normalizeAssignedMockExamMode,
  resolveMockExamAttemptMode,
} from '../src/utils/mockExamMode.js';

test('an assignment without an explicit mode defaults to timer', () => {
  assert.equal(normalizeAssignedMockExamMode(undefined), MOCK_EXAM_MODE_TIMER);
  assert.equal(getMockExamRequiredMode({ access: { all: true } }), MOCK_EXAM_MODE_TIMER);
});

test('an explicitly assigned classic mode is preserved', () => {
  assert.equal(
    getMockExamRequiredMode({ access: { mode: MOCK_EXAM_MODE_CLASSIC } }),
    MOCK_EXAM_MODE_CLASSIC
  );
});

test('an unstarted attempt must use the teacher assigned mode', () => {
  const resolved = resolveMockExamAttemptMode({
    assignedMode: MOCK_EXAM_MODE_TIMER,
    requestedMode: MOCK_EXAM_MODE_CLASSIC,
    storedMode: MOCK_EXAM_MODE_CLASSIC,
    locked: false,
  });

  assert.equal(resolved.mode, MOCK_EXAM_MODE_TIMER);
  assert.equal(resolved.requestAllowed, false);
});

test('the server can choose the assigned mode when the client omits it', () => {
  const resolved = resolveMockExamAttemptMode({
    assignedMode: MOCK_EXAM_MODE_TIMER,
    requestedMode: undefined,
    storedMode: MOCK_EXAM_MODE_CLASSIC,
    locked: false,
  });

  assert.equal(resolved.mode, MOCK_EXAM_MODE_TIMER);
  assert.equal(resolved.requestAllowed, true);
});

test('an unstarted classic assignment accepts only classic mode', () => {
  const classic = resolveMockExamAttemptMode({
    assignedMode: MOCK_EXAM_MODE_CLASSIC,
    requestedMode: MOCK_EXAM_MODE_CLASSIC,
    locked: false,
  });
  const timer = resolveMockExamAttemptMode({
    assignedMode: MOCK_EXAM_MODE_CLASSIC,
    requestedMode: MOCK_EXAM_MODE_TIMER,
    locked: false,
  });

  assert.equal(classic.mode, MOCK_EXAM_MODE_CLASSIC);
  assert.equal(classic.requestAllowed, true);
  assert.equal(timer.requestAllowed, false);
});

test('a locked legacy classic attempt keeps its mode', () => {
  const resolved = resolveMockExamAttemptMode({
    assignedMode: MOCK_EXAM_MODE_TIMER,
    requestedMode: MOCK_EXAM_MODE_CLASSIC,
    storedMode: MOCK_EXAM_MODE_CLASSIC,
    locked: true,
  });

  assert.equal(resolved.mode, MOCK_EXAM_MODE_CLASSIC);
  assert.equal(resolved.requestAllowed, true);
});

test('a locked legacy attempt can be resumed without resending its mode', () => {
  const resolved = resolveMockExamAttemptMode({
    assignedMode: MOCK_EXAM_MODE_TIMER,
    requestedMode: undefined,
    storedMode: MOCK_EXAM_MODE_CLASSIC,
    locked: true,
  });

  assert.equal(resolved.mode, MOCK_EXAM_MODE_CLASSIC);
  assert.equal(resolved.requestAllowed, true);
});

test('an invalid explicit requested mode is rejected', () => {
  const resolved = resolveMockExamAttemptMode({
    assignedMode: MOCK_EXAM_MODE_TIMER,
    requestedMode: 'anything',
    locked: false,
  });

  assert.equal(resolved.requestedModeIsValid, false);
  assert.equal(resolved.requestAllowed, false);
});
