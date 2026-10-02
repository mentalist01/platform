import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
const shift = (day, amount) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const event = (uid, day, summary) => [
  'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${day.replaceAll('-', '')}T150000Z`,
  `DTSTART:${day.replaceAll('-', '')}T150000Z`, `DTEND:${day.replaceAll('-', '')}T160000Z`,
  `SUMMARY:${summary}`, 'END:VEVENT',
];

test('namesakes share no imported lessons or debts; stale wrong imports are reconciled', {
  timeout: 60000,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-calendar-namesakes-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  const pastDay = shift(today, -1);
  const futureDay = shift(today, 2);
  const aliasDay = shift(today, 3);
  const ambiguousDay = shift(today, 4);
  const wrongImportId = `google-student-${crypto.createHash('sha1')
    .update(`teacher-a:group-egor:individual-past:${pastDay}:18:00`).digest('hex').slice(0, 18)}`;
  const wrongHistoryKey = `group-egor|${pastDay}|18:00|60`;
  let child;
  let logs = '';
  const calendar = http.createServer((req, res) => res.end([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ivan calendar namesakes test//EN',
    ...event('individual-past', pastDay, 'Егор'),
    ...event('individual-future', futureDay, 'Егор'),
    ...event('group-lesson', futureDay, 'Группа 2'),
    ...event('alias-lesson', aliasDay, 'Егор1'),
    ...event('ambiguous-lesson', ambiguousDay, 'Саша'),
    'END:VCALENDAR', '',
  ].join('\r\n')));
  try {
    await new Promise(resolve => calendar.listen(0, '127.0.0.1', resolve));
    const now = new Date().toISOString();
    write('teachers.json', [{ id: 'teacher-a', name: 'Teacher', code: 'teacher-code', createdAt: now }]);
    write('students.json', [
      { id: 'group-egor', name: 'Егор', nickname: 'Егор1', code: 'group-code' },
      { id: 'individual-egor', name: 'Егор', code: 'individual-code' },
      { id: 'sasha-one', name: 'Саша', code: 'sasha-one-code' },
      { id: 'sasha-two', name: 'Саша', code: 'sasha-two-code' },
      { id: 'former-egor', name: 'Егор', nickname: 'Егор 2000', code: 'former-code', studyStatus: 'inactive' },
    ].map(student => ({ teacherId: 'teacher-a', studyStatus: 'active', grade: '11', createdAt: now, deletedAt: null, ...student })));
    write('tests.json', {});
    write('mock-exams.json', []);
    write('progress.json', {
      'group-egor': {
        schedule: [
          { id: wrongImportId, studentId: 'group-egor', date: pastDay, time: '18:00', durationMinutes: 60,
            source: 'google-calendar', isGoogleCalendarSync: true, googleCalendarTitle: 'Егор', externalEventId: 'individual-past' },
          { id: 'manual-lesson', date: shift(today, 6), time: '12:00', durationMinutes: 60, subject: 'Manual lesson' },
        ],
        homeworks: [], mockAttempts: {},
      },
    });
    write('lesson-history.json', { occurrences: { [wrongHistoryKey]: {
      key: wrongHistoryKey, studentId: 'group-egor', dayKey: pastDay, time: '18:00', durationMinutes: 60,
      subject: 'Занятие', source: 'google-calendar', sourceEntryId: wrongImportId, recordedAt: now,
    }, [`group-egor|${pastDay}|12:00|60`]: {
      studentId: 'group-egor', dayKey: pastDay, time: '12:00', durationMinutes: 60,
      subject: 'Real manual lesson', source: 'schedule', sourceEntryId: 'manual-history', recordedAt: now,
    } }, tombstones: {} });
    write('learning-groups.json', [{
      id: 'group-2', teacherId: 'teacher-a', name: 'Группа 2',
      maxStudents: 5, plannedStartDate: shift(today, -30), createdAt: now, updatedAt: now,
      startedAt: shift(today, -20), deletedAt: '', completedAt: '', schedule: [],
      members: [{ studentId: 'group-egor', status: 'active', joinedAt: shift(today, -30) }],
    }]);
    write('teacher-calendar-sync.json', { 'teacher-a': {
      enabled: true, icalUrl: `http://127.0.0.1:${calendar.address().port}/calendar.ics`, updatedAt: now,
    } });
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: workspaceDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test', TZ: 'Europe/Moscow',
        PLATFORM_CALENDAR_TIME_ZONE: 'Europe/Moscow', PLATFORM_DATA_DIR: dataDir,
        PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'),
        COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1', LEARNING_GROUP_RTC_ENABLED: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { logs += chunk.toString(); });
    child.stderr.on('data', chunk => { logs += chunk.toString(); });
    const deadline = Date.now() + 20000;
    while (true) {
      if (child.exitCode !== null) throw Error(`Server exited: ${logs}`);
      try { if ((await fetch(`${url}/api/client-build-version`)).ok) break; } catch { /* booting */ }
      if (Date.now() > deadline) throw Error(`Server startup timed out: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const request = async (route, token, body) => {
      const response = await fetch(`${url}${route}`, {
        method: body ? 'POST' : 'GET',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      assert.equal(response.status, 200, `${route}: ${JSON.stringify(result)}`);
      return result;
    };
    const teacher = await request('/api/login', '', { code: 'teacher-code' });
    const groupEgor = await request('/api/login', '', { code: 'group-code' });
    const individualEgor = await request('/api/login', '', { code: 'individual-code' });
    const sasha = await request('/api/login', '', { code: 'sasha-one-code' });
    const teacherRows = await request('/api/teacher-schedule', teacher.token);
    assert.equal(teacherRows.find(entry => entry.externalEventId === 'individual-future').studentId, 'individual-egor');
    await request('/api/teacher-calendar-sync/refresh', teacher.token, {});
    const groupRows = await request('/api/student-schedule?studentId=group-egor', groupEgor.token);
    assert.ok(groupRows.some(entry => entry.externalEventId === 'group-lesson'), 'Actual group lesson retained');
    assert.ok(groupRows.some(entry => entry.externalEventId === 'alias-lesson'), 'Explicit alias can receive its own individual lesson');
    assert.ok(groupRows.some(entry => entry.id === 'manual-lesson'), 'Manual schedule retained');
    assert.ok(!groupRows.some(entry => /^individual-/.test(entry.externalEventId)), 'No namesake lesson or overdue debt');
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'))['group-egor'].schedule;
    assert.ok(!stored.some(entry => entry.id === wrongImportId || /^individual-/.test(entry.externalEventId)), 'Wrong persisted imports removed by normal sync');
    const history = await request('/api/lesson-history?studentId=group-egor', groupEgor.token);
    assert.ok(!history.items.some(entry => entry.key === wrongHistoryKey), 'Wrong old imported history snapshot removed');
    assert.ok(history.items.some(entry => entry.key === `group-egor|${pastDay}|12:00|60`), 'Independent manual history preserved');
    const historyStore = JSON.parse(fs.readFileSync(path.join(dataDir, 'lesson-history.json'), 'utf8'));
    assert.ok(!historyStore.occurrences[wrongHistoryKey], 'Wrong snapshot cannot return during offline fallback');
    const individualRows = await request('/api/student-schedule?studentId=individual-egor', individualEgor.token);
    assert.ok(individualRows.some(entry => entry.externalEventId === 'individual-future'));
    const past = individualRows.find(entry => entry.externalEventId === 'individual-past');
    assert.ok(past, 'Real past unpaid lesson retained for its owner');
    assert.ok(past.payment.overdue || Object.values(past.payment.statesByDate).some(state => state.overdue));
    assert.ok(!individualRows.some(entry => ['group-lesson', 'alias-lesson'].includes(entry.externalEventId)));
    const sashaRows = await request('/api/student-schedule?studentId=sasha-one', sasha.token);
    assert.ok(!sashaRows.some(entry => entry.externalEventId === 'ambiguous-lesson'), 'Ambiguous event produces no personal debt');
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    calendar.closeAllConnections();
    await new Promise(resolve => calendar.close(resolve));
    if (root.startsWith(path.join(os.tmpdir(), 'ivan-calendar-namesakes-'))) fs.rmSync(root, { recursive: true, force: true });
  }
});
