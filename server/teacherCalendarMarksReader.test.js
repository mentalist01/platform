import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTeacherCalendarMarksReader } from './teacherCalendarMarksReader.js';

test('marks reads preserve editing isolation and notice atomic replacement and invalidation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-marks-reader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'marks.json');
  let normalizations = 0;
  const reader = createTeacherCalendarMarksReader(file, value => {
    normalizations += 1;
    return value;
  });
  fs.writeFileSync(file, JSON.stringify({ teacher: { paid: 'yes' } }));
  const snapshot = reader.readSnapshot();
  assert.equal(reader.readSnapshot(), snapshot);
  assert.equal(normalizations, 1);
  assert.throws(() => { snapshot.teacher.paid = 'changed'; }, TypeError);
  const editable = reader.read();
  editable.teacher.paid = 'changed';
  editable.another = {};
  assert.deepEqual(reader.read(), { teacher: { paid: 'yes' } });
  const replacement = path.join(root, 'new.json');
  fs.writeFileSync(replacement, JSON.stringify({ teacher: { paid: 'new' } }));
  fs.renameSync(replacement, file);
  assert.deepEqual(reader.read(), { teacher: { paid: 'new' } });
  reader.invalidate();
  assert.notEqual(reader.readSnapshot(), snapshot);
  assert.equal(normalizations, 3);
  fs.writeFileSync(file, 'invalid JSON');
  assert.deepEqual(reader.read(), {});
  fs.writeFileSync(file, JSON.stringify({ teacher: { cancelled: 'yes' } }));
  assert.deepEqual(reader.read(), { teacher: { cancelled: 'yes' } });
});
