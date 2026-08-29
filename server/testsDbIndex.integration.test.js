import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
      // The server is still starting.
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
  assert.equal(response.status, expectedStatus, await response.text());
};

const login = async (baseUrl, code) => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  await assertStatus(response, 200);
  return response.json();
};

test('GET /api/tests?shape=index returns an id-only index after student personalization', {
  timeout: 30_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-tests-index-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
    id: 'teacher-1',
    name: 'Teacher',
    code: 'teacher-code',
    createdAt: now,
  }]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
    id: 'student-1',
    name: 'Student',
    teacherId: 'teacher-1',
    code: 'student-code',
    grade: '11',
    createdAt: now,
    deletedAt: null,
  }]));
  fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({
    _meta: {
      version: 7,
      levels: [{ id: 'must-not-leak' }],
      secret: 'root-secret',
    },
    1: {
      title: 'Task one',
      teacherNote: 'sensitive task metadata',
      basic: [
        { id: 'q-1', question: 'Question', answer: 'secret-answer', files: ['large.pdf'] },
        { id: '', question: 'Blank id', answer: 'hidden' },
        { question: 'Missing id', answer: 'hidden too' },
      ],
      advanced: [],
    },
    2: {
      title: '',
      description: 'heavy description',
      expert: [{ id: 0, answer: 'numeric id stays intact' }],
    },
  }));
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
    'student-1': {
      progress: {},
      solvedByTask: {},
      mockTestingQueue: [{
        id: 'followup-entry',
        sourceKey: 'mock-exam:exam-1:attempt-1:1',
        attemptId: 'attempt-1',
        examId: 'exam-1',
        sourceMockTaskNumber: 1,
        destinationTaskNumber: 1,
        levelId: 'basic',
        afterQuestionId: 'q-1',
        queueOrder: 1,
        question: {
          id: 'followup-q',
          question: 'Personalized question',
          answer: 'personalized-secret',
        },
      }],
    },
  }));

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

  try {
    await waitForServer(baseUrl, child, () => serverLogs);
    const teacher = await login(baseUrl, 'teacher-code');
    const student = await login(baseUrl, 'student-code');

    const fullResponse = await fetch(`${baseUrl}/api/tests`, {
      headers: { Authorization: `Bearer ${teacher.token}` },
    });
    await assertStatus(fullResponse, 200);
    const fullDb = await fullResponse.json();
    assert.equal(fullDb._meta.secret, 'root-secret');
    assert.equal(fullDb['1'].basic[0].answer, 'secret-answer');

    const teacherIndexResponse = await fetch(
      `${baseUrl}/api/tests?studentId=student-1&shape=index`,
      { headers: { Authorization: `Bearer ${teacher.token}` } }
    );
    await assertStatus(teacherIndexResponse, 200);
    const teacherIndex = await teacherIndexResponse.json();
    assert.equal(Object.prototype.hasOwnProperty.call(teacherIndex, '_meta'), false);
    assert.deepEqual(teacherIndex['1'], {
      title: 'Task one',
      basic: [{ id: 'q-1' }, { id: 'followup-q' }, { id: '' }, { id: '' }],
      advanced: [],
    });
    assert.deepEqual(teacherIndex['2'], {
      title: '',
      expert: [{ id: '0' }],
    });
    assert.equal(Object.prototype.hasOwnProperty.call(teacherIndex['1'], 'teacherNote'), false);

    const studentIndexResponse = await fetch(`${baseUrl}/api/tests?shape=index`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    await assertStatus(studentIndexResponse, 200);
    const studentIndex = await studentIndexResponse.json();
    assert.deepEqual(studentIndex['1'], teacherIndex['1']);
    assert.equal(JSON.stringify(studentIndex['1']).includes('answer'), false);
    assert.equal(JSON.stringify(studentIndex['1']).includes('question'), false);
    assert.equal(JSON.stringify(studentIndex['1']).includes('files'), false);

    const forbiddenIndexResponse = await fetch(
      `${baseUrl}/api/tests?studentId=another-student&shape=index`,
      { headers: { Authorization: `Bearer ${student.token}` } }
    );
    await assertStatus(forbiddenIndexResponse, 403);
  } finally {
    await stopServer(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
