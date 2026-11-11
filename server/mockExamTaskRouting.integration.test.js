import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('finished manual mocks use the owner catalog and preserve routing across renumbering', { timeout: 60000 }, async () => {
  const catalog = { tasks: [{ taskNumber: 23, number: 13, title: 'Исполнитель' }, { taskNumber: 28, number: 23, title: 'Графы' }, { taskNumber: 19, number: 19, title: 'Игры' }], nextTaskNumber: 29 };
  const f = await createGroupHomeworkFixture(undefined, write => {
    write('task-catalog', catalog);
    write('tests', { 23: { basic: [{ id: 'base-executor', question: 'Исполнитель', answer: '1' }] }, 28: { basic: [{ id: 'base-graph', question: 'Графы', answer: '1' }] } });
    write('mock-exams', [{ id: 'legacy', title: 'Legacy', access: { all: true, mode: 'classic' }, tasks: { 13: { id: 'legacy-executor', question: 'Исполнитель', answer: '1' }, 23: { id: 'legacy-graph', question: 'Графы', answer: '1' } } }]);
  });
  try {
    const finish = (examId, studentId = 'student-a') => f.request('/api/mock-exams/attempt', f.tokens['teacher-a'], { studentId, examId, finishAttempt: true, mode: 'classic', answers: { 13: 'wrong' } }, 'PUT');
    await finish('legacy');
    let data = JSON.parse(fs.readFileSync(path.join(f.data, 'progress.json')));
    assert.deepEqual(data['student-a'].mockTestingQueue.map(q => [q.sourceMockTaskNumber, q.destinationTaskNumber]), [[13, 23], [23, 28]]);
    const personal = await f.request('/api/tests?studentId=student-a', f.tokens['teacher-a']);
    assert.ok(personal['28'].basic.some(q => q.id.startsWith('mock-followup-question-')));
    const attemptId = data['student-a'].mockAttempts.legacy.attemptId;
    await f.request('/api/mock-exams/attempt/task-result', f.tokens['teacher-a'], { studentId: 'student-a', examId: 'legacy', attemptId, taskKey: '13' }, 'PATCH');
    data = JSON.parse(fs.readFileSync(path.join(f.data, 'progress.json')));
    assert.deepEqual(data['student-a'].mockTestingQueue.map(q => q.destinationTaskNumber), [28]);
    const created = await f.request('/api/mock-exams', f.tokens['teacher-a'], { title: 'Frozen' });
    assert.equal(created.taskBankSnapshot['23'], 28);
    await f.request('/api/mock-exams/' + created.id, f.tokens['teacher-a'], { tasks: { 23: { id: 'frozen-graph', question: 'Графы', answer: '1' } }, access: { all: true, mode: 'classic' } }, 'PATCH');
    const current = await f.request('/api/task-catalog', f.tokens['teacher-a']);
    await f.request('/api/task-catalog', f.tokens['teacher-a'], { revision: current.revision, tasks: current.tasks.map(t => ({ ...t, slotNumber: t.slotNumber === 13 ? 23 : t.slotNumber === 23 ? 13 : t.slotNumber })) }, 'PUT');
    await finish(created.id);
    data = JSON.parse(fs.readFileSync(path.join(f.data, 'progress.json')));
    assert.equal(data['student-a'].mockTestingQueue.find(q => q.examId === created.id).destinationTaskNumber, 28);
    assert.equal(data['student-a'].mockAttempts[created.id].examSnapshot.taskBankSnapshot['23'], 28);
    const teacherNew = await f.request('/api/mock-exams', f.tokens['teacher-a'], { title: 'Teacher catalog' });
    const otherNew = await f.request('/api/mock-exams', f.tokens['teacher-b'], { title: 'Other catalog' });
    assert.equal(teacherNew.taskBankSnapshot['23'], 23);
    assert.equal(otherNew.taskBankSnapshot['23'], 28);
    await f.request('/api/mock-exams/attempt', f.tokens['teacher-b'], { studentId: 'student-a', examId: 'legacy', finishAttempt: true }, 'PUT', 403);
  } finally { await f.stop(); }
});
