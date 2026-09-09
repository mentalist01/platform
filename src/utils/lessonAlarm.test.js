import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLessonAlarms, createDefaultAlarmBuffer, createLessonAlarmPlayer, getRingingLessonAlarms, LESSON_ALARM_LEAD_MS } from './lessonAlarm.js';
import { buildTeacherCalendarCancellationMarkKey } from './teacherCalendarCancellation.js';

test('alarm fires five minutes before local lesson, not ten', () => {
  const now = new Date(2026, 8, 7, 16, 50).getTime();
  const entry = { id: 'slot', date: '2026-09-07', time: '17:00', studentId: 's', studentName: 'Ученик' };
  const alarms = buildLessonAlarms([entry], 't', {}, now);
  assert.equal(alarms.length, 1);
  assert.equal(alarms[0].dueMs, new Date(2026, 8, 7, 16, 55).getTime());
  assert.equal(alarms[0].startMs - alarms[0].dueMs, LESSON_ALARM_LEAD_MS);
  assert.equal(buildLessonAlarms([entry], 't', {}, new Date(2026, 8, 7, 17).getTime()).length, 0);
});
test('recurring, excluded, cancelled, tomorrow and duplicate group events', () => {
  const now = new Date(2026, 8, 7, 16, 50).getTime();
  const entry = { id: 'slot', weekdayKey: 'mon', time: '17:00', studentId: 's' };
  assert.equal(buildLessonAlarms([entry], 't', {}, now).length, 1);
  assert.equal(buildLessonAlarms([{ ...entry, excludedDates: ['2026-09-07'] }], 't', {}, now).length, 0);
  const marks = { [buildTeacherCalendarCancellationMarkKey('t', entry, '2026-09-07')]: 'cancelled' };
  assert.equal(buildLessonAlarms([entry], 't', marks, now).length, 0);
  assert.equal(buildLessonAlarms([{ ...entry, cancelled: true }], 't', {}, now).length, 0);
  assert.equal(buildLessonAlarms([entry, { ...entry, id: 'other', studentId: 'other' }], 't', {}, now).length, 1);
  assert.equal(buildLessonAlarms([{ ...entry, weekdayKey: 'tue', time: '10:00' }], 't', {}, now).length, 1);
});
test('every tab can identify and dismiss all alarms that are ringing now', () => {
  const alarms = [
    { id: 'first', dueMs: 100, startMs: 500 },
    { id: 'second', dueMs: 200, startMs: 600 },
    { id: 'later', dueMs: 700, startMs: 1000 },
  ];
  assert.deepEqual(getRingingLessonAlarms(alarms, 300).map((alarm) => alarm.id), ['first', 'second']);
  assert.deepEqual(getRingingLessonAlarms(alarms, 600), []);
});
const fakeContext = () => {
  const nodes = [];
  const context = {
    state: 'suspended', currentTime: 100, sampleRate: 8000,
    destination: {},
    resume: async () => { context.state = 'running'; }, close: async () => { context.state = 'closed'; },
    createBuffer: (channels, size) => { const data = new Float32Array(size); return { getChannelData: () => data }; },
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const node = { starts: [], stops: [], connect() {}, disconnect() {}, start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } };
      nodes.push(node); return node;
    },
  };
  return { context, nodes };
};
test('default sound contains audible samples and a quiet gap with bounded amplitude', () => {
  const { context } = fakeContext();
  const data = createDefaultAlarmBuffer(context).getChannelData(0);
  assert.ok(data.some((value) => Math.abs(value) > .15));
  assert.ok(data.every((value) => Math.abs(value) < 1));
  assert.ok(data.slice(2 * context.sampleRate).every((value) => value === 0));
});
test('audio is queued in advance, deduplicated, cancelled and bounded by lesson start', async () => {
  const { context, nodes } = fakeContext();
  const player = createLessonAlarmPlayer({ createContext: () => context });
  await player.unlock();
  const alarm = { id: 't:lesson', dueMs: 130_000, startMs: 430_000 };
  player.schedule([alarm], 100_000);
  assert.deepEqual(nodes[0].starts, [130]);
  assert.deepEqual(nodes[0].stops, [430]);
  context.currentTime += 10;
  player.schedule([alarm], 110_000);
  assert.equal(nodes.length, 1);
  player.schedule([], 110_000);
  assert.equal(nodes[0].stops.length, 2);
  player.dispose();
});
test('sleep/clock drift reschedules; explicit dismissal stops future playback', async () => {
  const { context, nodes } = fakeContext();
  const player = createLessonAlarmPlayer({ createContext: () => context });
  await player.unlock();
  const alarm = { id: 'a', dueMs: 130_000, startMs: 430_000 };
  player.schedule([alarm], 100_000);
  player.schedule([alarm], 140_000);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[1].starts[0], 100);
  player.stop('a');
  assert.equal(nodes[1].stops.length, 2);
  player.dispose();
});

test('testing audio neither removes upcoming alarms nor stops when another tab owns the alarm', async () => {
  const { context, nodes } = fakeContext();
  const player = createLessonAlarmPlayer({ createContext: () => context });
  await player.unlock();
  const now = Date.now();
  player.schedule([{ id: 'upcoming', dueMs: now + 10_000, startMs: now + 310_000 }], now);
  await player.test();
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].stops.length, 1);
  player.stopScheduled();
  assert.equal(nodes[0].stops.length, 2);
  assert.equal(nodes[1].stops.length, 1);
  player.stop('test');
  assert.equal(nodes[1].stops.length, 2);
  player.dispose();
});
