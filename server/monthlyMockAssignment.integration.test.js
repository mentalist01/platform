import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getMonthlyMockMonth } from '../src/utils/monthlyMockExam.js';

test('monthly mock publication is scoped, replaces one month and launches a whole exam', { timeout: 45_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-monthly-assignment-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const now = new Date().toISOString();
  const month = getMonthlyMockMonth();
  const hash = code => `scrypt$monthly-test$${crypto.scryptSync(code, 'monthly-test', 64).toString('base64')}`;
  write('teachers', ['a', 'b'].map(id => ({ id: `teacher-${id}`, name: id, codeHash: hash(`teacher-${id}-code`), createdAt: now })));
  write('students', ['a', 'group', 'b'].map(id => ({ id, teacherId: id === 'b' ? 'teacher-b' : 'teacher-a', name: id, code: `${id}-code`, grade: '11', createdAt: now })));
  write('tests', {});
  const tasks = { 1: { question: 'Один', answer: '1' }, 2: { question: 'Два', answer: '2' } };
  const exam = (id, access = { all: true, students: [], mode: 'timer' }) => ({ id, title: `Пробник ${id}`, tasks, access, createdAt: now });
  write('mock-exams', [exam('first'), exam('second'), exam('private', { all: false, students: [], mode: 'timer' }), { ...exam('empty'), tasks: {} }]);
  const homework = { id: 'hw', issuedAt: now, goals: [{ type: 'mock', mockExamId: 'first', mode: 'classic', targetTaskKeys: ['1'] }] };
  write('progress', {
    a: { homeworks: [homework], mockAttempts: { first: { mode: 'classic', status: 'active', targetTaskKeys: ['1'], homeworkId: 'hw', answers: { 1: '1' }, updatedAt: now } } },
    group: { mockAttempts: { second: { status: 'finished', finishedAt: now, mode: 'timer', answers: { 1: '1', 2: '2' } } } },
  });
  const port = await new Promise(resolve => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(() => resolve(value)); }); });
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const request = (url, token = '', method = 'GET', body) => fetch(`${base}${url}`, { method, headers: { Authorization: token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async (response, status = 200) => { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; };
  const storedExams = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'mock-exams.json')));
  try {
    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline && child.exitCode === null) {
      try { if ((await request('/api/client-build-version')).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const login = async code => `Bearer ${(await json(await request('/api/login', '', 'POST', { code }))).token}`;
    const teacher = await login('teacher-a-code');
    const otherTeacher = await login('teacher-b-code');
    const student = await login('a-code');
    const groupedStudent = await login('group-code');
    const otherStudent = await login('b-code');
    const assignment = { month, assigned: true };
    const mark = (id, token = teacher, value = assignment, extra = {}) => request(`/api/mock-exams/${id}`, token, 'PATCH', { ...extra, monthlyAssignment: value });
    assert.equal((await mark('first', student)).status, 403);
    await json(await mark('private'), 400);
    await json(await mark('empty'), 400);
    await json(await mark('first', teacher, { month: '2099-12', assigned: true }), 400);
    assert.ok(storedExams().every(entry => !entry.monthlyAssignments));
    const reviewUrl = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Review_Secret';
    assert.equal((await request('/api/mock-exams/first', student, 'PATCH', { monthlyReviewVideoUrl: reviewUrl })).status, 403);
    await json(await request('/api/mock-exams/first', teacher, 'PATCH', { monthlyReviewVideoUrl: 'javascript:alert(1)' }), 400);
    const first = await json(await mark('first', teacher, assignment, { monthlyReviewVideoUrl: reviewUrl }));
    assert.equal(first.monthlyReviewVideoUrl, reviewUrl);
    assert.ok(!('monthlyReviewVideos' in first));
    assert.equal((await request('/api/mock-exams/first/monthly-review', student)).status, 403);
    assert.equal((await json(await request('/api/mock-exams/first/monthly-review', teacher))).url, reviewUrl);
    assert.equal((await json(await request('/api/mock-exams/first/monthly-review', otherTeacher))).url, '');
    assert.equal((await json(await request('/api/mock-exams', otherTeacher))).find(entry => entry.id === 'first').monthlyReviewVideoUrl, '');
    assert.deepEqual(first.monthlyAssignedMonths, [month]);
    assert.ok(!('monthlyAssignments' in first), 'internal teacher map stays private');
    const getStatus = token => request('/api/monthly-mock-status', token).then(json);
    const own = await getStatus(student);
    assert.equal(own.assignment.examId, 'first');
    assert.equal(own.assignment.taskCount, 2);
    assert.equal(own.rows[0].status, 'pending', 'a partial attempt does not satisfy the monthly exam');
    assert.equal(own.assignment.hasReviewVideo, true);
    assert.ok(!JSON.stringify(own).includes('Review_Secret'), 'locked review URL never leaves the server');
    assert.equal((await getStatus(groupedStudent)).assignment.examId, 'first');
    assert.equal((await getStatus(groupedStudent)).rows[0].status, 'pending', 'another completed variant does not count');
    assert.equal((await getStatus(otherStudent)).assignment, null);
    const studentExams = await json(await request('/api/mock-exams', student));
    assert.deepEqual(studentExams.find(entry => entry.id === 'first').requiredTargetTaskKeys, []);
    assert.ok(!JSON.stringify(studentExams).includes('teacher-b'));
    assert.ok(!JSON.stringify(studentExams).includes('Review_Secret'));
    assert.ok(!JSON.stringify(studentExams).includes('monthlyReviewVideos'));
    assert.ok(!JSON.stringify(own.assignment).includes('answer'));
    const attempt = await json(await request('/api/mock-exams/attempt?examId=first', student));
    assert.equal(attempt.requiredMode, 'timer');
    assert.ok(!JSON.stringify(attempt).includes('Review_Secret'), 'attempt snapshots do not disclose the review');
    assert.deepEqual(attempt.targetTaskKeys || [], []);
    const started = await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'first', mode: 'timer', startOnly: true }));
    assert.deepEqual(started.targetTaskKeys || [], []);
    assert.equal((await getStatus(student)).rows[0].status, 'in_progress');
    assert.ok(!(await getStatus(student)).assignment.reviewVideoUrl);
    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'first', mode: 'timer', finishTimerExam: true, answers: { 1: '1', 2: '2' } }));
    assert.equal((await getStatus(student)).rows[0].status, 'completed');
    assert.equal((await getStatus(student)).assignment.reviewVideoUrl, reviewUrl);
    assert.ok(!(await getStatus(groupedStudent)).assignment.reviewVideoUrl, 'another student finishing another variant does not unlock this video');
    const progress = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json')));
    assert.deepEqual(progress.a.homeworks[0].goals, [homework.goals[0]], 'ordinary homework is preserved');
    await json(await mark('second', otherTeacher));
    await json(await mark('second'));
    assert.equal((await getStatus(student)).assignment.examId, 'second');
    assert.equal((await getStatus(student)).rows[0].status, 'pending');
    assert.equal((await getStatus(otherStudent)).assignment.examId, 'second');
    assert.equal(storedExams().find(entry => entry.id === 'first').monthlyAssignments['teacher-a'], undefined);
    await json(await mark('second', teacher, { month, assigned: false }));
    assert.equal((await getStatus(student)).assignment, null);
    assert.equal((await getStatus(otherStudent)).assignment.examId, 'second');
    await json(await mark('private', teacher, assignment, { access: { all: true, students: [], mode: 'timer' } }));
    assert.equal((await getStatus(student)).assignment.examId, 'private');
    // The designation is stored on disk, not only in the response.
    assert.deepEqual(storedExams().find(entry => entry.id === 'private').monthlyAssignments['teacher-a'], [month]);
    const { code } = await json(await request('/api/desktop-recording/pair', teacher, 'POST', {}));
    const device = await json(await request('/api/desktop-recorder/pair', '', 'POST', { code, name: 'Fake review PC' }));
    const deviceToken = `Bearer ${device.token}`;
    await json(await request('/api/desktop-recorder/mock-review/catalog', student, 'POST', {}), 401);
    const catalog = await json(await request('/api/desktop-recorder/mock-review/catalog', deviceToken, 'POST', {}));
    assert.deepEqual(catalog.exams.map(entry => entry.id), ['private']);
    const publication = { teacherId: 'teacher-a', examId: 'private', month, recordingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expectedUrl: '', url: reviewUrl };
    await json(await request('/api/desktop-recorder/mock-review/material', deviceToken, 'POST', { ...publication, teacherId: 'teacher-b' }), 403);
    const attached = await json(await request('/api/desktop-recorder/mock-review/material', deviceToken, 'POST', publication), 201);
    assert.equal(attached.created, true);
    assert.equal((await json(await request('/api/desktop-recorder/mock-review/material', deviceToken, 'POST', publication))).created, false);
    assert.ok(!(await getStatus(student)).assignment.reviewVideoUrl, 'finishing the previous month variant does not unlock a new assigned variant');
    await json(await request('/api/mock-exams/private', teacher, 'PATCH', { monthlyReviewVideoUrl: 'https://rutube.ru/video/changed/' }));
    await json(await request('/api/desktop-recorder/mock-review/material', deviceToken, 'POST', publication), 409);
    assert.equal(storedExams().find(entry => entry.id === 'private').monthlyReviewVideos['teacher-a'].url, 'https://rutube.ru/video/changed/');
  } finally {
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    if (path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(root, { recursive: true, force: true });
  }
});
