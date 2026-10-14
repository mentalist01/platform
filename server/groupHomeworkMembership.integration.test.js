import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { partitionConcurrentHomeworks } from '../src/utils/concurrentHomework.js';
import { HomeworkLivesStore } from './homeworkLives.js';

test('real transfer archives previous group work, preserves answers and leaves classmates current', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  try {
    const teacher = f.tokens['teacher-a'], pupil = f.tokens['student-a'];
    const route = `/api/learning-groups/${f.groupId}/assignments`;
    const dueAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const assignment = (await f.request(route, teacher, { title: 'Старая домашка', dueAt,
      homework: { homeWork: 'Решить задачу', dueAt } }, 'POST', 201)).assignment;
    const first = (await f.request('/api/student-next-lesson', pupil)).homeworks[0];
    await f.request(`/api/student-next-lesson/${first.id}/checklist`, pupil,
      { itemId: first.checklistItems[0].id, completed: true }, 'PATCH');
    const target = (await f.request('/api/learning-groups', teacher, { name: 'Группа 3' }, 'POST', 201)).group;
    await f.request(`/api/learning-groups/${f.groupId}/members/student-a/transfer`, teacher, { targetGroupId: target.id });
    const entries = (await f.request('/api/student-next-lesson', pupil)).homeworks;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].learningGroupId, f.groupId);
    assert.equal(entries[0].learningAssignmentStatus, 'closed');
    assert.ok(entries[0].learningHomeworkCancelledAt);
    assert.ok(entries[0].checklistItems[0].completedAt);
    assert.equal(partitionConcurrentHomeworks(entries).active.length, 0);
    assert.equal(partitionConcurrentHomeworks(entries).history.length, 1);
    const peer = (await f.request('/api/student-next-lesson', f.tokens['student-b'])).homeworks;
    assert.equal(peer[0].learningAssignmentStatus, 'assigned');
    assert.equal(partitionConcurrentHomeworks(peer).active.length, 1);
    await f.request(`${route}/${assignment.id}/submission`, pupil, { content: 'После выхода' }, 'PUT', 409);
    await f.request(`/api/student-next-lesson/${first.id}/checklist`, pupil,
      { itemId: first.checklistItems[0].id, completed: false }, 'PATCH', 409);
  } finally { await f.stop(); }
});

test('lives API reads current membership even when stored homework still looks assigned', { timeout: 60000 }, async () => {
  const now = Date.now(), ago = days => new Date(now - days * 86400000).toISOString();
  const f = await createGroupHomeworkFixture(undefined, (write, data) => {
    const store = new HomeworkLivesStore(path.join(data, 'homework-lives.json'), { now: () => now - 6 * 86400000 });
    store.configure('teacher-a', true);
    write('students', JSON.parse(fs.readFileSync(path.join(data, 'students.json'), 'utf8')).map(s => ({ ...s, createdAt: ago(90) })));
    write('learning-groups', [{ id: 'former', teacherId: 'teacher-a', name: 'Прежняя группа',
      members: [{ studentId: 'student-a', status: 'removed', joinedAt: ago(10), leftAt: ago(2) }], createdAt: ago(10) }]);
    write('progress', { 'student-a': { homeworks: [{ id: 'stale', source: 'learning-group', learningGroupId: 'former',
      learningAssignmentStatus: 'assigned', issuedAt: ago(4), dueAt: ago(1), homeWork: 'Обязательное задание',
      goals: [{ type: 'task', taskNumber: 4, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['ege-question'] }] }] } });
  });
  try {
    const status = await f.request('/api/homework-lives', f.tokens['student-a']);
    assert.equal(status.remaining, 3);
    assert.deepEqual(status.history, []);
    assert.deepEqual(status.pendingReviews, []);
    assert.equal((await f.request('/api/homework-lives?studentId=student-a', f.tokens['teacher-a'])).remaining, 3);
  } finally { await f.stop(); }
});
