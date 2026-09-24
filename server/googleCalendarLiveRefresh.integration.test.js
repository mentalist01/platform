import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encryptGoogleCalendarTokens } from './googleCalendarWriteback.js';

test('manual refresh during background import gets the moved Google occurrence, removes deletions and reports failures', { timeout: 40000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-live-refresh-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const seed = (file, value) => fs.writeFileSync(path.join(data, file), JSON.stringify(value));
  const createdAt = new Date().toISOString();
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const event = (date, time, uid = 'maxim-series') => ({ id: `${uid}-instance`, iCalUID: uid, summary: 'Максим', start: { dateTime: `${date}T${time}:00+03:00` }, end: { dateTime: `${date}T${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:00:00+03:00` } });
  const old = event(day(3), '21:00'), moved = event(day(2), '12:00'), later = event(day(10), '21:00'), past = event(day(-30), '12:00', 'past');
  seed('teachers.json', [{ id: 't', name: 'Teacher', code: 'live-teacher-code', createdAt }]);
  seed('students.json', [{ id: 's', name: 'Максим', teacherId: 't', code: 'live-student-code', createdAt, deletedAt: null, studyStatus: 'active' }]);
  seed('tests.json', {}); seed('mock-exams.json', []);
  seed('progress.json', { s: { schedule: [], homeworks: [], mockAttempts: {} } });
  seed('teacher-calendar-sync.json', { t: { enabled: true, icalUrl: 'https://calendar.google.com/calendar/ical/live-fixture/private-fixture/basic.ics', updatedAt: createdAt } });
  seed('teacher-calendar-google.json', { t: { calendarId: 'live-fixture', encryptedTokens: encryptGoogleCalendarTokens({ accessToken: 'fixture', expiresAtMs: Date.now() + 3600000 }, 'fixture-secret') } });
  const stateFile = path.join(root, 'google-state.json'), requestsFile = path.join(root, 'requests.json');
  const setGoogle = (items, status = 200) => fs.writeFileSync(stateFile, JSON.stringify({ items, status }));
  const requests = () => fs.existsSync(requestsFile) ? JSON.parse(fs.readFileSync(requestsFile, 'utf8')) : [];
  setGoogle([old, later, past]);
  const preload = path.join(root, 'mock-google.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs'; const original = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
      if (!String(url).startsWith('https://www.googleapis.com/calendar/v3/')) return original(url, opts);
      if (opts.method !== 'GET') throw Error('Read-only refresh must not write Google events');
      const state = JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf8'));
      const file = ${JSON.stringify(requestsFile)};
      const rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
      rows.push(String(url)); fs.writeFileSync(file, JSON.stringify(rows));
      await new Promise(r => setTimeout(r, 250));
      return new Response(JSON.stringify(state.status === 200 ? {items: state.items} : {error:{message:'Calendar unavailable'}}), {status:state.status});
    };`);
  const port = await new Promise(resolve => { const server = net.createServer().listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  let logs = '';
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'server/index.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), TZ: 'Europe/Moscow', PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', GOOGLE_CALENDAR_OAUTH_CLIENT_ID: 'fixture', GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET: 'fixture', GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: 'fixture-secret', GOOGLE_CALENDAR_OAUTH_REDIRECT_URI: 'http://localhost/fixture' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', c => { logs += c; }); child.stderr.on('data', c => { logs += c; });
  t.after(async () => {
    if (child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; }
    assert.ok(path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const waitUntil = async predicate => { for (let i = 0; i < 700; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 30)); } throw Error(`Timed out\n${logs}`); };
  await waitUntil(async () => { if (child.exitCode !== null) throw Error(logs); try { return (await fetch(`http://127.0.0.1:${port}/api/client-build-version`)).ok; } catch { return false; } });
  const req = async (url, token = '', body, status = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${url}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  };
  const teacher = (await req('/login', '', { code: 'live-teacher-code' })).token;
  const student = (await req('/login', '', { code: 'live-student-code' })).token;
  const background = req('/teacher-calendar-sync/refresh', teacher, {});
  await waitUntil(() => requests().length === 1);
  setGoogle([moved, later, past]);
  const manual = Promise.all(Array.from({ length: 4 }, () => req('/teacher-calendar-sync/refresh', teacher, { force: true })));
  await background; const results = await manual;
  assert.equal(requests().length, 2, 'manual refresh must fetch after the older background response; simultaneous clicks coalesce');
  assert.equal(results[0].importedCount, 3);
  const checkSchedules = async () => {
    for (const entries of [await req('/teacher-schedule', teacher), await req('/student-schedule?studentId=s', student)]) {
      assert.equal(entries.filter(e => e.date === day(2) && e.time === '12:00').length, 1);
      assert.equal(entries.filter(e => e.date === day(3)).length, 0, 'old occurrence must disappear');
      assert.equal(entries.filter(e => e.date === day(10)).length, 1, 'next weekly occurrence is unchanged');
    }
  };
  await checkSchedules();
  assert.ok((await req('/teacher-schedule', teacher)).some(e => e.date === day(-30)), 'history remains available');
  await req('/teacher-calendar-sync/refresh', teacher, {});
  assert.equal(requests().length, 2, 'background calls remain cached');
  const lastSuccess = (await req('/teacher-calendar-sync', teacher)).lastFetchedAt;
  setGoogle([], 503);
  const failed = await req('/teacher-calendar-sync/refresh', teacher, { force: true }, 502);
  assert.equal(failed.settings.lastFetchedAt, lastSuccess, 'failed fetch must not claim successful synchronization');
  assert.ok(failed.settings.lastError);
  setGoogle([later, past]);
  await req('/teacher-calendar-sync/refresh', teacher, { force: true });
  for (const entries of [await req('/teacher-schedule', teacher), await req('/student-schedule?studentId=s', student)]) {
    assert.ok(!entries.some(e => e.date === day(2)), 'deleted Google event must not remain in an iCal fallback');
    assert.ok(entries.some(e => e.date === day(10)));
  }
  assert.equal((await req('/teacher-calendar-sync', teacher)).lastError, '');
});
