import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { groupHomeworkDefaultDueAt } from '../src/utils/groupStudyPlan.js';

test('teacher configures directions, switches modes and issues new homework without changing history or billing', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  try {
    const route = `/api/learning-groups/${f.groupId}`, teacher = f.tokens['teacher-a'];
    const dueAt = new Date(Date.now() + 10 * 86400000).toISOString();
    const old = (await f.request(route + '/assignments', teacher, { title: 'Прежняя домашка', dueAt, homework: { studyTrack: 'ege', homeWork: 'ЕГЭ', dueAt } }, 'POST', 201)).assignment;
    const before = (await f.request(route, teacher)).group;
    const files = ['progress', 'learning-assignments', 'learning-lesson-sessions', 'teacher-finances'];
    const snapshot = () => files.map(name => fs.existsSync(path.join(f.data, name + '.json')) ? fs.readFileSync(path.join(f.data, name + '.json'), 'utf8') : null);
    const preserved = snapshot();
    for (const token of [f.tokens['teacher-b'], f.tokens['student-a']]) await f.request(route, token, { studyPlan: { mode: 'ege-only' } }, 'PATCH', 403);
    await f.request(route, teacher, { studyPlan: { mode: 'split', pythonWeekday: 'monday' } }, 'PATCH', 400);
    await f.request(route, teacher, { studyPlan: { mode: 'unknown' } }, 'PATCH', 400);
    const split = (await f.request(route, teacher, { studyPlan: { mode: 'split', pythonWeekday: 'friday' } }, 'PATCH')).group;
    assert.equal(split.studyPlan.pythonWeekday, 'friday');
    assert.deepEqual(split.schedule, before.schedule);
    assert.deepEqual(split.members, before.members);
    assert.deepEqual(snapshot(), preserved);
    const create = async track => (await f.request(route + '/assignments', teacher, { title: track, useStudyPlanDeadline: true, dueAt: '2001-01-01T00:00Z', homework: { studyTrack: track, homeWork: track } }, 'POST', 201)).assignment;
    const python = await create('python');
    assert.equal(python.dueAt, groupHomeworkDefaultDueAt(split, 'python'));
    assert.equal(python.homework.dueAt, python.dueAt);
    const historyBeforeSwitch = snapshot();
    const egeOnly = (await f.request(route, teacher, { studyPlan: { mode: 'ege-only' } }, 'PATCH')).group;
    assert.deepEqual(snapshot(), historyBeforeSwitch);
    assert.deepEqual(egeOnly.schedule, before.schedule);
    const ege = await create('ege');
    assert.equal(ege.dueAt, groupHomeworkDefaultDueAt(egeOnly, 'ege'));
    const unchanged = (await f.request(route + '/assignments/' + old.id, teacher)).assignment;
    assert.equal(unchanged.dueAt, dueAt);
    const manual = (await f.request(route + '/assignments', teacher, { title: 'Ручной срок', dueAt, homework: { studyTrack: 'ege', homeWork: 'ЕГЭ', dueAt } }, 'POST', 201)).assignment;
    assert.equal(manual.dueAt, dueAt);
    const swapped = (await f.request(route, teacher, { studyPlan: { mode: 'split', pythonWeekday: 'wednesday' } }, 'PATCH')).group;
    assert.equal(swapped.studyPlan.pythonWeekday, 'wednesday');
    assert.equal((await f.request(route + '/assignments/' + python.id, teacher)).assignment.dueAt, python.dueAt);
  } finally { await f.stop(); }
});
