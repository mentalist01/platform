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

test('approved group calendar is available for study modes even with an empty legacy schedule', { timeout: 60000 }, async () => {
  const groupId = 'approved-group';
  const startDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const config = { startDate, durationMinutes: 60, startMinute: 600, endMinute: 1380, days: [0,1,2,3,4,5,6], weeks: 8, timezone: 'Europe/Moscow' };
  const f = await createGroupHomeworkFixture(undefined, write => {
    write('learning-groups', [{ id: groupId, teacherId: 'teacher-a', name: 'Утверждённая группа', startedAt: new Date(Date.now() - 86400000).toISOString(), members: ['student-a', 'student-b'].map(studentId => ({ studentId, status: 'active', joinedAt: new Date(Date.now() - 2 * 86400000).toISOString() })), schedule: [] }]);
    write('group-availability', { [groupId]: { id: 'poll', status: 'approved', config, answers: {}, plan: { id: 'approved', config, slots: ['2-1200', '4-1200'], approvedAt: Date.now() - 86400000 } } });
  }, { existingGroupId: groupId });
  try {
    const teacher = f.tokens['teacher-a'], route = `/api/learning-groups/${groupId}`;
    await f.request(route + '/schedule', teacher, { schedule: [] }, 'PUT');
    const before = (await f.request(route, teacher)).group;
    assert.equal(before.schedule.length, 0);
    assert.deepEqual(before.studySchedule.map(entry => entry.weekdayKey), ['wednesday', 'friday']);
    const configured = (await f.request(route, teacher, { studyPlan: { mode: 'split', pythonWeekday: 'friday' } }, 'PATCH')).group;
    assert.equal(configured.studyPlan.pythonWeekday, 'friday');
    assert.deepEqual(configured.schedule, []);
    const assignment = (await f.request(route + '/assignments', teacher, { title: 'Python', useStudyPlanDeadline: true, homework: { studyTrack: 'python', homeWork: 'Практика' } }, 'POST', 201)).assignment;
    assert.equal(assignment.dueAt, groupHomeworkDefaultDueAt(configured, 'python'));
    const stored = JSON.parse(fs.readFileSync(path.join(f.data, 'learning-groups.json'), 'utf8')).find(group => group.id === groupId);
    assert.deepEqual(stored.schedule, []);
    assert.equal(stored.studySchedule, undefined);
  } finally { await f.stop(); }
});
