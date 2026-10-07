import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('two group assignments have independent deadlines and per-pupil progress through the real API', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  const path = `/api/learning-groups/${f.groupId}/assignments`, teacher = f.tokens['teacher-a'];
  try {
    const ege = (await f.request(path, teacher, { title: 'ЕГЭ до среды', dueAt: '2026-10-14T17:00:00Z', homework: { studyTrack: 'ege', homeWork: 'ЕГЭ: решить задания', dueAt: '2026-10-14T17:00:00Z', dueAtMode: 'manual' } }, 'POST', 201)).assignment;
    let a = await f.request('/api/student-next-lesson', f.tokens['student-a']);
    const first = a.homeworks.find(x => x.learningAssignmentId === ege.id);
    assert.equal(first.studyTrack, 'ege');
    await f.request(`/api/student-next-lesson/${first.id}/checklist`, f.tokens['student-a'], { itemId: first.checklistItems[0].id, completed: true }, 'PATCH');
    const python = (await f.request(path, teacher, { title: 'Python до пятницы', dueAt: '2026-10-16T17:00:00Z', homework: { studyTrack: 'python', homeWork: 'Python: цикл for', dueAt: '2026-10-16T17:00:00Z', dueAtMode: 'manual' } }, 'POST', 201)).assignment;
    a = await f.request('/api/student-next-lesson', f.tokens['student-a']);
    const b = await f.request('/api/student-next-lesson', f.tokens['student-b']);
    assert.equal(a.homeworks.length, 2); assert.equal(b.homeworks.length, 2);
    const old = a.homeworks.find(x => x.learningAssignmentId === ege.id), newer = a.homeworks.find(x => x.learningAssignmentId === python.id);
    assert.equal(old.dueAt, '2026-10-14T17:00:00.000Z'); assert.equal(newer.dueAt, '2026-10-16T17:00:00.000Z');
    assert.ok(old.checklistItems[0].completedAt); assert.ok(!b.homeworks.find(x => x.learningAssignmentId === ege.id).checklistItems[0].completedAt);
    assert.equal(newer.studyTrack, 'python');
    await f.request(`${path}/${python.id}`, teacher, { dueAt: '2026-10-23T17:00:00Z', homework: { ...python.homework, dueAt: '2026-10-23T17:00:00Z' } }, 'PATCH');
    a = await f.request('/api/student-next-lesson', f.tokens['student-a']);
    assert.equal(a.homeworks.find(x => x.learningAssignmentId === ege.id).dueAt, old.dueAt);
    await f.request(path, f.tokens['teacher-b'], undefined, 'GET', 403);
    await f.request(path, f.tokens['student-c'], undefined, 'GET', 403);
    await f.request(path, f.tokens['student-a'], { title: 'forbidden' }, 'POST', 403);
    assert.equal((await f.request('/api/student-next-lesson', f.tokens['student-c'])).homeworks.length, 0);
  } finally { await f.stop(); }
});
