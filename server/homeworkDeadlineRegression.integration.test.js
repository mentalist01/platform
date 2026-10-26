import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { HomeworkLivesStore } from './homeworkLives.js';

const DAY = 86400000;

test('reading yesterday homework and assigning a new one preserves the old deadline and answers', { timeout: 60000 }, async () => {
  const now = Date.now(), issuedAt = new Date(now - 3 * DAY).toISOString(), dueAt = new Date(now - DAY).toISOString();
  const nextDay = new Date(now + 2 * DAY).toISOString().slice(0, 10);
  const old = { id: 'old', issuedAt, updatedAt: issuedAt, dueAt, dueAtMode: 'next-lesson', calendarOffsetMinutes: 180,
    homeWork: 'Прошлая работа', goals: [{ type: 'task', taskNumber: 4, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['ege-question'] }] };
  const f = await createGroupHomeworkFixture(undefined, write => {
    write('progress', { 'student-c': { schedule: [{ id: 'next', date: nextDay, time: '17:00' }],
      nextLesson: old, homeworks: [old], solvedByTask: { 4: { basic: { solved: ['ege-question'], answerHistory: { 'ege-question': [{ correct: true, submittedAt: new Date(now - 2 * DAY).toISOString() }] } } } } } });
  });
  try {
    for (const who of ['student-c', 'teacher-b', 'student-c']) {
      const value = await f.request('/api/student-next-lesson?studentId=student-c', f.tokens[who]);
      assert.equal(value.homeworks[0].dueAt, dueAt, 'A read must not renew the previous assignment');
      assert.equal(value.homeworks[0].deadlineAdjustedAt, undefined);
    }
    const before = JSON.parse(fs.readFileSync(path.join(f.data, 'progress.json')))['student-c'];
    const result = await f.request('/api/student-next-lesson', f.tokens['teacher-b'], {
      studentId: 'student-c', homeWork: 'Новая работа', dueAtMode: 'next-lesson', calendarOffsetMinutes: 180,
      goals: [{ type: 'task', taskNumber: 4, levelId: 'basic', targetQuestions: [1] }],
    }, 'PATCH');
    assert.equal(result.homeworks.length, 2);
    assert.notEqual(result.homeworks[0].id, old.id);
    assert.equal(result.homeworks[0].dueAt, nextDay + 'T14:00:00.000Z');
    assert.deepEqual(result.homeworks.find(entry => entry.id === old.id), before.homeworks[0]);
    const after = JSON.parse(fs.readFileSync(path.join(f.data, 'progress.json')))['student-c'];
    assert.deepEqual(after.solvedByTask, before.solvedByTask);
    assert.equal((await f.request('/api/student-next-lesson', f.tokens['student-c'])).homeworks.find(entry => entry.id === old.id).dueAt, dueAt);
  } finally { await f.stop(); }
});

test('lives use each pupil personal mock followups without contaminating the shared teacher bank', { timeout: 60000 }, async () => {
  const now = Date.now(), issuedAt = new Date(now - 3 * DAY).toISOString(), dueAt = new Date(now - DAY).toISOString();
  const f = await createGroupHomeworkFixture(undefined, (write, directory) => {
    const store = new HomeworkLivesStore(path.join(directory, 'homework-lives.json'), { now: () => now - 4 * DAY });
    store.configure('teacher-a', true);
    write('students', JSON.parse(fs.readFileSync(path.join(directory, 'students.json'))).map(student => ({ ...student, createdAt: new Date(now - 90 * DAY).toISOString() })));
    write('tests', { 22: { basic: [{ id: 'bank-question', answer: '10' }] } });
    const homework = { id: 'assignment', issuedAt, dueAt, homeWork: 'Задание из пробника и обычное',
      goals: [{ type: 'task', taskNumber: 22, levelId: 'basic', targetQuestions: [1, 2], targetQuestionIds: ['personal-question', 'bank-question'] }] };
    const personal = { sourceKey: 'exam/attempt/22', sourceMockTaskNumber: 22, destinationTaskNumber: 22, levelId: 'basic',
      question: { id: 'personal-question', question: 'Личная задача из пробника', answer: '42' } };
    const data = id => ({ homeworks: [{ ...homework, id: homework.id + '-' + id }],
      mockTestingQueue: id === 'student-a' ? [personal] : [],
      solvedByTask: { 22: { basic: { solved: ['personal-question'], answerHistory: { 'personal-question': [{ correct: true, submittedAt: new Date(now - 2 * DAY).toISOString() }] } } } } });
    write('progress', { 'student-a': data('student-a'), 'student-b': data('student-b') });
  });
  try {
    const before = fs.readFileSync(path.join(f.data, 'tests.json'), 'utf8');
    const overview = await f.request('/api/teacher-homework-lives', f.tokens['teacher-a']);
    assert.equal(overview.students.find(student => student.studentId === 'student-a').needsReview, false);
    assert.equal(overview.students.find(student => student.studentId === 'student-b').needsReview, true);
    const status = await f.request('/api/homework-lives', f.tokens['student-a']);
    assert.equal(status.history[0].reliable, true);
    assert.equal(status.history[0].percent, 50);
    assert.equal(status.history[0].totalCount, 2);
    assert.equal(status.history[0].completedCount, 1);
    assert.ok(status.remaining < 3);
    assert.equal(fs.readFileSync(path.join(f.data, 'tests.json'), 'utf8'), before);
    await f.request('/api/homework-lives?studentId=student-a', f.tokens['teacher-b'], undefined, 'GET', 403);
  } finally { await f.stop(); }
});
