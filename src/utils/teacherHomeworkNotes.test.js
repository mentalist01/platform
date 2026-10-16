import test from 'node:test';
import assert from 'node:assert/strict';
import { HOMEWORK_NOTE_MAX_LENGTH, homeworkNoteTarget, homeworkNoteStorageKey, parseHomeworkNote, writeHomeworkNote, appendHomeworkNote } from './teacherHomeworkNotes.js';

test('private notes survive reopening and stay isolated by teacher, student and group', () => {
  const data = new Map();
  const storage = { setItem: (key, value) => data.set(key, value) };
  const key = homeworkNoteStorageKey('teacher-a', homeworkNoteTarget({ studentId: 'same-id' }));
  const groupKey = homeworkNoteStorageKey('teacher-a', homeworkNoteTarget({ groupId: 'same-id' }));
  const otherKey = homeworkNoteStorageKey('teacher-b', homeworkNoteTarget({ studentId: 'same-id' }));
  assert.notEqual(key, groupKey); assert.notEqual(key, otherKey);
  writeHomeworkNote(storage, key, 'for: повторить range\nЕГЭ: звук');
  writeHomeworkNote(storage, groupKey, 'Группе — таблицы');
  assert.equal(parseHomeworkNote(data.get(key)).text, 'for: повторить range\nЕГЭ: звук');
  assert.equal(parseHomeworkNote(data.get(groupKey)).text, 'Группе — таблицы');
  assert.equal(parseHomeworkNote(data.get(otherKey)).text, '');
});

test('malformed storage and denied writes do not claim the note was saved', () => {
  assert.equal(parseHomeworkNote('{bad').text, '');
  assert.equal(parseHomeworkNote('{"text":8}').text, '');
  const result = writeHomeworkNote({ setItem() { throw Error('quota'); } }, 'key', 'x'.repeat(9000));
  assert.equal(result.ok, false);
  assert.equal(parseHomeworkNote(result.raw).text.length, HOMEWORK_NOTE_MAX_LENGTH);
});

test('adding notes preserves homework text and does not duplicate a repeated click', () => {
  const text = appendHomeworkNote('Посмотреть видео', '  Повторить for  ');
  assert.equal(text, 'Посмотреть видео\n\nПовторить for');
  assert.equal(appendHomeworkNote(text, 'Повторить for'), text);
  assert.equal(appendHomeworkNote('', 'Повторить for'), 'Повторить for');
});
