import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { HomeworkLivesStore, livesMonth, estimateHomeworkPlan } from './homeworkLives.js';

test('API exempts Python, repairs old damage and reports EGE without altering assignments or solutions', { timeout: 60000 }, async () => {
  const now = Date.now(), ago = days => new Date(now - days * 86400000).toISOString();
  const homework = (id, goals) => ({ id, issuedAt: ago(4), dueAt: ago(1), goals });
  const py = { type: 'task', taskNumber: 101, levelId: 'python', targetQuestions: [1], targetQuestionIds: ['python-question'] };
  const ege = { type: 'task', taskNumber: 4, levelId: 'basic', targetQuestions: [1], targetQuestionIds: ['ege-question'] };
  const f = await createGroupHomeworkFixture(undefined, (write, directory) => {
    const store = new HomeworkLivesStore(path.join(directory, 'homework-lives.json'), { now: () => now - 6 * 86400000 });
    store.configure('teacher-a', true);
    write('students', JSON.parse(fs.readFileSync(path.join(directory, 'students.json'), 'utf8')).map(s => ({ ...s, createdAt: ago(90) })));
    write('progress', {
      'student-a': { homeworks: [homework('mixed', [py, ege])], solvedByTask: { 4: { basic: { solved: ['ege-question'], answerHistory: { 'ege-question': [{ correct: true, submittedAt: ago(2) }] } } } } },
      'student-b': { homeworks: [homework('python-only', [py])], solvedByTask: { 101: { python: { solved: [], answerHistory: { 'python-question': [{ correct: false, submittedAt: ago(2) }] } } } } },
    });
    for (const [id, eventId] of [['student-a', 'mixed'], ['student-b', 'python-only']]) {
      const row = store.record({ id, teacherId: 'teacher-a' });
      row.months[livesMonth(now)] = { plannedCount: 4, events: { [eventId]: { id: eventId, percent: 50, loss: 1, reliable: true, dueAt: ago(1), totalCount: 2, completedCount: 1 } } };
    }
    store.save();
  });
  try {
    const before = fs.readFileSync(path.join(f.data, 'progress.json'), 'utf8');
    const mixed = await f.request('/api/homework-lives', f.tokens['student-a']);
    assert.equal(mixed.remaining, 3);
    assert.equal(mixed.history[0].percent, 100);
    assert.equal(mixed.history[0].totalCount, 1);
    assert.equal(mixed.history[0].previousAssessment.percent, 50);
    const practice = await f.request('/api/homework-lives', f.tokens['student-b']);
    assert.equal(practice.remaining, 3);
    assert.equal(practice.history[0].waivedById, 'python-practice-policy');
    const month = livesMonth(now);
    const report = await f.request(`/api/student-month-report?studentId=student-a&month=${month}`, f.tokens['teacher-a']);
    assert.equal(report.metrics.homework.averagePercent, 100);
    assert.equal(report.metrics.homework.practice.find(g => g.taskNumber === 4).solvedCount, 1);
    const practiceReport = await f.request(`/api/student-month-report?studentId=student-b&month=${month}`, f.tokens['teacher-a']);
    assert.equal(practiceReport.metrics.homework.averagePercent, 100);
    assert.equal(practiceReport.metrics.homework.practiceOnly, true);
    assert.equal(practiceReport.metrics.homework.evaluatedCount, 0);
    assert.equal(practiceReport.metrics.homework.pythonPracticeCount, 1);
    assert.doesNotMatch(practiceReport.parentText, /очень плохо|слабый результат|(?<!\d)0%/u);
    const parent = await f.request('/api/parent/login', '', { code: 'student-b-code' });
    const overview = await f.request('/api/parent/overview', parent.token);
    assert.equal(overview.homework.summary.averagePercent, 100);
    assert.equal(overview.homework.summary.practiceOnly, true);
    assert.equal(overview.homework.summary.homeworkCount, 0);
    assert.equal(overview.homework.summary.fullyCompletedCount, 0);
    assert.equal(fs.readFileSync(path.join(f.data, 'progress.json'), 'utf8'), before);
    await f.request('/api/student-month-report?studentId=student-a', f.tokens['teacher-b'], undefined, 'GET', 403);
  } finally { await f.stop(); }
});

test('automatic EGE homework plan omits explicitly marked Python lessons', () => {
  assert.equal(estimateHomeworkPlan([
    { weekdayKey: 'wednesday', time: '20:00', subject: 'ЕГЭ' },
    { weekdayKey: 'friday', time: '20:00', subject: 'Python' },
    { weekdayKey: 'monday', time: '20:00', studyTrack: 'python' },
  ], '2026-10'), 4);
});
