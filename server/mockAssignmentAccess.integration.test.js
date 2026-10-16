import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { getMonthlyMockMonth } from '../src/utils/monthlyMockExam.js';
import { buildMockExamProgressEntries } from '../src/utils/mockExamProgress.js';

test('students can start only published monthly exams or actual homework; staff retains unassigned history', { timeout: 45000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-assignment-access-'));
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value));
  const stored = name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`)));
  const hash = code => `scrypt$assignment$${crypto.scryptSync(code, 'assignment', 64).toString('base64')}`;
  const month = getMonthlyMockMonth();
  write('teachers', [{ id: 't', name: 'Teacher', codeHash: hash('teacher-code') }]);
  write('students', ['s', 'peer'].map(id => ({ id, name: id, code: `${id}-code`, teacherId: 't', grade: '11' })));
  write('tests', {});
  const exam = id => ({ id, title: id, tasks: { 1: { question: '1', answer: '1' } }, access: { all: true, students: [], mode: 'classic' } });
  write('mock-exams', [exam('ordinary'), { ...exam('monthly'), monthlyAssignments: { t: [month] } }]);
  const oldAttempt = { mode: 'classic', answers: { 1: '1' }, solved: { 1: true }, finishedAt: new Date().toISOString(), attemptId: 'self-old' };
  const oldResult = { ...oldAttempt, examId: 'ordinary', tasks: exam('ordinary').tasks, secondaryScore: 7 };
  write('progress', { s: { homeworks: [], mockAttempts: { ordinary: oldAttempt }, mockAttemptResults: [oldResult] }, peer: { homeworks: [] } });
  const port = await new Promise(resolve => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); }); });
  const child = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: 'test', PLATFORM_DATA_DIR: dataDir, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', chunk => logs += chunk); child.stderr.on('data', chunk => logs += chunk);
  const request = (route, token = '', method = 'GET', body) => fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { Authorization: token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async (response, status = 200) => { const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result; };
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { try { if ((await request('/api/client-build-version')).ok) break; } catch { /* starting */ } await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(child.exitCode, null, logs);
    const login = async code => `Bearer ${(await json(await request('/api/login', '', 'POST', { code }))).token}`;
    const student = await login('s-code'), teacher = await login('teacher-code'), peer = await login('peer-code');
    assert.deepEqual((await json(await request('/api/mock-exams', student))).map(exam => exam.id), ['monthly']);
    await json(await request('/api/mock-exams/attempt?examId=ordinary', student), 403);
    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'ordinary', mode: 'classic', assignmentSource: 'monthly', startOnly: true }), 403);
    await json(await request('/api/mock-exams/random', student, 'POST', { levelId: 'basic' }), 403);
    assert.deepEqual(stored('progress').s.mockAttempts.ordinary, oldAttempt);
    await json(await request('/api/mock-exams/attempt/history?examId=ordinary&studentId=s', teacher));
    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'monthly', mode: 'classic', startOnly: true }));
    assert.equal(stored('progress').s.mockAttempts.monthly.assignmentSource, 'monthly');
    await json(await request('/api/student-next-lesson', teacher, 'PATCH', { studentId: 's', homeWork: 'Пробник', goals: [{ type: 'mock', mockExamId: 'ordinary', mode: 'classic' }], daysToComplete: 7 }));
    const list = await json(await request('/api/mock-exams', student));
    assert.equal(list.find(exam => exam.id === 'ordinary').canStart, true);
    assert.ok(!(await json(await request('/api/mock-exams', peer))).some(exam => exam.id === 'ordinary'));
    const started = await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'ordinary', mode: 'classic', startOnly: true }));
    assert.equal(started.assignmentSource, 'homework');
    assert.notEqual(started.attemptId, 'self-old');
    await json(await request('/api/mock-exams/attempt', student, 'PUT', { examId: 'ordinary', mode: 'classic', answers: { 1: '1' }, finishAttempt: true }));
    const saved = stored('progress').s;
    const result = saved.mockAttemptResults.find(result => result.attemptSnapshot?.assignmentSource === 'homework');
    assert.equal(result.attemptSnapshot.assignmentSource, 'homework');
    assert.ok(saved.mockAttemptResults.some(result => result.attemptId === 'self-old'), 'old self-attempt remains in history');
    const official = buildMockExamProgressEntries({ assignedOnly: true, teacherId: 't', studentData: saved, mockExams: stored('mock-exams'), mockAttemptsByExam: saved.mockAttempts });
    assert.equal(official.length, 1);
    assert.equal(official[0].attemptId, result.attemptId);
    const clientData = await json(await request('/api/student-data', student));
    assert.equal(clientData.mockAttemptResults[0].attemptId, result.attemptId, 'a previous self-attempt cannot hide the official first result');
    assert.equal(clientData.mockAttemptResults[0].assignedForStatistics, true);
    const clientEntries = buildMockExamProgressEntries({ assignedOnly: true, studentData: clientData, mockExams: list, mockAttemptsByExam: clientData.mockAttempts });
    assert.equal(clientEntries.length, 1);
  } finally {
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    if (path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(root, { recursive: true, force: true });
  }
});
