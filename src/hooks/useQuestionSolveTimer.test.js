import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
