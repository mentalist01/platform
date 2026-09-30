import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecorderMaterial, addLessonRecordingMaterial, recordingLibrary } from './recorderMaterials.js';
import { normalizeLearningMaterial } from './learningGroups.js';

const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=private';
const clipId = '12345678-1234-4123-8123-123456789abc';
test('archive recordings become normal video homework without invented quiz answers; retries retain identity', () => {
  let materials = []; const deps = { read: () => materials, write: value => { materials = value; } };
  const payload = { clipId, title: 'Задание 3', url, durationSeconds: 3600 };
  const first = addRecorderMaterial('t', payload, deps);
  assert.equal(first.material.kind, 'video'); assert.deepEqual(first.material.quizQuestions, []);
  assert.equal(first.material.durationSeconds, 3600);
  assert.equal(addRecorderMaterial('t', payload, deps).created, false); assert.equal(materials.length, 1);
  assert.throws(() => addRecorderMaterial('t', { ...payload, url: 'https://rutube.ru/video/123/' }, deps));
  assert.equal(normalizeLearningMaterial({ ...first.material, kind: 'resource' }).kind, 'video');
});
test('only own ready private recordings are reusable and existing video material is reused', () => {
  let materials = [];
  const own = { id: 'job', teacherId: 't', status: 'ready', title: 'Урок', occurrence: { dayKey: '2026-09-29', durationMinutes: 60 }, video: { url } };
  const jobs = [own, { ...own, id: 'other', teacherId: 'u' }, { ...own, id: 'uploading', status: 'processing' },
    { ...own, id: 'public', video: { url: 'https://rutube.ru/video/public/' } }];
  assert.deepEqual(recordingLibrary('t', jobs, []).map(row => row.id), ['job']);
  const deps = { jobs, read: () => materials, write: value => { materials = value; } };
  const first = addLessonRecordingMaterial('t', 'job', { title: 'Задание 3 — весь урок' }, deps);
  assert.equal(first.created, true); assert.equal(first.material.durationSeconds, 3600);
  assert.equal(addLessonRecordingMaterial('t', 'job', { title: 'Another label' }, deps).material.id, first.material.id);
  assert.equal(materials.length, 1);
  for (const id of ['other', 'uploading', 'public']) assert.throws(() => addLessonRecordingMaterial('t', id, { title: 'X' }, deps), { status: 404 });
  materials[0].deletedAt = new Date().toISOString();
  const recreated = addLessonRecordingMaterial('t', 'job', { title: 'Новая домашка' }, deps);
  assert.notEqual(recreated.material.id, first.material.id);
  assert.equal(new Set(materials.map(material => material.id)).size, materials.length);
  assert.ok(materials.find(material => material.id === first.material.id).deletedAt);
});
