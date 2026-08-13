import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUESTION_SOLVE_IDLE_TIMEOUT_MS,
  isQuestionSolveEnvironmentActive,
  subscribeQuestionSolveEnvironment,
} from './useQuestionSolveTimer.js';

test('environment state requires both visibility and document focus', () => {
  const documentObject = {
    visibilityState: 'visible',
    hasFocus: () => true,
  };
  assert.equal(isQuestionSolveEnvironmentActive({ documentObject }), true);
  documentObject.visibilityState = 'hidden';
  assert.equal(isQuestionSolveEnvironmentActive({ documentObject }), false);
  documentObject.visibilityState = 'visible';
  documentObject.hasFocus = () => false;
  assert.equal(isQuestionSolveEnvironmentActive({ documentObject }), false);
  assert.equal(isQuestionSolveEnvironmentActive({ documentObject: null }), true);
});

test('environment subscription handles visibility, focus, blur and page lifecycle', () => {
  const documentObject = new EventTarget();
  const windowObject = new EventTarget();
  let focused = true;
  Object.defineProperties(documentObject, {
    visibilityState: { value: 'visible', writable: true },
    hasFocus: { value: () => focused },
  });
  const states = [];
  const unsubscribe = subscribeQuestionSolveEnvironment(
    (active) => states.push(active),
    { documentObject, windowObject }
  );

  windowObject.dispatchEvent(new Event('blur'));
  focused = false;
  windowObject.dispatchEvent(new Event('focus'));
  focused = true;
  windowObject.dispatchEvent(new Event('focus'));
  documentObject.visibilityState = 'hidden';
  documentObject.dispatchEvent(new Event('visibilitychange'));
  documentObject.visibilityState = 'visible';
  windowObject.dispatchEvent(new Event('pagehide'));
  windowObject.dispatchEvent(new Event('pageshow'));

  assert.deepEqual(states, [false, false, true, false, false, true]);
  unsubscribe();
  windowObject.dispatchEvent(new Event('blur'));
  assert.equal(states.length, 6);
});

test('environment subscription pauses after twenty minutes of inactivity and resumes on activity', () => {
  const documentObject = new EventTarget();
  const windowObject = new EventTarget();
  Object.defineProperties(documentObject, {
    visibilityState: { value: 'visible', writable: true },
    hasFocus: { value: () => true },
  });
  const states = [];
  const scheduledDelays = [];
  let idleCallback = null;
  const unsubscribe = subscribeQuestionSolveEnvironment(
    (active) => states.push(active),
    {
      documentObject,
      windowObject,
      setTimeoutFn: (callback, delay) => {
        idleCallback = callback;
        scheduledDelays.push(delay);
        return scheduledDelays.length;
      },
      clearTimeoutFn: () => {},
    }
  );

  assert.equal(scheduledDelays[0], QUESTION_SOLVE_IDLE_TIMEOUT_MS);
  idleCallback();
  assert.deepEqual(states, [false]);

  documentObject.dispatchEvent(new Event('keydown'));
  assert.deepEqual(states, [false, true]);
  assert.equal(scheduledDelays.at(-1), 20 * 60 * 1000);

  unsubscribe();
  documentObject.dispatchEvent(new Event('pointerdown'));
  assert.equal(states.length, 2);
});
