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
  assert.equal(response.status, expectedStatus, await response.text());
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

const buildFinishedAttempt = ({
  attemptId,
  firstDurationMs,
  firstSolved,
  secondDurationMs,
  secondSolved,
}) => ({
  attemptId,
  mode: 'classic',
  status: 'finished',
  finishedAt: '2026-08-13T12:00:00.000Z',
  answers: {
    1: firstSolved ? '42' : 'wrong',
    2: secondSolved ? '7' : 'wrong',
  },
  solved: {
    1: firstSolved,
    2: secondSolved,
  },
  taskDurationsMs: {
    1: firstDurationMs,
    2: secondDurationMs,
  },
});

test('mock task analytics is student-safe and teacher-scoped', {
  timeout: 40_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-mock-task-analytics-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const now = '2026-08-13T10:00:00.000Z';
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([
    {
      id: 'teacher-a',
      name: 'Teacher A',
      code: 'teacher-a-code',
      createdAt: now,
    },
    {
      id: 'teacher-b',
      name: 'Teacher B',
      code: 'teacher-b-code',
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
  fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({}));
  fs.writeFileSync(path.join(dataDir, 'mock-exams.json'), JSON.stringify([
    {
      id: 'assigned-exam',
      title: 'Assigned exam',
      createdAt: now,
      updatedAt: now,
      access: { all: true, students: [], mode: 'classic' },
      tasks: {
        1: { id: 'assigned-task-1', answer: '42' },
        2: { id: 'assigned-task-2', answer: '7' },
      },
    },
    {
      id: 'unassigned-exam',
      title: 'Visible but unassigned exam',
      createdAt: now,
      updatedAt: now,
      access: { all: true, students: [], mode: 'classic' },
      tasks: { 1: { id: 'unassigned-task-1', answer: '1' } },
    },
    {
      id: 'hidden-exam',
      title: 'Hidden exam',
      createdAt: now,
      updatedAt: now,
      access: { all: false, students: ['student-b'], mode: 'classic' },
      tasks: { 1: { id: 'hidden-task-1', answer: '1' } },
    },
  ]));
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
    'student-a': {
      homeworks: [
        {
          id: 'homework-a-newer',
          issuedAt: '2026-08-14T10:00:00.000Z',
          goals: [{
            type: 'mock',
            assignmentTier: 'required',
            mockExamId: 'assigned-exam',
            mode: 'classic',
            targetTaskKeys: ['2'],
          }],
        },
        {
          id: 'homework-a',
          issuedAt: now,
          goals: [
            {
              type: 'mock',
              assignmentTier: 'required',
              mockExamId: 'assigned-exam',
              mode: 'classic',
              targetTaskKeys: ['1'],
            },
            {
              type: 'mock',
              assignmentTier: 'required',
              mockExamId: 'hidden-exam',
              mode: 'classic',
              targetTaskKeys: ['1'],
            },
          ],
        },
      ],
      mockAttempts: {
        'assigned-exam': buildFinishedAttempt({
          attemptId: 'attempt-a',
          firstDurationMs: 60_000,
          firstSolved: true,
          secondDurationMs: 120_000,
          secondSolved: false,
        }),
      },
    },
    'student-b': {
      mockAttempts: {
        'assigned-exam': buildFinishedAttempt({
          attemptId: 'attempt-b',
          firstDurationMs: 600_000,
          firstSolved: false,
          secondDurationMs: 900_000,
          secondSolved: true,
        }),
      },
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

  const getAnalytics = (authorization, examId = '', homeworkId = '') => {
    const params = new URLSearchParams();
    if (examId) params.set('examId', examId);
    if (homeworkId) params.set('homeworkId', homeworkId);
    const query = params.toString();
    return fetch(`${baseUrl}/api/mock-exams/task-analytics${query ? `?${query}` : ''}`, {
      headers: { Authorization: authorization },
    });
  };

  try {
    await waitForServer(baseUrl, child, () => serverLogs);
    const studentAuthorization = await login(baseUrl, 'student-a-code');
    const teacherAuthorization = await login(baseUrl, 'teacher-a-code');

    const missingExamId = await getAnalytics(studentAuthorization);
    await assertStatus(missingExamId, 400);

    const hidden = await getAnalytics(studentAuthorization, 'hidden-exam', 'homework-a');
    await assertStatus(hidden, 404);

    const unassigned = await getAnalytics(studentAuthorization, 'unassigned-exam', 'homework-a');
    await assertStatus(unassigned, 404);

    const assigned = await getAnalytics(studentAuthorization, 'assigned-exam', 'homework-a');
    await assertStatus(assigned, 200);
    assert.match(String(assigned.headers.get('cache-control') || ''), /no-store/);
    const studentAnalytics = await assigned.json();
    assert.deepEqual(Object.keys(studentAnalytics), ['1']);
    assert.deepEqual(Object.keys(studentAnalytics['1']).sort(), [
      'averageActiveDurationMs',
      'averageDurationMs',
      'category',
      'provisional',
      'sampleSize',
      'score',
    ]);
    assert.equal(studentAnalytics['1'].sampleSize, 2);
    assert.equal(Object.hasOwn(studentAnalytics['1'], 'accuracyPercent'), false);
    assert.equal(Object.hasOwn(studentAnalytics['1'], 'solvedCount'), false);
    assert.equal(Object.hasOwn(studentAnalytics['1'], 'taskId'), false);

    const newerAssignment = await getAnalytics(
      studentAuthorization,
      'assigned-exam',
      'homework-a-newer'
    );
    await assertStatus(newerAssignment, 200);
    assert.deepEqual(Object.keys(await newerAssignment.json()), ['2']);

    const teacherResponse = await getAnalytics(teacherAuthorization, 'assigned-exam');
    await assertStatus(teacherResponse, 200);
    assert.match(String(teacherResponse.headers.get('cache-control') || ''), /no-store/);
    const teacherAnalytics = await teacherResponse.json();
    assert.deepEqual(Object.keys(teacherAnalytics).sort(), ['1', '2']);
    assert.deepEqual(Object.keys(teacherAnalytics['1']).sort(), [
      'accuracyPercent',
      'averageActiveDurationMs',
      'averageDurationMs',
      'category',
      'categoryMeta',
      'confidence',
      'confidenceLevel',
      'confidencePercent',
      'durationScore',
      'examId',
      'incorrectCount',
      'incorrectResultScore',
      'provisional',
      'sampleSize',
      'score',
      'solvedCount',
      'taskId',
      'taskKey',
      'timeCapMs',
      'type',
    ]);
    assert.equal(teacherAnalytics['1'].sampleSize, 1);
    assert.equal(teacherAnalytics['1'].solvedCount, 1);
    assert.equal(teacherAnalytics['1'].accuracyPercent, 100);
    assert.equal(teacherAnalytics['1'].averageActiveDurationMs, 60_000);
    assert.equal(teacherAnalytics['2'].sampleSize, 1);
    assert.equal(teacherAnalytics['2'].solvedCount, 0);
    assert.equal(teacherAnalytics['2'].accuracyPercent, 0);
    assert.equal(teacherAnalytics['2'].averageActiveDurationMs, 120_000);
  } finally {
    await stopServer(child);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});
