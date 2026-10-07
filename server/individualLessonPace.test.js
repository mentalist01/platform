import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { IndividualLessonPaceStore, INDIVIDUAL_PACE_DISCONNECT_GRACE_MS } from './individualLessonPace.js';

const fixture = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'individual-pace-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-10-07T10:00:00Z'), active = false;
  const file = path.join(directory, 'pace.json');
  const store = new IndividualLessonPaceStore(file, { now: () => now });
  const student = { id: 'a', teacherId: 't' };
  const occurrence = { key: 'a|2026-10-07|13:00|60', studentId: 'a', dayKey: '2026-10-07', time: '13:00', startMs: now };
  const options = { studentById: id => id === student.id ? student : null, isActive: () => active, topicFor: () => 'Циклы' };
  return { store, file, occurrence, student, options, now: () => now, advance: ms => now += ms,
    active: value => active = value, list: () => store.list(options) };
};
test('individual survey starts with actual new lessons, never historical calendar/group data', t => {
  const f = fixture(t);
  f.store.observeLesson('t', f.occurrence, f.now() - 3600000, f.now() - 60000);
  f.store.observeLesson('t', { ...f.occurrence, groupId: 'g' }, f.now());
  f.store.observeLesson('t', { ...f.occurrence, lessonId: 'group-session' }, f.now());
  assert.deepEqual(f.list(), []);
  assert.deepEqual(f.store.data.lessons, {});
  f.store.observeLesson('t', f.occurrence, f.now());
  f.advance(60_000); f.store.finishLesson('t', f.occurrence.key);
  const lesson = f.list()[0];
  assert.equal(lesson.kind, 'individual'); assert.equal(lesson.topic, 'Циклы');
  assert.deepEqual(lesson.participantIds, ['a']); assert.equal(lesson.status, 'completed');
});
test('active lessons and short connection tests do not ask for a rating', t => {
  const f = fixture(t);
  f.store.observeLesson('t', f.occurrence, f.now());
  f.active(true); f.advance(30_000); assert.deepEqual(f.list(), []);
  f.active(false); f.store.disconnectLesson('t', f.occurrence.key);
  f.advance(INDIVIDUAL_PACE_DISCONNECT_GRACE_MS); assert.deepEqual(f.list(), []);
  f.advance(10 * 86400000); assert.deepEqual(f.list(), [], 'Late polling cannot turn a short call into a full lesson');
});
test('disconnect grace survives reload, resuming cancels it, explicit finish is immediate', t => {
  const f = fixture(t);
  f.store.observeLesson('t', f.occurrence, f.now()); f.advance(120_000);
  f.store.disconnectLesson('t', f.occurrence.key); assert.deepEqual(f.list(), []);
  f.advance(INDIVIDUAL_PACE_DISCONNECT_GRACE_MS - 1);
  assert.deepEqual(new IndividualLessonPaceStore(f.file, { now: f.now }).list(f.options), []);
  f.active(true); f.store.observeLesson('t', f.occurrence, f.now()); assert.deepEqual(f.list(), []);
  f.advance(60_000); f.active(false); f.store.finishLesson('t', f.occurrence.key);
  assert.equal(f.list().length, 1);
  assert.equal(new IndividualLessonPaceStore(f.file, { now: f.now }).list(f.options).length, 1);
});
test('unexpected disconnect completes only after grace and keeps its real disconnect time', t => {
  const f = fixture(t);
  f.store.observeLesson('t', f.occurrence, f.now()); f.advance(90_000);
  f.store.disconnectLesson('t', f.occurrence.key); const disconnected = f.now();
  f.advance(INDIVIDUAL_PACE_DISCONNECT_GRACE_MS);
  assert.equal(f.list()[0].completedAt, new Date(disconnected).toISOString());
});
test('duplicate observations do not erase explicit completion or create another lesson', t => {
  const f = fixture(t), start = f.now();
  f.store.observeLesson('t', f.occurrence, start); f.advance(3600000);
  f.store.finishLesson('t', f.occurrence.key);
  f.store.observeLesson('t', f.occurrence, start);
  assert.equal(f.list().length, 1);
  assert.equal(Object.keys(f.store.data.lessons).length, 1);
});
test('student transfer, deletion, and teacher/student filters protect old lesson access', t => {
  const f = fixture(t); f.store.observeLesson('t', f.occurrence, f.now()); f.advance(3600000); f.store.finishLesson('t', f.occurrence.key);
  assert.equal(f.store.list({ ...f.options, studentId: 'b' }).length, 0);
  assert.equal(f.store.list({ ...f.options, teacherId: 'other' }).length, 0);
  f.student.teacherId = 'other'; assert.deepEqual(f.list(), []);
  f.student.teacherId = 't'; f.student.deletedAt = 'deleted'; assert.deepEqual(f.list(), []);
});
test('a lesson already running at deployment can be observed when it ends', t => {
  const f = fixture(t);
  f.store.observeLesson('t', f.occurrence, f.now() - 3600000, f.now() + 1000);
  assert.deepEqual(f.list(), []);
  f.advance(1000);
  assert.equal(f.list().length, 1);
});
