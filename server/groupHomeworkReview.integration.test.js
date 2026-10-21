import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHomeworkReviewFixture } from './groupHomeworkReview.fixture.js';

test('group homework review shows exact recipients, isolated assignment results, corrected errors and private code', { timeout: 60000 }, async () => {
  const f = await createHomeworkReviewFixture();
  const route = `/api/learning-groups/${f.groupId}/assignments/review-ege/homework-review`, teacher = f.tokens['teacher-a'];
  try {
    const before = fs.readFileSync(path.join(f.data, 'progress.json'), 'utf8');
    const overview = await f.request(route, teacher);
    const anna = overview.members.find(m => m.studentId === 'student-a');
    assert.deepEqual(anna.summary, { total: 5, completed: 2, clean: 1, corrected: 1, wrong: 1, untouched: 2,
      percent: 40, errors: 2, checklistTotal: 0, checklistCompleted: 0 });
    assert.equal(overview.members.find(m => m.studentId === 'student-b').status, 'not-assigned');
    assert.equal('items' in anna, false, 'The overview does not ship question banks or answer histories');
    const detail = await f.request(route + '/student-a', teacher);
    assert.equal(detail.items.length, 5);
    assert.equal(detail.items.find(i => i.questionId === 'fixed').questionNumber, 3, 'Question ids survive bank reordering');
    assert.equal(detail.items.find(i => i.questionId === 'fixed').hadErrors, true);
    assert.equal(detail.items.find(i => i.questionId === 'fixed').solved, true);
    assert.deepEqual(detail.items.find(i => i.questionId === 'wrong').studentAnswers, ['8']);
    assert.equal(detail.items.find(i => i.questionId === 'old').answerHistory.length, 0, 'An older unrelated error does not enter this homework review');
    assert.equal(fs.readFileSync(path.join(f.data, 'progress.json'), 'utf8'), before, 'Viewing work never changes homework, rewards, schedules or saved progress');
    await f.request(route, f.tokens['student-a'], undefined, 'GET', 403);
    await f.request(route + '/student-a', f.tokens['student-b'], undefined, 'GET', 403);
    await f.request(route, f.tokens['teacher-b'], undefined, 'GET', 403);
    await f.request(route + '/student-b', teacher, undefined, 'GET', 403);
    await f.request(route.replace('review-ege', 'missing'), teacher, undefined, 'GET', 404);
    const python = await f.request(route.replace('review-ege', 'review-python'), teacher);
    assert.equal(python.members[0].summary.total, 1); assert.equal(python.members[0].summary.completed, 0);
    const multiple = await f.request(route.replace('review-ege', 'review-multi') + '/student-a', teacher);
    assert.equal(multiple.items[0].question.answerCountOverride, 2);
    assert.deepEqual(multiple.items[0].question.answers, ['1', '2'], 'The group review uses the same answer rules as the regular homework');
    await f.request('/api/progress/question-code', f.tokens['student-a'], { taskNumber: 4, levelId: 'basic', questionId: 'wrong', code: 'print(8)', input: '' }, 'PATCH');
    assert.equal((await f.request('/api/progress/question-code?studentId=student-a&taskNumber=4&levelId=basic&questionId=wrong', teacher)).code, 'print(8)');
  } finally { await f.stop(); }
});
