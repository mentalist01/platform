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

test('parent login exposes only the linked student read-only cabinet', {
  timeout: 40_000,
}, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-parent-cabinet-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const createdAt = '2026-08-01T10:00:00.000Z';
  fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
    id: 'teacher-a',
    name: 'Teacher A',
    code: 'teacher-a-code',
    createdAt,
  }]));
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([
    {
      id: 'student-a',
      name: 'Student A',
      teacherId: 'teacher-a',
      code: 'student-a-code',
      grade: '11',
      createdAt,
      deletedAt: null,
    },
    {
      id: 'student-b',
      name: 'Student B',
      teacherId: 'teacher-a',
      code: 'student-b-code',
      grade: '10',
      createdAt,
      deletedAt: null,
    },
  ]));
  fs.writeFileSync(path.join(dataDir, 'tests.json'), JSON.stringify({}));
  fs.writeFileSync(path.join(dataDir, 'mock-exams.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
    'student-a': {
      schedule: [{
        id: 'lesson-a',
        date: '2026-08-10',
        weekdayKey: 'monday',
        day: 'Понедельник',
        time: '18:00',
        durationMinutes: 60,
      }],
      homeworks: [
        {
          id: 'legacy-homework',
          issuedAt: '2026-06-28T10:00:00.000Z',
          homeWork: 'Legacy homework with unreliable progress',
        },
        {
          id: 'reliable-homework',
          issuedAt: '2026-06-29T10:00:00.000Z',
          homeWork: 'Reliable homework',
        },
      ],
      mockAttempts: {},
    },
    'student-b': { schedule: [], homeworks: [], mockAttempts: {} },
  }));
  fs.writeFileSync(path.join(uploadsDir, 'untracked-private.txt'), 'must stay private');

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

    const loginResponse = await fetch(`${baseUrl}/api/parent/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'student-a-code' }),
    });
    await assertStatus(loginResponse, 200);
    const session = await loginResponse.json();
    assert.equal(session.role, 'parent');
    assert.equal(session.studentId, 'student-a');
    assert.equal(session.teacherId, 'teacher-a');
    assert.equal(Object.hasOwn(session, 'code'), false);
    const headers = { Authorization: `Bearer ${session.token}` };

    const overviewResponse = await fetch(`${baseUrl}/api/parent/overview`, { headers });
    await assertStatus(overviewResponse, 200);
    const overview = await overviewResponse.json();
    assert.deepEqual(overview.student, { id: 'student-a', name: 'Student A', grade: 11 });
    assert.equal(Array.isArray(overview.schedule), true);
    assert.equal(overview.schedule.length, 1);
    assert.equal(Array.isArray(overview.lessons.items), true);
    assert.equal(Array.isArray(overview.mocks.entries), true);
    assert.equal(Array.isArray(overview.homework.entries), true);
    assert.deepEqual(overview.homework.entries.map((entry) => entry.id), ['reliable-homework']);
    assert.equal(typeof overview.finance, 'object');

    const lessonsResponse = await fetch(`${baseUrl}/api/parent/lessons?offset=0&limit=5`, { headers });
    await assertStatus(lessonsResponse, 200);
    const lessons = await lessonsResponse.json();
    assert.equal(Array.isArray(lessons.items), true);
    assert.equal(JSON.stringify(lessons).includes('student-b'), false);

    const allStudentsResponse = await fetch(`${baseUrl}/api/students`, { headers });
    await assertStatus(allStudentsResponse, 403);
    const mutationResponse = await fetch(`${baseUrl}/api/progress/reset`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'student-a' }),
    });
    await assertStatus(mutationResponse, 403);
    const untrackedUploadResponse = await fetch(`${baseUrl}/uploads/untracked-private.txt`, { headers });
    await assertStatus(untrackedUploadResponse, 404);

    const badCodeResponse = await fetch(`${baseUrl}/api/parent/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'teacher-a-code' }),
    });
    await assertStatus(badCodeResponse, 401);
  } finally {
    await stopServer(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
