import assert from 'node:assert/strict';
import test from 'node:test';
import { attachRecorderPythonTheory, recorderPythonCatalog } from './recorderPythonTheory.js';

const defaults = [{ number: 101, title: 'Ввод' }];
const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Fixture_Key';
const payload = { recordingId: '00000000-0000-4000-8000-000000000001', teacherId: 'teacher', taskNumber: 101,
  subsectionId: '__default__', expectedUrl: '', title: 'Ввод данных', url };
const fixture = () => ({ 101: { python: [{ id: 'exercise', answer: '42' }],
  pythonTheory: { type: 'text', content: 'Existing text' }, pythonSubsections: [{ id: 'sub-int', title: 'Числа' }] },
  102: { python: [{ id: 'other' }] } });

test('catalog uses actual custom topics/subsections and existing video', () => {
  const db = fixture(); db.__pythonTaskCatalog = [{ number: 101, title: 'Моя тема' }];
  const list = recorderPythonCatalog(db, defaults);
  assert.equal(list[0].title, 'Моя тема');
  assert.deepEqual(list[0].subsections.map(s => s.id), ['sub-int', '__default__']);
});
test('publication preserves exercises, other topics and legacy theory; retry is idempotent', () => {
  const db = fixture(); const before = structuredClone(db);
  const result = attachRecorderPythonTheory(db, defaults, 'teacher', payload);
  assert.deepEqual(db, before);
  assert.deepEqual(result.tests[101].python, before[101].python);
  assert.deepEqual(result.tests[102], before[102]);
  assert.equal(result.tests[101].pythonTheoryBySubsection.__default__.text.content, 'Existing text');
  assert.equal(result.tests[101].pythonTheoryBySubsection.__default__.rutube.content, url);
  assert.equal(attachRecorderPythonTheory(result.tests, defaults, 'teacher', payload).created, false);
});
test('rejects other teacher, missing topic, missing subsection, stale writes and invalid links', () => {
  for (const mutation of [{ teacherId: 'other' }, { taskNumber: 999 }, { subsectionId: 'gone' },
    { expectedUrl: 'stale' }, { url: 'https://evil.example/video' }, { recordingId: '../bad' }]) {
    assert.throws(() => attachRecorderPythonTheory(fixture(), defaults, 'teacher', { ...payload, ...mutation }));
  }
});
test('replacement needs explicit consent; deleted or edited publication is not resurrected on retry', () => {
  const first = attachRecorderPythonTheory(fixture(), defaults, 'teacher', payload).tests;
  const second = { ...payload, recordingId: '00000000-0000-4000-8000-000000000002', expectedUrl: url, url: url.replace('Fixture_Key', 'New_Key') };
  assert.throws(() => attachRecorderPythonTheory(first, defaults, 'teacher', second), /Подтвердите/);
  const replaced = attachRecorderPythonTheory(first, defaults, 'teacher', { ...second, replaceExisting: true });
  assert.throws(() => attachRecorderPythonTheory(replaced.tests, defaults, 'teacher', payload), /изменён/);
  delete first[101].pythonTheoryBySubsection.__default__.rutube;
  assert.throws(() => attachRecorderPythonTheory(first, defaults, 'teacher', payload), /изменён/);
});
