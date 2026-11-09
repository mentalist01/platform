import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { addCalendarDays, moscowDay, weekdayIndex } from '../src/utils/groupAvailability.js';

test('preparation API: finite local plan, ownership, early join frees only own future lessons', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  const teacher = f.tokens['teacher-a'], path = '/api/students/student-b/group-preparation';
  try {
    await f.request(`/api/learning-groups/${f.groupId}/members/student-b`, teacher, undefined, 'DELETE');
    const date = addCalendarDays(moscowDay(), 14);
    const lessonSchedule = { count: 3, startDate: date, durationMinutes: 40, slots: [{ day: weekdayIndex(date), time: '10:00' }] };
    const body = { groupId: f.groupId, note: 'Индивидуальная подготовка', revision: '', lessonSchedule };
    await f.request(path, f.tokens['teacher-b'], body, 'PATCH', 403);
    await f.request(path, f.tokens['student-b'], body, 'PATCH', 403);
    await f.request(path, teacher, { ...body, lessonSchedule: { ...lessonSchedule, count: 0 } }, 'PATCH', 400);
    const { plan } = await f.request(path, teacher, body, 'PATCH');
    assert.equal(plan.lessonPlan.lessons.length, 3);
    assert.ok(plan.lessonPlan.lessons.every(lesson => lesson.syncStatus === 'pending'));
    const schedule = await f.request('/api/student-schedule', f.tokens['student-b']);
    const prep = schedule.filter(entry => entry.preparationPlanId);
    assert.equal(prep.length, 3);
    assert.deepEqual(prep.map(entry => entry.date), [date, addCalendarDays(date, 7), addCalendarDays(date, 14)]);
    await f.request(path, teacher, { ...body, revision: plan.revision }, 'PATCH', 409);
    const ordinary = await f.request('/api/student-schedule', teacher, { studentId: 'student-b', date, time: '15:00', durationMinutes: 60 });
    const preview = await f.request(`${path}/preview`, teacher);
    assert.equal(preview.preparationLessonsToCancel.length, 3);
    const joined = await f.request(`${path}/join`, teacher, { revision: plan.revision, assignmentIds: [] });
    assert.ok(joined.plan.lessonPlan.lessons.every(lesson => lesson.cancelled));
    const remaining = await f.request('/api/student-schedule', f.tokens['student-b']);
    assert.ok(remaining.some(entry => entry.id === ordinary.id));
    assert.ok(!remaining.some(entry => entry.preparationPlanId));
    await f.request(`${path}/join`, teacher, { revision: plan.revision, assignmentIds: [] });
    assert.equal((await f.request('/api/student-group-preparations', teacher)).plans['student-b'].lessonPlan.lessons.length, 3);
  } finally { await f.stop(); }
});
