import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonAlarmAccountSync } from './lessonAlarmAccountSync.js';

const fixture = () => {
  const socket = new EventTarget();
  socket.readyState = 1;
  socket.sent = [];
  socket.send = data => socket.sent.push(JSON.parse(data));
  socket.receive = data => socket.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(data) }));
  return socket;
};
const state = (stoppedAtMs, requestId) => ({ type: 'lesson-alarm-state', teacherId: 't', alarm: { stoppedAtMs }, requestId });

test('separate browser receives server stop and reconnect restores missed state', async () => {
  const app = createLessonAlarmAccountSync(), browser = createLessonAlarmAccountSync();
  const fromApp = fixture(), fromBrowser = fixture(), stops = [];
  app.attach(fromApp, 't'); browser.attach(fromBrowser, 't');
  browser.subscribe('t', alarm => stops.push(alarm.stoppedAtMs));
  const stopped = app.stop('t', 1000);
  const command = fromApp.sent[0];
  assert.equal(command.type, 'lesson-alarm-stop');
  fromBrowser.receive(state(1000)); fromApp.receive(state(1000, command.requestId));
  assert.deepEqual(await stopped, { stoppedAtMs: 1000 });
  assert.deepEqual(stops, [1000]);
  fromBrowser.dispatchEvent(new Event('close'));
  const restored = fixture(); browser.attach(restored, 't'); restored.receive(state(2000));
  restored.receive(state(1500));
  assert.deepEqual(stops, [1000, 2000]);
});

test('account isolation, timeout and a replaced socket never claim a successful stop', async () => {
  const sync = createLessonAlarmAccountSync({ timeoutMs: 10 }), socket = fixture();
  sync.attach(socket, 't');
  let calls = 0; sync.subscribe('other', () => calls++);
  socket.receive(state(1000));
  assert.equal(calls, 0);
  await assert.rejects(sync.stop('other', 1000), /unavailable/);
  await assert.rejects(sync.stop('t', 1000), /timed out/);
  const closed = sync.stop('t', 1001);
  sync.attach(fixture(), 't');
  await assert.rejects(closed, /closed/);
});

test('server rejection falls back to HTTP and late subscribers receive latest state', async () => {
  const sync = createLessonAlarmAccountSync(), socket = fixture(); sync.attach(socket, 't');
  const stopped = sync.stop('t', 1000);
  socket.receive({ ...state(0, socket.sent[0].requestId), alarm: null, error: 'Save failed' });
  await assert.rejects(stopped, /Save failed/);
  socket.receive(state(1000));
  const seen = []; const off = sync.subscribe('t', alarm => seen.push(alarm.stoppedAtMs));
  off(); socket.receive(state(2000));
  assert.deepEqual(seen, [1000]);
});
