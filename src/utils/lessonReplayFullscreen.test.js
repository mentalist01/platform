import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLessonReplayFullscreenController,
  REPLAY_FULLSCREEN_TIMEOUT_MS,
} from './lessonReplayFullscreen.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const fixture = ({ legacy = false, unsupported = false } = {}) => {
  const doc = new EventTarget();
  doc.defaultView = new EventTarget();
  const modes = [];
  const timers = new Map();
  const requests = [];
  const element = { contains: () => false };
  let exits = 0;
  let timerId = 0;
  const grant = (event = true) => {
    doc[legacy ? 'webkitFullscreenElement' : 'fullscreenElement'] = element;
    if (event) doc.dispatchEvent(new Event(legacy ? 'webkitfullscreenchange' : 'fullscreenchange'));
  };
  const leave = (event = true) => {
    doc.fullscreenElement = null;
    doc.webkitFullscreenElement = null;
    if (event) doc.dispatchEvent(new Event(legacy ? 'webkitfullscreenchange' : 'fullscreenchange'));
  };
  doc[legacy ? 'webkitExitFullscreen' : 'exitFullscreen'] = () => {
    exits += 1;
    leave();
    return legacy ? undefined : Promise.resolve();
  };
  if (!unsupported) {
    element[legacy ? 'webkitRequestFullscreen' : 'requestFullscreen'] = () => {
      const request = deferred();
      requests.push(request);
      return legacy ? undefined : request.promise;
    };
  }
  const controller = createLessonReplayFullscreenController({
    element,
    document: doc,
    onModeChange: (mode) => modes.push(mode),
    schedule: (callback, delay) => {
      assert.equal(delay, REPLAY_FULLSCREEN_TIMEOUT_MS);
      timers.set(++timerId, callback);
      return timerId;
    },
    cancel: (id) => timers.delete(id),
  });
  return {
    controller, doc, element, modes, requests, timers, grant, leave,
    get exits() { return exits; },
    timeout: () => { for (const callback of [...timers.values()]) callback(); },
  };
};

test('copy and fullscreen stay pending together until native entry is confirmed', async () => {
  const f = fixture();
  f.controller.toggle();
  assert.deepEqual(f.modes, ['pending']);
  f.grant();
  assert.deepEqual(f.modes, ['pending', 'native']);
  f.requests[0].resolve();
  await settle();
  assert.deepEqual(f.modes, ['pending', 'native']);
  assert.equal(f.timers.size, 0);
  f.controller.dispose();
});

test('resolved request reconciles native state even without fullscreenchange', async () => {
  const f = fixture();
  f.controller.toggle();
  f.grant(false);
  f.requests[0].resolve();
  await settle();
  assert.equal(f.modes.at(-1), 'native');
  f.controller.dispose();
});

test('resolved request without actual fullscreen opens viewport fallback', async () => {
  const f = fixture();
  f.controller.toggle();
  f.requests[0].resolve();
  await settle();
  assert.deepEqual(f.modes, ['pending', 'fallback']);
  f.controller.dispose();
});

test('rejection, throwing request, missing API and error event all use fallback', async () => {
  for (const failure of ['rejected', 'throwing', 'unsupported', 'event']) {
    const f = fixture({ unsupported: failure === 'unsupported' });
    if (failure === 'throwing') f.element.requestFullscreen = () => { throw new Error('Denied'); };
    f.controller.toggle();
    if (failure === 'rejected') f.requests[0].reject(new Error('Denied'));
    if (failure === 'event') f.doc.dispatchEvent(new Event('fullscreenerror'));
    await settle();
    assert.deepEqual(f.modes, ['pending', 'fallback'], failure);
    assert.equal(f.timers.size, 0);
    f.controller.dispose();
  }
});

test('hanging request enters fallback and can still upgrade on late native entry', async () => {
  const f = fixture();
  f.controller.toggle();
  f.timeout();
  assert.deepEqual(f.modes, ['pending', 'fallback']);
  f.grant();
  f.requests[0].resolve();
  await settle();
  assert.deepEqual(f.modes, ['pending', 'fallback', 'native']);
  f.controller.dispose();
});

test('legacy WebKit waits for its event or timeout rather than assuming success', () => {
  for (const eventArrives of [true, false]) {
    const f = fixture({ legacy: true });
    f.controller.toggle();
    assert.deepEqual(f.modes, ['pending']);
    if (eventArrives) f.grant(); else f.timeout();
    assert.equal(f.modes.at(-1), eventArrives ? 'native' : 'fallback');
    f.controller.close();
    assert.equal(f.modes.at(-1), 'inline');
    f.controller.dispose();
  }
});

test('cancel by second click or Escape prevents a delayed request reopening the copy', async () => {
  for (const cancel of ['toggle', 'close']) {
    const f = fixture();
    f.controller.toggle();
    f.controller[cancel]();
    assert.deepEqual(f.modes, ['pending', 'inline']);
    f.grant();
    f.requests[0].resolve();
    await settle();
    assert.deepEqual(f.modes, ['pending', 'inline']);
    assert.equal(f.doc.fullscreenElement, null);
    assert.equal(f.exits, 1);
    assert.equal(f.timers.size, 0);
    f.controller.dispose();
  }
});

test('native Escape closes copy and late request completion cannot reopen it', async () => {
  const f = fixture();
  f.controller.toggle();
  f.grant();
  f.leave();
  f.requests[0].resolve();
  await settle();
  assert.deepEqual(f.modes, ['pending', 'native', 'inline']);
  f.controller.dispose();
});

test('resize or focus reconciles native exit when the browser omits fullscreenchange', async () => {
  for (const event of ['resize', 'focus', 'visibilitychange']) {
    const f = fixture();
    f.controller.toggle();
    f.grant();
    f.requests[0].resolve();
    await settle();
    f.leave(false);
    (event === 'visibilitychange' ? f.doc : f.doc.defaultView).dispatchEvent(new Event(event));
    assert.deepEqual(f.modes, ['pending', 'native', 'inline']);
    f.controller.dispose();
  }
});

test('stale rejection does not put a newer pending request into fallback', async () => {
  const f = fixture();
  f.controller.toggle();
  f.controller.close();
  f.controller.toggle();
  f.requests[0].reject(new Error('Old request'));
  await settle();
  assert.deepEqual(f.modes, ['pending', 'inline', 'pending']);
  f.grant();
  f.requests[1].resolve();
  await settle();
  assert.equal(f.modes.at(-1), 'native');
  f.controller.dispose();
});

test('closing fallback also cancels late native completion', async () => {
  const f = fixture();
  f.controller.toggle();
  f.timeout();
  f.controller.close();
  f.grant(false);
  f.requests[0].resolve();
  await settle();
  assert.deepEqual(f.modes, ['pending', 'fallback', 'inline']);
  assert.equal(f.doc.fullscreenElement, null);
  f.controller.dispose();
});

test('closing native fullscreen works without an exit event and tolerates rejected exit', async () => {
  for (const rejectExit of [false, true]) {
    const f = fixture();
    f.controller.toggle();
    f.grant();
    f.requests[0].resolve();
    await settle();
    f.doc.exitFullscreen = () => {
      if (rejectExit) return Promise.reject(new Error('Cannot exit'));
      f.leave(false);
      return Promise.resolve();
    };
    f.controller.close();
    await settle();
    assert.equal(f.modes.at(-1), rejectExit ? 'native' : 'inline');
    f.controller.dispose();
  }
});

test('another element fullscreen is exited before requesting the player', async () => {
  const f = fixture();
  f.doc.fullscreenElement = {};
  f.controller.toggle();
  await settle();
  assert.equal(f.exits, 1);
  assert.equal(f.requests.length, 1);
  f.grant();
  f.requests[0].resolve();
  await settle();
  assert.equal(f.modes.at(-1), 'native');
  f.controller.dispose();
});

test('repeated native/fallback opens and closes leave no pending timers', async () => {
  const f = fixture();
  for (let cycle = 0; cycle < 6; cycle += 1) {
    f.controller.toggle();
    if (cycle % 2) f.timeout(); else f.grant();
    f.requests.at(-1).resolve();
    await settle();
    f.controller.toggle();
    await settle();
    assert.equal(f.modes.at(-1), 'inline');
    assert.equal(f.doc.fullscreenElement || null, null);
    assert.equal(f.timers.size, 0);
  }
  f.controller.dispose();
});

test('unmount clears pending timers and late native completion without state updates', async () => {
  const f = fixture();
  f.controller.toggle();
  f.controller.dispose();
  assert.equal(f.timers.size, 0);
  f.grant();
  f.requests[0].resolve();
  await settle();
  assert.deepEqual(f.modes, ['pending']);
  assert.equal(f.doc.fullscreenElement, null);
  f.controller.toggle();
  assert.equal(f.requests.length, 1);
});
