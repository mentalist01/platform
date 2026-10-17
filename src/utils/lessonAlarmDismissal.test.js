import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonAlarmDismissal } from './lessonAlarmDismissal.js';

const NOW = 1_800_000_000_000;
const event = (type, data) => Object.assign(new Event(type), data);
const tabs = ({ blockedStorage = false, broadcast = true } = {}) => {
  const windows = [];
  const stored = new Map();
  const channels = [];
  return {
    create(teacherId = 'teacher-a') {
      const events = new EventTarget();
      windows.push(events);
      const storage = {
        getItem: key => { if (blockedStorage) throw Error('Storage blocked'); return stored.get(key); },
        setItem: (key, value) => {
          if (blockedStorage) throw Error('Storage blocked');
          if (stored.get(key) === value) return;
          stored.set(key, value);
          for (const other of windows) if (other !== events) other.dispatchEvent(event('storage', { key }));
        },
      };
      const channel = broadcast ? new EventTarget() : null;
      if (channel) {
        channel.teacherId = teacherId;
        channel.postMessage = data => {
          for (const other of channels) if (other !== channel && other.teacherId === teacherId) other.dispatchEvent(event('message', { data }));
        };
        channels.push(channel);
      }
      const sound = { playing: true, stops: 0 };
      const control = createLessonAlarmDismissal({
        teacherId, storage, events, channel, now: () => NOW,
        onStop: () => { sound.playing = false; sound.stops++; },
      });
      return { control, sound, channel, storage };
    },
  };
};

test('stop in a tab with no calendar loaded silences other tabs and survives reopening', async () => {
  const browser = tabs();
  const main = browser.create();
  const board = browser.create();
  const otherTeacher = browser.create('teacher-b');
  await main.control.stop();
  assert.equal(main.sound.playing, false);
  assert.equal(board.sound.playing, false);
  assert.equal(otherTeacher.sound.playing, true);
  assert.equal(board.control.isDismissed({ dueMs: NOW - 1000 }), true);
  assert.equal(board.control.isDismissed({ dueMs: NOW + 10_000 }), false);
  const reopened = browser.create();
  assert.equal(reopened.control.isDismissed({ dueMs: NOW }), true);
  assert.equal(reopened.control.isDismissed({ dueMs: NOW + 1 }), false);
});

test('broadcast carries the stop itself when localStorage is unavailable', async () => {
  const browser = tabs({ blockedStorage: true });
  const main = browser.create();
  const board = browser.create();
  await main.control.stop();
  assert.equal(board.sound.playing, false);
  assert.equal(board.control.isDismissed({ dueMs: NOW }), true);
});

test('storage events are sufficient when BroadcastChannel is unavailable', async () => {
  const browser = tabs({ broadcast: false });
  const main = browser.create();
  const board = browser.create();
  await main.control.stop();
  assert.equal(board.sound.playing, false);
  board.control.dispose();
  board.sound.playing = true;
  // A disposed page has no listeners and cannot affect a replacement engine.
  main.storage.setItem('lesson-alarm-v2:stopped:teacher-a', JSON.stringify({ stoppedAtMs: NOW + 1 }));
  assert.equal(board.sound.playing, true);
});

test('account event silences a separate browser and stale HTTP state cannot rearm it', async () => {
  let finishOldRead;
  let stops = 0;
  const board = createLessonAlarmDismissal({
    teacherId: 't', now: () => NOW,
    loadRemote: () => new Promise(resolve => { finishOldRead = resolve; }),
    onStop: () => { stops++; },
  });
  const refresh = board.refresh();
  const message = data => ({ data: JSON.stringify(data) });
  assert.equal(board.receiveEvent(message({ scope: 'lesson-alarm', teacherId: 'other', alarm: { stoppedAtMs: NOW } })), false);
  assert.equal(stops, 0);
  assert.equal(board.receiveEvent(message({ scope: 'lesson-alarm', teacherId: 't', alarm: { stoppedAtMs: NOW } })), true);
  assert.equal(stops, 1);
  finishOldRead({ stoppedAtMs: NOW - 60_000 });
  await refresh;
  assert.equal(board.isDismissed({ dueMs: NOW }), true);
  assert.equal(board.isDismissed({ dueMs: NOW + 1 }), false);
  assert.equal(stops, 1);
});

test('failed server relay still stops local sound and other same-browser tabs', async () => {
  const browser = tabs();
  const board = browser.create();
  const main = browser.create();
  const control = createLessonAlarmDismissal({
    teacherId: 'teacher-a', now: () => NOW, storage: main.storage,
    stopRemote: async () => { throw Error('Offline'); },
  });
  await assert.rejects(control.stop(), /Offline/);
  assert.equal(board.sound.playing, false);
  assert.equal(control.isDismissed({ dueMs: NOW }), true);
});

test('reconnect loads a dismissal missed while a window was suspended', async () => {
  const control = createLessonAlarmDismissal({
    teacherId: 't', now: () => NOW, loadRemote: async () => ({ stoppedAtMs: NOW - 10_000 }),
  });
  await control.refresh();
  assert.equal(control.isDismissed({ dueMs: NOW - 10_000 }), true);
  assert.equal(control.isDismissed({ dueMs: NOW - 9000 }), false);
});
