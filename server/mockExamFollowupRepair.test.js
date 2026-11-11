import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repairMockExamFollowupRouting } from './mockExamFollowupRepair.js';

const taskCatalog = [{ taskNumber: 23, slotNumber: 13 }, { taskNumber: 28, slotNumber: 23 }];
const question = { id: 'queued-graph', answer: '7', screenshots: [{ url: '/uploads/graph.png' }], files: [{ name: '23_31518.txt' }] };
const entry = { sourceKey: 'source', destinationTaskNumber: 23, sourceMockTaskNumber: 23, question, levelId: 'basic', afterQuestionId: null };
const studentData = { mockTestingQueue: [entry], solvedByTask: { 28: { basic: { solved: ['graph-base'] } } }, xpTotal: 777, notes: 'keep', mockAttemptResults: [] };
const options = { studentData, sourceKey: 'source', taskCatalog, testsDb: { 28: { basic: [{ id: 'graph-base' }] } }, expectedFrom: 23, expectedTo: 28 };

test('repair changes only routing, preserves files, IDs and all unrelated records, and is idempotent', () => {
  const result = repairMockExamFollowupRouting(options);
  assert.equal(entry.destinationTaskNumber, 23);
  const moved = result.studentData.mockTestingQueue[0];
  assert.equal(moved.destinationTaskNumber, 28);
  assert.equal(moved.afterQuestionId, 'graph-base');
  assert.deepEqual(moved.question, question);
  const { mockTestingQueue, ...rest } = result.studentData;
  const { mockTestingQueue: ignored, ...before } = studentData;
  assert.deepEqual(rest, before);
  assert.equal(repairMockExamFollowupRouting({ ...options, studentData: result.studentData }).changed, false);
});

test('repair refuses linked answers/assignments and unexpected destinations', () => {
  assert.throws(() => repairMockExamFollowupRouting({ ...options, studentData: { ...studentData, homeworks: [{ targetQuestionIds: ['queued-graph'] }] } }), /linked progress or assignments/);
  assert.throws(() => repairMockExamFollowupRouting({ ...options, expectedTo: 29 }), /verified catalog/);
  assert.throws(() => repairMockExamFollowupRouting({ ...options, expectedFrom: 13 }), /changed since the audit/);
});

test('repair CLI defaults to dry-run and backs up the exact original before an atomic update', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-routing-repair-'));
  const write = (name, value) => fs.writeFileSync(path.join(root, name + '.json'), JSON.stringify(value));
  write('students', [{ id: 'pupil', teacherId: 'teacher' }]);
  write('task-catalog', { tasks: taskCatalog.map(row => ({ ...row, number: row.slotNumber, title: 'Topic' })) });
  write('progress', { pupil: studentData, other: { coinsTotal: 55, homeworks: ['keep'] } });
  write('tests', options.testsDb);
  const original = fs.readFileSync(path.join(root, 'progress.json'));
  const args = ['scripts/repair-mock-followup-routing.mjs', '--data-dir', root, '--student-id', 'pupil', '--file-name', '23_31518.txt', '--from-bank', '23', '--to-bank', '28'];
  try {
    const plan = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
    assert.equal(plan.applied, false);
    assert.ok(fs.readFileSync(path.join(root, 'progress.json')).equals(original));
    const backup = path.join(root, 'backup');
    const applied = JSON.parse(execFileSync(process.execPath, [...args, '--apply', '--backup-dir', backup], { encoding: 'utf8' }));
    assert.equal(applied.applied, true);
    assert.ok(fs.readFileSync(path.join(backup, 'progress.before.json')).equals(original));
    const after = JSON.parse(fs.readFileSync(path.join(root, 'progress.json')));
    assert.deepEqual(after.other, { coinsTotal: 55, homeworks: ['keep'] });
    assert.equal(after.pupil.mockTestingQueue[0].destinationTaskNumber, 28);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
