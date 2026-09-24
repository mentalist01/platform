import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduleSyncChannel } from './scheduleSyncChannel.js';

const fixture = () => {
  const sources = [];
  let key = 'session-a';
  const subscribe = createScheduleSyncChannel({
    getConnection: () => ({ key, url: '/schedule-stream' }),
    createSource: () => {
      const source = new EventTarget();
      source.closed = false;
      source.close = () => { source.closed = true; };
      sources.push(source);
      return source;
    },
  });
  return { subscribe, sources, setKey: (value) => { key = value; } };
};

test('calendar, lesson alarm, schedule and reschedule inbox share one connection', () => {
  const { subscribe, sources } = fixture();
  const received = [0, 0, 0, 0];
  const cleanup = received.map((_, i) => subscribe(() => { received[i]++; }));
  assert.equal(sources.length, 1);
  sources[0].dispatchEvent(new Event('schedule-sync'));
  assert.deepEqual(received, [1, 1, 1, 1]);
  cleanup[0]();
  cleanup[0]();
  assert.equal(sources[0].closed, false);
  sources[0].dispatchEvent(new Event('schedule-sync'));
  assert.deepEqual(received, [1, 2, 2, 2]);
  cleanup.slice(1).forEach(stop => stop());
  assert.equal(sources[0].closed, true);
});

test('closing and reopening a view creates a fresh connection after final cleanup', () => {
  const { subscribe, sources } = fixture();
  const stop = subscribe(() => {});
  stop();
  const stopNew = subscribe(() => {});
  stop();
  assert.equal(sources.length, 2);
  assert.equal(sources[1].closed, false);
  stopNew();
  assert.equal(sources[1].closed, true);
});

test('sessions do not share events or close each other’s connection', () => {
  const { subscribe, sources, setKey } = fixture();
  let oldCalls = 0;
  let newCalls = 0;
  const stopOld = subscribe(() => { oldCalls++; });
  setKey('session-b');
  const stopNew = subscribe(() => { newCalls++; });
  sources[1].dispatchEvent(new Event('schedule-sync'));
  assert.equal(oldCalls, 0);
  assert.equal(newCalls, 1);
  stopOld();
  assert.equal(sources[1].closed, false);
  stopNew();
});

test('identical callbacks can unsubscribe independently', () => {
  const { subscribe, sources } = fixture();
  let calls = 0;
  const listener = () => { calls++; };
  const stopFirst = subscribe(listener);
  const stopSecond = subscribe(listener);
  stopFirst();
  sources[0].dispatchEvent(new Event('schedule-sync'));
  assert.equal(calls, 1);
  stopSecond();
});

test('browsers without EventSource can keep using existing polling', () => {
  const subscribe = createScheduleSyncChannel({
    getConnection: () => ({ key: 'session', url: '/schedule-stream' }),
    createSource: () => null,
  });
  assert.doesNotThrow(() => subscribe(() => {})());
});
