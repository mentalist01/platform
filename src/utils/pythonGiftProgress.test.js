import test from 'node:test';
import assert from 'node:assert/strict';
import { createPythonGiftSession, pythonGiftProgressKey } from './pythonGiftProgress.js';
const course = { id: 'course1', tasks: [{ id: 101, number: 101, questionCount: 2, entry: { python: [{ id: 'a', starterCode: '# starter', tests: [{ input: '1\n2', output: '3' }] }, { id: 'b', tests: [{ input: '', output: 'Hello' }] }] } }] };
const memoryStorage = () => { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
test('guest draft and solved state survive reload, stay isolated from platform accounts and other gifts', async () => {
  const storage = memoryStorage(); storage.setItem('ege_user', 'PLATFORM_ACCOUNT');
  let session = createPythonGiftSession(course, storage);
  assert.equal((await session.getQuestionCode('ignored', 101, 'python', 'a')).code, '# starter');
  await session.saveQuestionCode('ignored', 101, 'python', 'a', { code: 'print(3)', input: '1\n2' });
  await session.solveQuestion({ taskNumber: 101, questionId: 'a', code: 'print(3)', pythonResults: [{ input: '1\n2', output: '3\n', error: '' }] });
  session = createPythonGiftSession(course, storage);
  assert.deepEqual(session.getProgressSnapshot(), { 101: 50 });
  assert.equal((await session.getQuestionCode('', 101, 'python', 'a')).code, 'print(3)');
  assert.deepEqual((await session.getSolvedQuestions('', 101)).ids, ['a']);
  assert.deepEqual(createPythonGiftSession({ ...course, id: 'course2' }, storage).getProgressSnapshot(), { 101: 0 });
  assert.equal(storage.getItem('ege_user'), 'PLATFORM_ACCOUNT');
  assert.ok([...storage.data.keys()].filter(key => key !== 'ege_user').every(key => key.startsWith('python-gift:')));
});
test('incorrect answers, errors and partial test results do not complete a task; repeating a correct answer never duplicates it', async () => {
  const session = createPythonGiftSession(course, memoryStorage());
  for (const pythonResults of [[], [{ input: '1\n2', output: '4' }], [{ input: '1\n2', output: '3', error: 'ValueError' }], [{ input: 'wrong', output: '3' }]]) await session.solveQuestion({ taskNumber: 101, questionId: 'a', code: '...', pythonResults });
  assert.deepEqual(session.getSolvedIds(101), []);
  for (let i = 0; i < 2; i++) await session.solveQuestion({ taskNumber: 101, questionId: 'a', code: 'print(3)', pythonResults: [{ input: '1\n2', output: '3' }] });
  assert.deepEqual(session.getSolvedIds(101), ['a']);
  await assert.rejects(session.getQuestionCode('', 101, 'python', 'unknown'), /не найдена/);
});
test('damaged stored data is ignored and storage denial raises an honest save error', async () => {
  const storage = memoryStorage(); storage.setItem(pythonGiftProgressKey(course.id), JSON.stringify({ 101: { ids: {} } }));
  assert.deepEqual(createPythonGiftSession(course, storage).getSolvedIds(101), []);
  const session = createPythonGiftSession(course, { getItem: () => null, setItem: () => { throw Error('QuotaExceeded'); } });
  await assert.rejects(session.saveQuestionCode('', 101, 'python', 'a', { code: 'print(3)' }), /Скопируйте код/);
  await assert.rejects(session.solveQuestion({ taskNumber: 101, questionId: 'a', code: 'print(3)', pythonResults: [{ input: '1\n2', output: '3' }] }), /Скопируйте код/);
  assert.deepEqual(session.getSolvedIds(101), []);
});
