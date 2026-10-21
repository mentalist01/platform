import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordingSegments, concatList } from './segments.mjs';
test('continuations join raw files exactly once in order and reject missing or unrelated segments', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-segments-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const jobs = {};
  for (const [id, previousJobId] of [['one', ''], ['two', 'one'], ['three', 'two']]) {
    const file = path.join(root, `lesson-${id}.mkv`); fs.writeFileSync(file, 'video');
    jobs[id] = { id, file, previousJobId, occurrence: { key: 'same-lesson' }, mp4: 'already-combined.mp4' };
  }
  assert.deepEqual(recordingSegments(jobs.three, jobs, root), [jobs.one.file, jobs.two.file, jobs.three.file]);
  jobs.one.occurrence.key = 'different'; assert.throws(() => recordingSegments(jobs.three, jobs, root), /разным/);
  jobs.one.occurrence.key = 'same-lesson'; fs.unlinkSync(jobs.one.file); assert.throws(() => recordingSegments(jobs.three, jobs, root), /Не найдена/);
  assert.equal(concatList(["D:\\Teacher's\\lesson.mkv"]), "file 'D:/Teacher'\\''s/lesson.mkv'\n");
});

test('a continuation skips proven empty failed starts while preserving every real part', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-empty-start-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const make = (id, previousJobId, failed = false) => {
    const file = path.join(root, `lesson-${id}.mkv`);
    if (!failed) fs.writeFileSync(file, `video-${id}`);
    return { id, previousJobId, occurrence: { key: 'lesson' }, status: failed ? 'error' : 'saved',
      ...(failed ? { error: 'Не удалось начать запись: OBS отключился.' } : { file }) };
  };
  const jobs = { one: make('one', '', true), two: make('two', 'one'), three: make('three', 'two', true), four: make('four', 'three') };
  assert.deepEqual(recordingSegments(jobs.four, jobs, root), [jobs.two.file, jobs.four.file]);
  assert.throws(() => recordingSegments(jobs.one, jobs, root), /Не найдена/);
  jobs.one.error = 'OBS остановился, файл не найден';
  assert.throws(() => recordingSegments(jobs.four, jobs, root), /Не найдена/);
  jobs.one.error = 'Не удалось начать запись: OBS отключился.';
  fs.writeFileSync(path.join(root, 'lesson-one.mkv'), '');
  assert.throws(() => recordingSegments(jobs.four, jobs, root), /Не найдена/);
});
