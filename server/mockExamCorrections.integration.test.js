import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '..');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => (error ? reject(error) : resolve(port)));
  });
});

const waitForServer = async (baseUrl, child, getLogs) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before startup.\n${getLogs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The server socket is expected to refuse connections during startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start in time.\n${getLogs()}`);
};

const stopServer = async (child) => {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const buildCodeHash = (code) => {
  const salt = Buffer.from('mock-exam-corrections-salt').toString('base64');
  const hash = crypto.scryptSync(code, salt, 64).toString('base64');
  return `scrypt$${salt}$${hash}`;
};

const assertStatus = async (response, expectedStatus) => {
  if (response.status === expectedStatus) return;
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
};

const login = async (baseUrl, code) => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  await assertStatus(response, 200);
  const session = await response.json();
  return `Bearer ${session.token}`;
};

test('mock exams accept answer variants and teacher corrections update the frozen result', {
  timeout: 50_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-mock-corrections-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
    id: 'teacher-a',
    name: 'Teacher A',
    codeHash: buildCodeHash('teacher-a-code'),
    createdAt: now,
  }]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
    id: 'student-a',
    name: 'Student A',
    teacherId: 'teacher-a',
    code: 'student-a-code',
    grade: '11',
    createdAt: now,
    deletedAt: null,
  }]));
  fs.writeFileSync(path.join(dataDir, 'tests.json'), '{}');
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
    'student-a': { xpTotal: 0, coinsTotal: 0, solvedByTask: {}, solvedEvents: [] },
  }));
  fs.writeFileSync(path.join(dataDir, 'mock-exams.json'), JSON.stringify([{
    id: 'exam-a',
    title: 'Пробник с исправлением',
    createdAt: now,
    updatedAt: now,
    access: { all: true, students: [], mode: 'classic' },
    tasks: {
      7: {
        id: 'task-7',
        question: 'Ответ 7656 или 7657',
        answer: '7657',
        acceptedAnswerVariants: [['7657'], ['7656']],
      },
      8: { id: 'task-8', question: 'Ответ right', answer: 'right' },
    },
  }]));

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverLogs = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PLATFORM_DATA_DIR: dataDir,
      PLATFORM_UPLOADS_DIR: uploadsDir,
      PLATFORM_JSON_BACKUPS_DIR: path.join(tempRoot, 'json-backups'),
      COLLAB_PERSISTENCE: '0',
      DISABLE_STARTUP_XP_REBALANCE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });

  const request = (pathname, authorization, method = 'GET', body) => fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: authorization,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  try {
    await waitForServer(baseUrl, child, () => serverLogs);
    const studentAuthorization = await login(baseUrl, 'student-a-code');
    const teacherAuthorization = await login(baseUrl, 'teacher-a-code');

    const visibleExamsResponse = await request('/api/mock-exams', studentAuthorization);
    await assertStatus(visibleExamsResponse, 200);
    const visibleExams = await visibleExamsResponse.json();
    assert.equal(Object.hasOwn(visibleExams[0].tasks['7'], 'acceptedAnswerVariants'), false);

    const finishResponse = await request('/api/mock-exams/attempt', studentAuthorization, 'PUT', {
      examId: 'exam-a',
      mode: 'classic',
      finishAttempt: true,
      answers: { 7: ' 7656 ', 8: 'wrong' },
      taskDurationsMs: { 7: 30_000, 8: 40_000 },
    });
    await assertStatus(finishResponse, 200);
    const finishedAttempt = await finishResponse.json();
    assert.equal(finishedAttempt.solved['7'], true);
    assert.equal(finishedAttempt.solved['8'], false);
    assert.ok(finishedAttempt.attemptId);

    const beforeCorrection = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'))['student-a'];
    assert.equal(beforeCorrection.mockTestingQueue.length, 1);
    const xpBefore = beforeCorrection.xpTotal;
    const coinsBefore = beforeCorrection.coinsTotal;

    const forbiddenCorrection = await request(
      '/api/mock-exams/attempt/task-result',
      studentAuthorization,
      'PATCH',
      { studentId: 'student-a', examId: 'exam-a', attemptId: finishedAttempt.attemptId, taskKey: '8' }
    );
    await assertStatus(forbiddenCorrection, 403);

    const correctionResponse = await request(
      '/api/mock-exams/attempt/task-result',
      teacherAuthorization,
      'PATCH',
      { studentId: 'student-a', examId: 'exam-a', attemptId: finishedAttempt.attemptId, taskKey: '8' }
    );
    await assertStatus(correctionResponse, 200);
    const correction = await correctionResponse.json();
    assert.equal(correction.attempt.answers['8'], 'wrong');
    assert.equal(correction.attempt.solved['8'], true);
    assert.equal(correction.attempt.resultOverrides['8'].correct, true);
    assert.equal(correction.primaryScore, 2);
    assert.equal(correction.secondaryScore, 14);
    assert.equal(correction.rewardsChanged, false);
    assert.equal(correction.history[0].primaryScore, 2);
    assert.equal(correction.history[0].secondaryScore, 14);
    assert.equal(correction.history[0].attemptSnapshot.answers['8'], 'wrong');

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'))['student-a'];
    assert.equal(persisted.mockAttempts['exam-a'].solved['8'], true);
    assert.equal(persisted.mockAttemptResults[0].attemptSnapshot.solved['8'], true);
    assert.equal(persisted.mockTestingQueue.length, 0);
    assert.equal(persisted.xpTotal, xpBefore);
    assert.equal(persisted.coinsTotal, coinsBefore);
  } finally {
    await stopServer(child);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) fs.rmSync(safeTempRoot, { recursive: true, force: true });
  }
});
