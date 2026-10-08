import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { getPythonHomeworkTheoryDetails } from '../src/utils/pythonTheoryHomework.js';

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

test('editing group Python theory persists on disk, reopens correctly and reaches both pupils', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  const route = `/api/learning-groups/${f.groupId}/assignments`, teacher = f.tokens['teacher-a'];
  const dueAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const goal = { type: 'task', taskNumber: 101, levelId: 'python', includeAll: false, targetQuestions: [1], targetQuestionIds: ['python-question'] };
  try {
    const created = (await f.request(route, teacher, { title: 'Python', dueAt, homework: { studyTrack: 'python', homeWork: 'Вывести данные', dueAt, goals: [goal] } }, 'POST', 201)).assignment;
    const assignmentRoute = `${route}/${created.id}`;
    for (const type of ['rutube', 'text']) {
      await f.request(assignmentRoute, teacher, { homework: { ...created.homework, goals: [{ ...goal, pythonTheorySubsectionId: 'input-output', pythonTheoryType: type }] } }, 'PATCH');
      const reopened = (await f.request(assignmentRoute, teacher)).assignment;
      assert.equal(reopened.homework.goals[0].pythonTheoryType, type);
      assert.equal((await f.request(route, teacher)).assignments[0].homework.goals[0].pythonTheorySubsectionId, 'input-output');
      const stored = JSON.parse(fs.readFileSync(path.join(f.data, 'learning-assignments.json'), 'utf8')).find(x => x.id === created.id);
      assert.equal(stored.homework.goals[0].pythonTheoryType, type);
      const taskEntry = JSON.parse(fs.readFileSync(path.join(f.data, 'tests.json'), 'utf8'))['101'];
      for (const id of ['student-a', 'student-b']) {
        const entry = (await f.request('/api/student-next-lesson', f.tokens[id])).homeworks.find(x => x.learningAssignmentId === created.id);
        const details = getPythonHomeworkTheoryDetails(taskEntry, entry.goals[0]);
        assert.equal(details.available, true);
        assert.equal(details.type, type);
        assert.equal(details.subsectionTitle, 'Ввод и вывод данных');
      }
    }
    const extended = (await f.request(assignmentRoute, teacher, { title: 'Python · новая дата', dueAt: new Date(Date.now() + 14 * 86400000).toISOString() }, 'PATCH')).assignment;
    assert.equal(extended.homework.goals[0].pythonTheoryType, 'text');
    await f.request(assignmentRoute, teacher, { homework: { ...extended.homework, goals: [{ ...goal, pythonTheorySubsectionId: '', pythonTheoryType: '' }] } }, 'PATCH');
    assert.equal((await f.request(assignmentRoute, teacher)).assignment.homework.goals[0].pythonTheoryType, undefined);
    for (const id of ['student-a', 'student-b']) {
      const entry = (await f.request('/api/student-next-lesson', f.tokens[id])).homeworks.find(x => x.learningAssignmentId === created.id);
      assert.equal(getPythonHomeworkTheoryDetails({}, entry.goals[0]), null);
    }
  } finally { await f.stop(); }
});

test('deadline expiry blocks every group submission path and extending it reopens acceptance without losing work', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  const route = `/api/learning-groups/${f.groupId}/assignments`, teacher = f.tokens['teacher-a'], pupil = f.tokens['student-a'];
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  const expired = new Date(Date.now() - 60000).toISOString();
  try {
    const material = (await f.request(`/api/learning-groups/${f.groupId}/materials`, teacher, { title: 'Видео', kind: 'video', url: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/', quizQuestions: [{ id: 'q1', question: 'Что выведет print(1)?', answer: '1' }] }, 'POST', 201)).material;
    const create = async (title, dueAt, extra = {}) => (await f.request(route, teacher, { title, dueAt, ...extra, homework: { homeWork: title, dueAt } }, 'POST', 201)).assignment;
    const a = await create('Python', future, { materialIds: [material.id] });
    const other = await create('ЕГЭ', future);
    const homework = (await f.request('/api/student-next-lesson', pupil)).homeworks.find(x => x.learningAssignmentId === a.id);
    await f.request(`/api/student-next-lesson/${homework.id}/checklist`, pupil, { itemId: homework.checklistItems[0].id, completed: true }, 'PATCH');
    const submission = (await f.request(`${route}/${a.id}/submission`, pupil, { content: 'Решение до срока' }, 'PUT')).submission;
    const changeDate = (dueAt) => f.request(`${route}/${a.id}`, teacher, { dueAt, homework: { ...a.homework, dueAt } }, 'PATCH');
    const expiringSoon = new Date(Date.now() + 1500).toISOString();
    assert.equal((await changeDate(expiringSoon)).assignment.status, 'assigned');
    assert.equal((await f.request(`${route}/${a.id}`, teacher)).assignment.status, 'assigned');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(expiringSoon) - Date.now()) + 30));
    const closed = (await f.request(`${route}/${a.id}`, teacher)).assignment;
    assert.equal(closed.status, 'closed'); assert.equal(closed.closureReason, 'deadline'); assert.equal(closed.acceptanceStatus, 'assigned');
    assert.equal((await f.request(`${route}/${a.id}`, teacher)).assignment.status, 'closed');
    const list = (await f.request(route, pupil)).assignments;
    assert.equal(list.find(x => x.id === a.id).status, 'closed');
    assert.equal(list.find(x => x.id === other.id).status, 'assigned');
    const entries = (await f.request('/api/student-next-lesson', pupil)).homeworks;
    const entry = entries.find(x => x.learningAssignmentId === a.id);
    assert.equal(entry.learningAssignmentStatus, 'closed');
    assert.ok(entry.checklistItems[0].completedAt);
    const checklist = `/api/student-next-lesson/${homework.id}/checklist`;
    assert.equal((await f.request(checklist, pupil, { itemId: homework.checklistItems[0].id, completed: false }, 'PATCH', 409)).code, 'learning_group_homework_closed');
    await f.request(`${route}/${a.id}/submission`, pupil, { content: 'После срока' }, 'PUT', 409);
    await f.request(`/api/student-next-lesson/${homework.id}/video-quiz`, pupil, { materialId: material.id, answers: { q1: '1' } }, 'PATCH', 409);
    assert.equal((await f.request(`${route}/${a.id}/submission`, pupil)).submission.content, submission.content);
    const restored = (await changeDate(future)).assignment;
    assert.equal(restored.status, 'assigned'); assert.equal(restored.closureReason, '');
    await f.request(checklist, pupil, { itemId: homework.checklistItems[0].id, completed: false }, 'PATCH');
    await f.request(`/api/student-next-lesson/${homework.id}/video-quiz`, pupil, { materialId: material.id, answers: { q1: '1' } }, 'PATCH');
    await f.request(`${route}/${a.id}/submission`, pupil, { content: 'После продления' }, 'PUT');
    await f.request(`${route}/${a.id}`, teacher, { status: 'closed' }, 'PATCH');
    assert.equal((await changeDate(future)).assignment.closureReason, 'manual');
    await f.request(`${route}/${a.id}/submission`, pupil, { content: 'Закрыто вручную' }, 'PUT', 409);
    const draft = await create('Черновик', expired, { status: 'draft' });
    assert.equal(draft.status, 'draft');
    assert.equal((await f.request('/api/student-next-lesson', f.tokens['student-b'])).homeworks.some(x => x.learningAssignmentId === draft.id), false);
    const stored = JSON.parse(fs.readFileSync(path.join(f.data, 'learning-assignments.json'), 'utf8'));
    assert.equal(stored.find(x => x.id === other.id).status, 'assigned');
  } finally { await f.stop(); }
});
