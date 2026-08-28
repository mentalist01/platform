import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
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
    probe.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});

const waitForServer = async (baseUrl, child, getLogs) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before startup.\n${getLogs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/client-build-version`);
      if (response.ok) return;
    } catch {
      // The test server can refuse connections while Express is starting.
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

const stopHttpServer = async (server) => {
  if (!server?.listening) return;
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};

const shiftDayKey = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const buildIcal = (uid, dayKey) => {
  const compactDay = dayKey.replaceAll('-', '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ivan EGE//Calendar refresh concurrency test//EN',
    'X-WR-CALNAME:Concurrency calendar',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${compactDay}T090000Z`,
    `DTSTART:${compactDay}T170000Z`,
    `DTEND:${compactDay}T180000Z`,
    'SUMMARY:Student A',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
};

const startFakeIcalServer = async (initialBody) => {
  let body = initialBody;
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    if (req.url !== '/calendar.ics') {
      res.writeHead(404).end();
      return;
    }
    requestCount += 1;
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' });
      res.end(body);
    }, 250);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/calendar.ics`,
    getRequestCount: () => requestCount,
    setBody: (value) => { body = value; },
  };
};

const jsonRequest = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'body')
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(Object.prototype.hasOwnProperty.call(options, 'body')
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const rawBody = await response.text();
  assert.equal(response.status, 200, rawBody);
  return rawBody ? JSON.parse(rawBody) : null;
};

test('calendar refresh coalesces concurrent requests and caches background refreshes', {
  timeout: 40_000,
}, async () => {
  const teacherId = 'teacher-calendar-concurrency';
  const studentId = 'student-calendar-concurrency';
  const firstDay = shiftDayKey(3);
  const secondDay = shiftDayKey(4);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-ege-calendar-refresh-'));
  const dataDir = path.join(tempRoot, 'data');
  const uploadsDir = path.join(tempRoot, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  let child = null;
  let calendarServer = null;
  let serverLogs = '';
  try {
    const fakeCalendar = await startFakeIcalServer(buildIcal('first@example.test', firstDay));
    calendarServer = fakeCalendar.server;
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(dataDir, 'teachers.json'), JSON.stringify([{
      id: teacherId,
      name: 'Teacher A',
      code: 'teacher-calendar-code',
      createdAt: now,
    }]));
    fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify([{
      id: studentId,
      name: 'Student A',
      teacherId,
      code: 'student-calendar-code',
      grade: '11',
      createdAt: now,
      deletedAt: null,
      studyStatus: 'active',
    }]));
    fs.writeFileSync(path.join(dataDir, 'tests.json'), '{}');
    fs.writeFileSync(path.join(dataDir, 'mock-exams.json'), '[]');
    fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify({
      [studentId]: { schedule: [], homeworks: [], mockAttempts: {} },
    }));
    fs.writeFileSync(path.join(dataDir, 'teacher-calendar-sync.json'), JSON.stringify({
      [teacherId]: {
        enabled: true,
        icalUrl: fakeCalendar.url,
        updatedAt: now,
        lastFetchedAt: '',
        lastError: '',
        calendarName: '',
      },
    }));

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        TZ: 'Europe/Moscow',
        PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow',
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
    await waitForServer(baseUrl, child, () => serverLogs);

    const login = await jsonRequest(baseUrl, '/api/login', {
      method: 'POST',
      body: { code: 'teacher-calendar-code' },
    });
    const refresh = (body = {}) => jsonRequest(baseUrl, '/api/teacher-calendar-sync/refresh', {
      token: login.token,
      method: 'POST',
      body,
    });

    const backgroundWave = await Promise.all([
      ...Array.from({ length: 6 }, () => refresh()),
      ...Array.from({ length: 6 }, () => (
        jsonRequest(baseUrl, '/api/teacher-schedule', { token: login.token })
      )),
    ]);
    assert.equal(fakeCalendar.getRequestCount(), 1);
    assert.deepEqual(
      backgroundWave.slice(0, 6).map((result) => result.importedCount),
      Array(6).fill(1)
    );
    backgroundWave.slice(6).forEach((schedule) => {
      assert.deepEqual(
        schedule.filter((entry) => entry.source === 'google-ical').map((entry) => entry.externalEventId),
        ['first@example.test']
      );
    });

    const cachedBackground = await refresh();
    assert.equal(cachedBackground.importedCount, 1);
    assert.equal(fakeCalendar.getRequestCount(), 1);

    fakeCalendar.setBody(buildIcal('second@example.test', secondDay));
    const forcedWave = await Promise.all(Array.from(
      { length: 8 },
      () => refresh({ force: true })
    ));
    assert.equal(fakeCalendar.getRequestCount(), 2);
    assert.deepEqual(forcedWave.map((result) => result.importedCount), Array(8).fill(1));

    await refresh();
    assert.equal(fakeCalendar.getRequestCount(), 2);
    const schedule = await jsonRequest(baseUrl, '/api/teacher-schedule', { token: login.token });
    const googleEntries = schedule.filter((entry) => entry.source === 'google-ical');
    assert.deepEqual(googleEntries.map((entry) => entry.externalEventId), ['second@example.test']);
  } finally {
    await stopServer(child);
    await stopHttpServer(calendarServer);
    const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    const safeTempRoot = path.resolve(tempRoot);
    if (safeTempRoot.startsWith(tempBase)) {
      fs.rmSync(safeTempRoot, { recursive: true, force: true });
    }
  }
});
