import test from 'node:test';
import assert from 'node:assert/strict';
import { studentNameAvailability as check, assertStudentNamesAvailable, studentNameKey } from './studentNameAvailability.js';

const students = [{ id: 'a', name: 'Александр', nickname: 'Саша 11' },
  { id: 'b', name: 'Анна', nickname: 'Аня', deletedAt: '2026-09-30' }];
test('names and name 2 share a normalized namespace, including restorable accounts', () => {
  for (const name of [' АЛЕКСАНДР ', 'Саша   11', 'Анна', 'аня']) {
    const result = check(students, name);
    assert.equal(result.nameTaken, true); assert.equal(result.nicknameRequired, true); assert.equal(result.canCreate, false);
  }
  assert.equal(studentNameKey('Артём'), studentNameKey('АРТЕМ'));
  assert.equal(check(students, 'Новое имя').canCreate, true);
});
test('a busy main name is permitted only with a free name 2', () => {
  assert.equal(check(students, 'Александр', 'Саша 10').canCreate, true);
  for (const nickname of ['', 'Аня', 'Анна', 'Александр', 'Саша 11']) {
    assert.throws(() => assertStudentNamesAvailable(students, 'Александр', nickname), { status: 409 });
  }
  assert.equal(check(students, 'Новое имя', 'Аня').canCreate, false);
});
test('editing excludes the same student but still validates other names; invalid input fails closed', () => {
  assert.equal(check(students, 'Александр', 'Саша 11', 'a').canCreate, true);
  for (const name of ['', 'x'.repeat(61), '../x']) assert.equal(check(students, name).canCreate, false);
  const result = check(students, 'Александр');
  assert.deepEqual(Object.keys(result).sort(), ['canCreate', 'message', 'nameTaken', 'nicknameRequired', 'nicknameTaken']);
});
