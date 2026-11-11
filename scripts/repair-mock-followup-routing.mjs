import fs from 'node:fs';
import path from 'node:path';
import { repairMockExamFollowupRouting } from '../server/mockExamFollowupRepair.js';
import { normalizeStoredClassicTaskCatalog } from '../server/classicTaskCatalogMutation.js';
import { mergeTeacherTestsDb } from '../server/teacherTaskContent.js';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
for (const name of ['--data-dir', '--student-id', '--file-name', '--from-bank', '--to-bank']) {
  if (!args.includes(name) || !option(name)) throw Error('Required argument: ' + name);
}
const dataDir = path.resolve(option('--data-dir'));
const read = (name, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, name + '.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
};
const studentId = option('--student-id');
const student = read('students').find(row => row.id === studentId && !row.deletedAt);
if (!student) throw Error('Student not found');
const progressFile = path.join(dataDir, 'progress.json');
const original = fs.readFileSync(progressFile);
const progress = JSON.parse(original.toString());
const teacher = read('teacher-task-content', {}).teachers?.[student.teacherId];
const catalog = normalizeStoredClassicTaskCatalog(teacher?.catalog || read('task-catalog')).activeTasks;
const matches = (progress[studentId]?.mockTestingQueue || []).filter(row =>
  (row.question?.files || []).some(file => file.name === option('--file-name')));
if (matches.length !== 1) throw Error('Expected exactly one queued question with this file');
const entry = matches[0];
const repair = repairMockExamFollowupRouting({
  studentData: progress[studentId], sourceKey: entry.sourceKey, taskCatalog: catalog,
  testsDb: mergeTeacherTestsDb(read('tests'), teacher),
  expectedFrom: Number(option('--from-bank')), expectedTo: Number(option('--to-bank')),
});
if (args.includes('--apply') && repair.changed) {
  if (!args.includes('--backup-dir')) throw Error('A backup directory is required to apply');
  const backup = path.resolve(option('--backup-dir'));
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(backup, 'progress.before.json'), original, { flag: 'wx', mode: 0o600 });
  if (!fs.readFileSync(progressFile).equals(original)) throw Error('Progress changed during repair');
  progress[studentId] = repair.studentData;
  const temp = progressFile + '.mock-routing-' + process.pid;
  const fd = fs.openSync(temp, 'wx', fs.statSync(progressFile).mode);
  try { fs.writeFileSync(fd, JSON.stringify(progress)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, progressFile);
}
console.log(JSON.stringify({ applied: args.includes('--apply') && repair.changed, changed: repair.changed,
  questionId: entry.question.id, sourceSlot: entry.sourceMockTaskNumber,
  fromBank: repair.from, toBank: repair.to,
  displayNumber: catalog.find(row => row.taskNumber === repair.to)?.slotNumber }));
