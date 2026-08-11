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

test('solve telemetry persists time and wrong attempts for standard and Python questions', {
  timeout: 40_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-difficulty-'));
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
    1: {
      basic: [{ id: 'standard-q', question: '2 + 2', answer: '4' }],
    },
    101: {
      python: [{
        id: 'python-q',
        question: 'print ok',
        tests: [{ input: '', output: 'ok' }],
      }],
    },
  }));
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
    'student-1': {
      progress: {},
      solvedByTask: {
        1: {
          basic: {
            firstSolveTelemetry: {
              malformed: {
                solveDurationMs: 'not-a-duration',
                wrongAttempts: -10,
                solvedAt: 'not-a-date',
              },
            },
          },
        },
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
      STUDENT_ANSWER_HISTORY_LIMIT: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });

  try {
    await waitForServer(baseUrl, child, () => serverLogs);
    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'student-code' }),
    });
    await assertStatus(loginResponse, 200);
    const session = await loginResponse.json();
    const headers = {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    };
    const solve = (payload) => fetch(`${baseUrl}/api/progress/solve`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const wrongStandard = await solve({
      taskNumber: 1,
      levelId: 'basic',
      questionId: 'standard-q',
      code: '5',
      solveDurationMs: 60_000,
    });
    await assertStatus(wrongStandard, 400);

    const correctStandard = await solve({
      taskNumber: 1,
      levelId: 'basic',
      questionId: 'standard-q',
      code: '4',
      solveDurationMs: 120_000,
    });
    await assertStatus(correctStandard, 200);

    for (const solveDurationMs of [900_000, 950_000]) {
      const repeatedCorrectStandard = await solve({
        taskNumber: 1,
        levelId: 'basic',
        questionId: 'standard-q',
        code: '4',
        solveDurationMs,
      });
      await assertStatus(repeatedCorrectStandard, 200);
    }

    const wrongPython = await solve({
      taskNumber: 101,
      levelId: 'python',
      questionId: 'python-q',
      code: 'print("wrong")',
      solveDurationMs: 180_000,
      pythonResults: [{ input: '', output: 'wrong', error: '' }],
    });
    await assertStatus(wrongPython, 400);

    const spoofedSuccessfulPython = await solve({
      taskNumber: 101,
      levelId: 'python',
      questionId: 'python-q',
      code: 'print("wrong")',
      solveDurationMs: 240_000,
      pythonResults: [{ input: '', output: 'ok', error: '' }],
    });
    await assertStatus(spoofedSuccessfulPython, 400);

    const correctPython = await solve({
      taskNumber: 101,
      levelId: 'python',
      questionId: 'python-q',
      code: 'print("ok")',
      solveDurationMs: 300_000,
      pythonResults: [{ input: '', output: 'ok', error: '' }],
    });
    await assertStatus(correctPython, 200);

    const historyResponse = await fetch(
      `${baseUrl}/api/progress/answer-history?taskNumber=1&levelId=basic`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    await assertStatus(historyResponse, 200);
    const history = await historyResponse.json();
    assert.deepEqual(
      history['standard-q'].map((entry) => ({ correct: entry.correct, solveDurationMs: entry.solveDurationMs })),
      [
        { correct: true, solveDurationMs: 900_000 },
        { correct: true, solveDurationMs: 950_000 },
      ]
    );

    const storedProgress = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'));
    const standardTelemetry = storedProgress['student-1'].solvedByTask['1'].basic
      .firstSolveTelemetry['standard-q'];
    assert.equal(standardTelemetry.solveDurationMs, 120_000);
    assert.equal(standardTelemetry.wrongAttempts, 1);
    assert.match(standardTelemetry.solvedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        storedProgress['student-1'].solvedByTask['1'].basic.firstSolveTelemetry,
        'malformed'
      ),
      false
    );
    const pythonTelemetry = storedProgress['student-1'].solvedByTask['101'].python
      .firstSolveTelemetry['python-q'];
    assert.equal(pythonTelemetry.solveDurationMs, 300_000);
    assert.equal(pythonTelemetry.wrongAttempts, 2);

    const standardDifficultyResponse = await fetch(
      `${baseUrl}/api/question-difficulty?taskNumber=1&levelId=basic`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    await assertStatus(standardDifficultyResponse, 200);
    assert.match(String(standardDifficultyResponse.headers.get('cache-control') || ''), /no-store/);
    const standardDifficulty = (await standardDifficultyResponse.json())['standard-q'];
    assert.equal(standardDifficulty.sampleSize, 1);
    assert.equal(standardDifficulty.averageDurationMs, 120_000);
    assert.equal(standardDifficulty.averageWrongAttempts, 1);
    assert.equal(standardDifficulty.provisional, true);

    const pythonDifficultyResponse = await fetch(
      `${baseUrl}/api/question-difficulty?taskNumber=101&levelId=python`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    await assertStatus(pythonDifficultyResponse, 200);
    const pythonDifficulty = (await pythonDifficultyResponse.json())['python-q'];
    assert.equal(pythonDifficulty.type, 'python');
    assert.equal(pythonDifficulty.averageDurationMs, 300_000);
    assert.equal(pythonDifficulty.averageWrongAttempts, 2);
  } finally {
    await stopServer(child);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});
