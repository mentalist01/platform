import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const storage = source.slice(source.indexOf('const learningJsonStoreCache ='), source.indexOf('const readLearningGroupsDb ='));

for (const failedStore of ['lessons', 'attendance']) {
  test(`calendar import retries from persisted state after a failed ${failedStore} flush`, t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-import-failure-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const files = { lessons: path.join(dir, 'lessons.json'), attendance: path.join(dir, 'attendance.json') };
    for (const file of Object.values(files)) fs.writeFileSync(file, JSON.stringify([{ id: 'previous' }]));
    let fail = true;
    const writes = [];
    const context = {
      fs, console, learningLessonSessionsFile: files.lessons, learningAttendanceFile: files.attendance,
      writeJsonFileAtomic: (file, value) => {
        if (fail && file === files[failedStore]) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
        fs.writeFileSync(file, JSON.stringify(value));
        writes.push(file);
      },
    };
    vm.runInNewContext(`${storage}\nglobalThis.api = { read: readLearningJsonStore, write: writeLearningJsonStore, batch: withLearningCalendarImportBatch };`, context);
    const { api } = context;
    const normalize = rows => rows.map(row => ({ id: String(row.id) }));
    const next = [{ id: 'new' }];
    const importRows = () => api.batch(() => {
      for (const file of Object.values(files)) {
        api.read(file, normalize);
        api.write(file, next, normalize);
        assert.equal(api.read(file, normalize)[0].id, 'new', 'later rows observe earlier changes in the same import');
      }
    });
    assert.throws(importRows, { code: 'ENOSPC' });
    for (const file of Object.values(files)) {
      assert.equal(api.read(file, normalize)[0].id, JSON.parse(fs.readFileSync(file))[0].id,
        'a failed flush cannot acknowledge a value that was never saved');
    }
    fail = false;
    writes.length = 0;
    importRows();
    assert.equal(writes.length, 2);
    for (const file of Object.values(files)) assert.deepEqual(JSON.parse(fs.readFileSync(file)), next);
  });
}
