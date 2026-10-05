import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('monthly publication hides the exam and blocks attempts until Moscow midnight, without changing progress', { timeout: 45_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-monthly-publication-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const clock = path.join(root, 'clock.txt');
  fs.writeFileSync(clock, String(Date.parse('2026-02-09T20:59:59.999Z')));
  const clockModule = path.join(root, 'clock.mjs');
  fs.writeFileSync(clockModule, `import fs from 'node:fs';
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [Date.now()])); }
  static now() { return Number(fs.readFileSync(process.env.PUBLICATION_TEST_CLOCK, 'utf8')); }
};`);
  const hash = code => `scrypt$publication-test$${crypto.scryptSync(code, 'publication-test', 64).toString('base64')}`;
  const month = '2026-02';
  write('teachers', ['a', 'b'].map(id => ({ id: `teacher-${id}`, name: id, codeHash: hash(`teacher-${id}-code`) })));
  write('students', ['a', 'group', 'b'].map(id => ({ id, teacherId: id === 'b' ? 'teacher-b' : 'teacher-a', name: id, code: `${id}-code`, grade: '11' })));
  write('tests', {});
  const tasks = { 1: { question: 'HIDDEN_MONTHLY_QUESTION', answer: '1' } };
  const exam = id => ({ id, title: id === 'scheduled' ? 'HIDDEN_MONTHLY_TITLE' : id, tasks, access: { all: true, students: [], mode: 'timer' } });
  write('mock-exams', [exam('scheduled'), exam('ordinary'), exam('replacement')]);
  const previousProgress = { a: { mockAttempts: { scheduled: { mode: 'classic', status: 'active', answers: { 1: 'draft' }, examSnapshot: exam('scheduled') } }, homeworks: [{ id: 'ordinary-homework', goals: [{ type: 'task', taskNumber: '4' }] }] } };
  write('progress', previousProgress);
  const port = await new Promise(resolve => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(() => resolve(value)); }); });
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['--import', pathToFileURL(clockModule).href, 'server/index.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PUBLICATION_TEST_CLOCK: clock, PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const request = (url, token = '', method = 'GET', body) => fetch(`${base}${url}`, { method, headers: { Authorization: token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async (response, status = 200) => { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; };
  const stored = name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`)));
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
    const groupStudent = await login('group-code');
    const otherStudent = await login('b-code');
    const mark = (token, id, day = 10, assigned = true) => request(`/api/mock-exams/${id}`, token, 'PATCH', { monthlyAssignment: { month, assigned, publicationDay: day } });
    await json(await mark(student, 'scheduled'), 403);
    for (const day of [0, 29, 31, 32, 1.5, '10', true, null]) await json(await mark(teacher, 'scheduled', day), 400);
    assert.ok(stored('mock-exams').every(entry => !entry.monthlyAssignments));
    const saved = await json(await mark(teacher, 'scheduled'));
    assert.deepEqual(saved.monthlyAssignedMonths, [month]);
    assert.equal(saved.monthlyPublicationDay, 10);
    assert.ok(!('monthlyPublicationDays' in saved));
    await json(await mark(otherTeacher, 'scheduled', 1));
    const listed = async token => json(await request('/api/mock-exams', token));
    const status = async token => json(await request('/api/monthly-mock-status', token));
    assert.equal((await listed(teacher)).find(entry => entry.id === 'scheduled').monthlyPublicationDay, 10);
    assert.equal((await listed(otherTeacher)).find(entry => entry.id === 'scheduled').monthlyPublicationDay, 1);
    for (const token of [student, groupStudent]) {
      assert.ok(!(await listed(token)).some(entry => entry.id === 'scheduled'));
      assert.ok((await listed(token)).some(entry => entry.id === 'ordinary'));
      const monthly = await status(token);
      assert.equal(monthly.assignment, null);
      assert.equal(monthly.publicationPending, true);
      assert.ok(!JSON.stringify(monthly).includes('HIDDEN_MONTHLY'));
      await json(await request('/api/mock-exams/attempt?examId=scheduled', token), 403);
      await json(await request('/api/mock-exams/attempt', token, 'PUT', { examId: 'scheduled', mode: 'timer', startOnly: true }), 403);
      await json(await request('/api/mock-exams/attempt/history?examId=scheduled', token), 403);
    }
    assert.equal((await status(otherStudent)).assignment.examId, 'scheduled');
    const safeProgress = await json(await request('/api/student-data?studentId=a', student));
    assert.ok(!JSON.stringify(safeProgress).includes('HIDDEN_MONTHLY'));
    assert.deepEqual(safeProgress.homeworks, previousProgress.a.homeworks);
    assert.deepEqual(stored('progress').a.mockAttempts, previousProgress.a.mockAttempts, 'blocked starts do not overwrite saved work');
    await json(await request('/api/mock-exams/scheduled', teacher, 'PATCH', { monthlyAssignment: { month, assigned: true } }));
    assert.equal(stored('mock-exams')[0].monthlyPublicationDays['teacher-a'][month], 10, 'old clients retain the saved day');

    fs.writeFileSync(clock, String(Date.parse('2026-02-09T21:00:00Z')));
    const published = (await listed(student)).find(entry => entry.id === 'scheduled');
    assert.ok(published);
    assert.ok(!('answer' in published.tasks[1]));
    assert.ok(!JSON.stringify(published).includes('teacher-b'));
    assert.ok(!('monthlyPublicationDays' in published));
    assert.equal((await status(student)).publicationPending, false);
    assert.equal((await status(student)).assignment.examId, 'scheduled');
    await json(await request('/api/mock-exams/attempt?examId=scheduled', student));
    await json(await request('/api/mock-exams/attempt', groupStudent, 'PUT', { examId: 'scheduled', mode: 'timer', startOnly: true }));
    assert.equal((await status(groupStudent)).rows[0].status, 'in_progress');
    assert.ok((await json(await request('/api/student-data?studentId=a', student))).mockAttempts.scheduled);

    await json(await mark(teacher, 'replacement', 28));
    assert.equal((await status(student)).assignment, null);
    assert.ok(!stored('mock-exams')[0].monthlyPublicationDays['teacher-a']);
    assert.equal(stored('mock-exams')[0].monthlyPublicationDays['teacher-b'][month], 1);
    await json(await mark(teacher, 'replacement', 28, false));
    assert.equal((await status(student)).publicationPending, false);
    assert.ok((await listed(student)).some(entry => entry.id === 'replacement'), 'removing monthly designation restores ordinary access');
    assert.deepEqual(stored('progress').a.homeworks, previousProgress.a.homeworks);
  } finally {
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    if (path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(root, { recursive: true, force: true });
  }
});
