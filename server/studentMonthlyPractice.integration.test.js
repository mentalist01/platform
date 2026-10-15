import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('report API includes dated homework counts and the teacher catalog topic title', { timeout: 60000 }, async () => {
  const now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  const fixture = await createGroupHomeworkFixture(undefined, write => write('progress', { 'student-a': {
    progress: {},
    homeworks: [{ id: 'practice-homework', issuedAt: `${month}-01T00:00:00Z`, dueAt: new Date(now - 1000).toISOString(), goals: [{ type: 'task', taskNumber: 4, levelId: 'basic', targetQuestionIds: ['ege-question'], targetQuestions: [1] }] }],
    solvedEvents: [{ id: 'practice-event', taskNumber: 4, levelId: 'basic', questionId: 'ege-question', solvedAt: new Date(now - 2000).toISOString() }],
  } }));
  try {
    const report = await fixture.request(`/api/student-month-report?studentId=student-a&month=${month}`, fixture.tokens['teacher-a']);
    assert.equal(report.metrics.homework.solvedTaskCount, 1, JSON.stringify(report.metrics.homework));
    assert.equal(report.metrics.homework.practice[0].taskNumber, 4);
    assert.match(report.metrics.homework.practice[0].title, /Кодирование/);
    assert.match(report.parentText, /решила 1 задачу по заданию ЕГЭ №4/);
  } finally { await fixture.stop(); }
});
