import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HomeworkReminderStore } from './homeworkReminders.js';

const fixture = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'homework-reminders-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-10-03T10:00:00Z');
  const file = path.join(directory, 'reminders.json');
  const store = new HomeworkReminderStore(file, { now: () => now });
  const occurrence = { key: 'student:lesson', studentId: 'student', dayKey: '2026-10-03', time: '13:00' };
  let active = false;
  let homework = [];
  const options = { isActive: () => active, getTarget: lesson => ({ name: 'Ученик', participantIds: lesson.participantIds }), getHomeworks: () => homework };
  return { store, occurrence, file, options, clock: () => now, advance: ms => now += ms,
    active: value => active = value, homework: value => homework = value.map(entry => ({ homeWork: 'Задание', ...entry })),
    list: (teacher = 'teacher') => store.list(teacher, options),
    lesson: (teacher = 'teacher', target = occurrence) => {
      store.observeLesson(teacher, target, now);
      now += 60 * 60_000;
      store.finishLesson(teacher, target, now);
    } };
};

test('only actual new sessions create reminders, delayed after their end and scoped to teacher', t => {
  const f = fixture(t);
  f.store.observeLesson('teacher', { ...f.occurrence, key: 'historical' }, f.clock() - 3600_000, f.clock() - 60_000);
  assert.equal(f.list().length, 0);
  f.lesson();
  assert.equal(f.list().length, 0);
  f.advance(120_000);
  assert.equal(f.list().length, 1);
  assert.equal(f.list('other').length, 0);
});

test('homework given during the lesson or afterwards counts, editing old homework and drafts do not', t => {
  const f = fixture(t);
  const start = f.clock(); f.lesson(); f.advance(120_000);
  f.homework([{ issuedAt: new Date(start - 1000).toISOString(), updatedAt: new Date(f.clock()).toISOString() }]);
  assert.equal(f.list().length, 1);
  f.homework([{ status: 'draft', publishedAt: new Date(f.clock()).toISOString() }]);
  assert.equal(f.list().length, 1);
  f.homework([{ issuedAt: new Date(f.clock()).toISOString(), homeWork: '' }]);
  assert.equal(f.list().length, 1, 'clearing homework is not a new assignment');
  f.homework([{ issuedAt: new Date(start + 10 * 60_000).toISOString() }]);
  assert.equal(f.list().length, 0);
  const after = fixture(t); after.lesson(); after.advance(120_000);
  after.homework([{ issuedAt: new Date(after.clock()).toISOString() }]);
  assert.equal(after.list().length, 0);
  after.homework([]);
  assert.equal(after.list().length, 0, 'an already satisfied lesson does not return to the backlog');
});

test('one group reminder checks all participants including several selected assignments', t => {
  const f = fixture(t);
  const group = { key: 'group:lesson', groupId: 'group', lessonId: 'lesson', participantIds: ['a', 'b'], dayKey: '2026-10-03' };
  f.lesson('teacher', group); f.advance(120_000);
  assert.equal(f.list().length, 1);
  const publication = { status: 'assigned', publishedAt: new Date(f.clock()).toISOString(), recipientMode: 'selected' };
  f.homework([{ ...publication, recipientIds: ['a'] }]);
  assert.equal(f.list().length, 1);
  f.homework([{ ...publication, recipientIds: ['a'] }, { ...publication, recipientIds: ['b'] }]);
  assert.equal(f.list().length, 0);
  const all = fixture(t); all.lesson('teacher', group); all.advance(120_000);
  all.homework([{ ...publication, recipientMode: 'all' }]);
  assert.equal(all.list().length, 0);
});

test('intentional omission survives restart, duplicate checkpoints and lesson continuation', t => {
  const f = fixture(t);
  f.lesson(); f.advance(120_000);
  const id = f.list()[0].id;
  assert.equal(f.store.dismiss('other', id), false);
  assert.equal(f.store.dismiss('teacher', id), true);
  assert.equal(f.store.dismiss('teacher', id), true);
  f.lesson(); f.advance(120_000);
  const restored = new HomeworkReminderStore(f.file, { now: f.clock });
  assert.deepEqual(restored.list('teacher', f.options), []);
});

test('reconnection suppresses a pending reminder and does not lose it after the real end', t => {
  const f = fixture(t);
  f.lesson(); f.advance(120_000);
  f.active(true);
  assert.deepEqual(f.list(), []);
  f.advance(10 * 60_000);
  f.store.finishLesson('teacher', f.occurrence, f.clock());
  f.active(false); f.advance(120_000);
  assert.equal(f.list().length, 1);
});

test('abrupt PC disconnect has a grace period and persists across server restart', t => {
  const f = fixture(t);
  f.store.observeLesson('teacher', f.occurrence, f.clock());
  f.advance(60 * 60_000);
  assert.equal(f.list().length, 0);
  f.advance(60_000); f.active(true);
  assert.equal(f.list().length, 0);
  f.active(false);
  assert.equal(f.list().length, 0);
  f.advance(180_000);
  const restored = new HomeworkReminderStore(f.file, { now: f.clock });
  assert.equal(restored.list('teacher', f.options).length, 1);
});

test('deleted targets and short connection checks do not create a prompt', t => {
  const f = fixture(t);
  const start = f.clock();
  f.store.observeLesson('teacher', f.occurrence, start, start + 10_000);
  f.advance(300_000);
  assert.equal(f.list().length, 0);
  f.lesson(); f.advance(120_000);
  assert.deepEqual(f.store.list('teacher', { ...f.options, getTarget: () => null }), []);
});
