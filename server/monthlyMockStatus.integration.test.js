import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getMonthlyMockMonth, getMonthlyMockPeriod } from '../src/utils/monthlyMockExam.js';

test('monthly status scopes student data and preserves legacy and repeated completions', { timeout: 45_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-monthly-mock-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const now = new Date().toISOString();
  const month = getMonthlyMockMonth();
  const period = getMonthlyMockPeriod(month);
  const finishedAt = new Date(period.startMs + 1000).toISOString();
  const salt = 'monthly-mock-test';
  const hash = (code) => `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`;
  write('teachers.json', ['a', 'b'].map((id) => ({ id: `teacher-${id}`, name: id, codeHash: hash(`teacher-${id}-code`), createdAt: now })));
  write('students.json', [
    { id: 'old', teacherId: 'teacher-a' }, { id: 'new', teacherId: 'teacher-a' },
    { id: 'legacy', teacherId: 'teacher-a' }, { id: 'other', teacherId: 'teacher-b' },
    { id: 'deleted', teacherId: 'teacher-a', deletedAt: now },
    { id: 'former', teacherId: 'teacher-a', studyStatus: 'inactive' },
    { id: 'graduate', teacherId: 'teacher-a', grade: 'graduate' },
  ].map((student) => ({ name: student.id, code: `${student.id}-code`, grade: '11', createdAt: now, ...student })));
  write('tests.json', {});
  const exam = { id: 'exam', title: 'Пробник', createdAt: now, access: { all: true, students: [], mode: 'timer' }, tasks: { 1: { question: 'Один', answer: '1' }, 2: { question: 'Два', answer: '2' } } };
  write('mock-exams.json', [exam]);
  write('progress.json', {
    old: { mockAttemptResults: [{ examId: 'exam', finishedAt, tasks: exam.tasks, primaryScore: 0 }] },
    legacy: { mockAttempts: { exam: { mode: 'timer', timerStartedAt: new Date(period.startMs).toISOString(), timerFinishedAt: finishedAt, updatedAt: finishedAt, answers: { 1: 'wrong' }, attemptNumber: 2 } } },
  });
  const port = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(() => resolve(value)); });
  });
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const request = (url, token = '', method = 'GET', body) => fetch(`${base}${url}`, { method, headers: { Authorization: token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async (response, status = 200) => { const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value)); return value; };
  try {
    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline && child.exitCode === null) {
      try { if ((await request('/api/client-build-version')).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const login = async (code) => `Bearer ${(await json(await request('/api/login', '', 'POST', { code }))).token}`;
    const teacher = await login('teacher-a-code');
    const otherTeacher = await login('teacher-b-code');
    const student = await login('new-code');
    const legacy = await login('legacy-code');
    assert.equal((await request('/api/monthly-mock-status')).status, 401);
    const roster = await json(await request('/api/monthly-mock-status?teacherId=teacher-b', teacher));
    assert.deepEqual(roster.summary, { total: 3, completed: 2, pending: 1 });
    assert.equal(roster.period.month, month);
    assert.equal(roster.rows.find((row) => row.studentId === 'old').status, 'completed');
    assert.equal(roster.rows.find((row) => row.studentId === 'new').status, 'pending');
    const own = await json(await request('/api/monthly-mock-status?studentId=old', student));
    assert.deepEqual(own.rows.map((row) => row.studentId), ['new']);
    const other = await json(await request('/api/monthly-mock-status', otherTeacher));
    assert.deepEqual(other.rows.map((row) => row.studentId), ['other']);
    await json(await request('/api/monthly-mock-status?month=bad', teacher), 400);
    await json(await request('/api/monthly-mock-status?month=2099-12', teacher), 400);
    const oldMonth = getMonthlyMockMonth(period.startMs - 1000);
    assert.equal((await json(await request(`/api/monthly-mock-status?month=${oldMonth}`, teacher))).summary.completed, 0);

    // Old repeat attempts can be overwritten by a timer restart; preserve them first.
    await json(await request('/api/mock-exams/attempt', legacy, 'PUT', { examId: 'exam', mode: 'timer', startOnly: true, restartTimerExam: true }));
    assert.equal((await json(await request('/api/monthly-mock-status', legacy))).rows[0].status, 'completed');
    const ledger = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'));
    assert.equal(ledger().legacy.monthlyMockCompletions[0].finishedAt, finishedAt);

    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'exam', mode: 'timer', startOnly: true }));
    assert.equal((await json(await request('/api/monthly-mock-status', student))).rows[0].status, 'in_progress');
    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'exam', mode: 'timer', finishTimerExam: true, answers: { 1: 'wrong' } }));
    const completed = (await json(await request('/api/monthly-mock-status', student))).rows[0];
    assert.equal(completed.status, 'completed');
    assert.equal(completed.completedCount, 1);
    assert.ok(!JSON.stringify(completed).includes('wrong'), 'answer data must not be returned');
    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'exam', mode: 'timer', startOnly: true, restartTimerExam: true }));
    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'exam', mode: 'timer', finishTimerExam: true, answers: { 1: '1', 2: '2' } }));
    assert.equal((await json(await request('/api/monthly-mock-status', student))).rows[0].completedCount, 2);
    assert.equal(ledger().new.monthlyMockCompletions.length, 2);
  } finally {
    if (child.exitCode === null) { const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await exited; }
    if (path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(root, { recursive: true, force: true });
  }
});
