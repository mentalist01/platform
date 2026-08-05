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
    if (child.exitCode !== null) {
      throw new Error(`Server exited before startup.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The socket is expected to refuse connections while the server boots.
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

const assertStatus = async (response, expectedStatus) => {
  if (response.status === expectedStatus) return;
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
};

const buildCodeHash = (code) => {
  const salt = Buffer.from('question-check-test-salt').toString('base64');
  const hash = crypto.scryptSync(code, salt, 64).toString('base64');
  return `scrypt$${salt}$${hash}`;
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

test('check-only endpoint validates teacher and student answers without changing progress', {
  timeout: 40_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-question-check-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([
    {
      id: 'teacher-a',
      name: 'Teacher A',
      codeHash: buildCodeHash('teacher-a-code'),
      createdAt: now,
    },
    {
      id: 'teacher-b',
      name: 'Teacher B',
      codeHash: buildCodeHash('teacher-b-code'),
      createdAt: now,
    },
  ]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([
    {
      id: 'student-a',
      name: 'Student A',
      teacherId: 'teacher-a',
      code: 'student-a-code',
      grade: '11',
      createdAt: now,
      deletedAt: null,
    },
    {
      id: 'student-b',
      name: 'Student B',
      teacherId: 'teacher-b',
      code: 'student-b-code',
      grade: '11',
      createdAt: now,
      deletedAt: null,
    },
  ]));
  fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({
    1: {
      basic: [{ id: 'single', question: 'Single', answer: 'Answer 42' }],
    },
    17: {
      basic: [{ id: 'multi', question: 'Multi', answers: ['left', 'right'] }],
    },
    100: {
      python: [{ id: 'python', question: 'Code', tests: [{ input: '', output: 'ok' }] }],
    },
  }));
  const initialProgress = {
    'student-a': {
      progress: { 1: 25 },
      solvedByTask: {},
      solvedEvents: [],
      xpTotal: 777,
      coinsTotal: 55,
      marker: 'must-stay-unchanged',
    },
  };
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify(initialProgress));

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

  const check = (authorization, payload) => fetch(`${baseUrl}/api/questions/check`, {
    method: 'POST',
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  try {
    await waitForServer(baseUrl, child, () => serverLogs);

    const unauthorized = await check('', {
      taskNumber: 1,
      levelId: 'basic',
      questionId: 'single',
      answers: ['Answer 42'],
    });
    await assertStatus(unauthorized, 401);

    const studentAuthorization = await login(baseUrl, 'student-a-code');
    const correct = await check(studentAuthorization, {
      taskNumber: 1,
      levelId: 'basic',
      questionId: 'single',
      answers: ['  answer   42 '],
    });
    await assertStatus(correct, 200);
    assert.deepEqual(await correct.json(), { correct: true });
    assert.match(String(correct.headers.get('cache-control') || ''), /no-store/);

    const wrong = await check(studentAuthorization, {
      taskNumber: 17,
      levelId: 'basic',
      questionId: 'multi',
      answers: ['left', 'wrong'],
    });
    await assertStatus(wrong, 200);
    assert.deepEqual(await wrong.json(), { correct: false });

    const multiCorrect = await check(studentAuthorization, {
      taskNumber: 17,
      levelId: 'basic',
      questionId: 'multi',
      answers: ['LEFT', ' right '],
    });
    await assertStatus(multiCorrect, 200);
    assert.deepEqual(await multiCorrect.json(), { correct: true });

    const studentSpoof = await check(studentAuthorization, {
      studentId: 'student-b',
      taskNumber: 1,
      levelId: 'basic',
      questionId: 'single',
      answers: ['Answer 42'],
    });
    await assertStatus(studentSpoof, 403);

    const teacherAuthorization = await login(baseUrl, 'teacher-a-code');
    const teacherCheck = await check(teacherAuthorization, {
      studentId: 'student-a',
      taskNumber: 1,
      levelId: 'basic',
      questionId: 'single',
      answers: ['Answer 42'],
    });
    await assertStatus(teacherCheck, 200);
    assert.deepEqual(await teacherCheck.json(), { correct: true });

    const foreignStudent = await check(teacherAuthorization, {
      studentId: 'student-b',
      taskNumber: 1,
      levelId: 'basic',
      questionId: 'single',
      answers: ['Answer 42'],
    });
    await assertStatus(foreignStudent, 403);

    const pythonCheck = await check(studentAuthorization, {
      taskNumber: 100,
      levelId: 'python',
      questionId: 'python',
      answers: ['print("ok")'],
    });
    await assertStatus(pythonCheck, 400);

    const persistedProgress = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'));
    assert.deepEqual(persistedProgress, initialProgress);
  } finally {
    await stopServer(child);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});
