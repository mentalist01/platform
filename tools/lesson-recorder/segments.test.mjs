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
