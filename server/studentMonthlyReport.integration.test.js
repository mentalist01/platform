import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codeHash = (code) => {
  const salt = 'student-month-report-integration-fixture';
  return `scrypt$${salt}$${crypto.scryptSync(code, salt, 64).toString('base64')}`;
};
const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});
const stop = async (child) => {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
};

test('teacher can generate a monthly report only for an accessible student', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-student-month-report-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const now = new Date().toISOString();
  write('teachers.json', [
    { id: 'teacher-one', name: 'Первый', codeHash: codeHash('teacher-one-code'), createdAt: now },
    { id: 'teacher-two', name: 'Второй', codeHash: codeHash('teacher-two-code'), createdAt: now },
  ]);
  write('students.json', [
    { id: 'student-one', teacherId: 'teacher-one', name: 'Илья', codeHash: codeHash('student-one-code'), createdAt: now },
  ]);
  write('progress.json', {
    'student-one': { homeworks: [], mocks: [], mockAttempts: {}, mockAttemptResults: [], schedule: [] },
  });
  write('tests.json', {});
  write('mock-exams.json', []);
  write('lesson-history.json', { occurrences: {}, tombstones: {} });

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  const request = async (route, token, expected = 200, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(options?.body ? {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      } : {}),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload;
  };
  try {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspace,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        PLATFORM_DATA_DIR: dataDir,
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
        PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
        COLLAB_PERSISTENCE: '0',
        DISABLE_STARTUP_XP_REBALANCE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { logs += chunk; });
    child.stderr.on('data', (chunk) => { logs += chunk; });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      assert.equal(child.exitCode, null, logs);
      try {
        if ((await fetch(`${baseUrl}/api/client-build-version`)).ok) break;
      } catch { /* booting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 199) throw new Error(logs);
    }

    const login = async (code) => {
      const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      assert.equal(response.status, 200, JSON.stringify(payload));
      return payload.token;
    };
    const teacherOneToken = await login('teacher-one-code');
    const teacherTwoToken = await login('teacher-two-code');
    const month = new Date().toISOString().slice(0, 7);
    const report = await request(
      `/api/student-month-report?studentId=student-one&month=${month}`,
      teacherOneToken
    );
    assert.equal(report.student.name, 'Илья');
    assert.equal(report.month, month);
    assert.equal(report.metrics.lessons.count, 0);
    assert.equal(report.metrics.homework.assignedCount, 0);
    assert.match(report.text, /как Илья занимался|Илья занимался/u);
    assert.match(report.studentText, /^Илья,/u);

    const sentStatus = await request(
      '/api/student-month-report/status',
      teacherOneToken,
      200,
      {
        method: 'PATCH',
        body: JSON.stringify({ studentId: 'student-one', month, sent: true }),
      }
    );
    assert.equal(sentStatus.sent, true);
    assert.ok(sentStatus.monthlyReportSentMonths[month]);
    const studentsResponse = await request('/api/students', teacherOneToken);
    assert.ok(studentsResponse[0].monthlyReportSentMonths[month]);

    await request(
      '/api/student-month-report/status',
      teacherTwoToken,
      403,
      {
        method: 'PATCH',
        body: JSON.stringify({ studentId: 'student-one', month, sent: true }),
      }
    );

    await request(
      `/api/student-month-report?studentId=student-one&month=${month}`,
      teacherTwoToken,
      403
    );
    await request(
      '/api/student-month-report?studentId=student-one&month=bad-month',
      teacherOneToken,
      400
    );
  } finally {
    await stop(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
