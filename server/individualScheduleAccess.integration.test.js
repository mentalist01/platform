import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moscowDay, addCalendarDays } from '../src/utils/groupAvailability.js';

test('full server: current mini-group members cannot request individual schedules; leaving and completing restore access', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-group-schedule-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const seed = (file, value) => fs.writeFileSync(path.join(data, file), JSON.stringify(value));
  const createdAt = new Date(Date.now() - 86400000).toISOString();
  const startDate = addCalendarDays(moscowDay(), 2);
  seed('teachers.json', [{ id: 't', name: 'Teacher', code: '735001', createdAt }, { id: 'u', name: 'Other', code: '735009', createdAt }]);
  seed('students.json', ['a', 'b', 'c', 'd', 'e', 'f', 'z'].map((id, i) => ({ id, teacherId: 't', name: id, code: String(735002 + i), createdAt, deletedAt: null })));
  const source = { id: 'lesson', date: startDate, time: '16:00', durationMinutes: 60 };
  seed('progress.json', { a: { schedule: [source], homeworks: [] } });
  seed('tests.json', {}); seed('mock-exams.json', []);
  const group = (id, studentId, extra = {}) => ({ id, teacherId: 't', name: id, maxStudents: 3, createdAt,
    members: [{ studentId, status: 'active', joinedAt: createdAt }], ...extra });
  seed('learning-groups.json', [
    group('forming', 'b', { members: ['b', 'z'].map(studentId => ({ studentId, status: 'active', joinedAt: createdAt })) }), group('active', 'c', { startedAt: createdAt }),
    group('completed', 'd', { startedAt: createdAt, completedAt: createdAt }),
    group('removed', 'e', { members: [{ studentId: 'e', status: 'removed', joinedAt: createdAt, leftAt: createdAt }] }),
    group('deleted', 'f', { deletedAt: createdAt }), group('old-teacher', 'e', { teacherId: 'u' }),
  ]);
  const groupStartAt = `${startDate}T20:00:00+03:00`;
  seed('learning-lesson-sessions.json', [
    { id: 'google-group', groupId: 'forming', teacherId: 't', startAt: groupStartAt, durationMinutes: 60,
      status: 'scheduled', source: 'google-calendar', participantIds: ['b', 'z'], externalEventId: 'uid', createdAt },
    { id: 'planned-group', groupId: 'forming', teacherId: 't', startAt: groupStartAt, durationMinutes: 60,
      status: 'scheduled', source: 'availability-plan', participantIds: ['b'], createdAt },
  ]);
  seed('progress.json', { a: { schedule: [source], homeworks: [] }, b: { schedule: [
    { id: 'imported', groupId: 'forming', date: startDate, time: '20:00', durationMinutes: 60,
      subject: 'Занятие', source: 'google-calendar', externalEventId: 'uid', lessonId: 'google-group', isLearningGroupEvent: true },
    { id: 'planned', groupId: 'forming', date: startDate, time: '20:00', durationMinutes: 60,
      subject: 'forming', source: 'availability-plan', lessonId: 'planned-group', isLearningGroupEvent: true },
  ] } });
  const port = await new Promise(resolve => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
  });
  let child, logs = '';
  const stop = async () => { if (!child || child.exitCode !== null) return; const done = new Promise(r => child.once('exit', r)); child.kill(); await done; };
  t.after(async () => { await stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const boot = async () => {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
        PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', c => logs += c); child.stderr.on('data', c => logs += c);
    for (let i = 0; i < 180; i++) {
      if (child.exitCode !== null) throw Error(logs);
      try { if ((await fetch(`http://127.0.0.1:${port}/api/client-build-version`)).ok) return; } catch { /* Starting. */ }
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error(logs);
  };
  const req = async (url, token = '', body, status = 200, method = body === undefined ? 'GET' : 'POST') => {
    const r = await fetch(`http://127.0.0.1:${port}/api${url}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const v = await r.json(); assert.equal(r.status, status, `${url}: ${JSON.stringify(v)}\n${logs.slice(-500)}`); return v;
  };
  await boot();
  const teacher = (await req('/login', '', { code: '735001' })).token;
  const tokens = {};
  for (const [i, id] of ['a', 'b', 'c', 'd', 'e', 'f'].entries()) {
    tokens[id] = (await req('/login', '', { code: String(735002 + i) })).token;
    const options = await req('/student-schedule?includeOptions=1', tokens[id]);
    assert.equal(options.canRequestIndividualSchedule, !['b', 'c'].includes(id), id);
    assert.ok(Array.isArray(options.schedule));
    assert.ok(Array.isArray(await req('/student-schedule', tokens[id])), 'Legacy API shape is preserved');
    if (['b', 'c'].includes(id)) {
      for (const endpoint of ['weekly-schedules', 'lesson-reschedules']) {
        await req(`/${endpoint}/availability`, tokens[id], undefined, 403);
        await req(`/${endpoint}`, tokens[id], {}, 403);
      }
    }
  }
  const student = tokens.a;
  const groupSchedule = await req('/student-schedule', tokens.b);
  assert.equal(groupSchedule.filter(e => e.groupId === 'forming' && e.date === startDate && e.time === '20:00').length, 1);
  assert.equal((await req('/learning-groups/forming/lessons', tokens.b)).lessons.length, 1);
  const noImportedToken = (await req('/login', '', { code: '735008' })).token;
  const noImportedProgress = await req('/student-schedule', noImportedToken);
  assert.equal(noImportedProgress.filter(e => e.groupId === 'forming' && e.time === '20:00').length, 1, 'A participant without a cached Google schedule still sees the canonical group lesson');
  const weekly = await req('/weekly-schedules', student, { startDate, slots: ['0-600'], baseSignature: '[]' });
  const transfer = await req('/lesson-reschedules', student, { lessonKey: `lesson|${startDate}|16:00`, date: addCalendarDays(startDate, 1), time: '18:00' });
  const abort = new AbortController(); t.after(() => abort.abort());
  const stream = await fetch(`http://127.0.0.1:${port}/api/schedule-sync/stream`, { headers: { Authorization: `Bearer ${student}` }, signal: abort.signal });
  const reader = stream.body.getReader(); await reader.read();
  await req('/learning-groups/forming/members', teacher, { studentId: 'a' });
  const event = new TextDecoder().decode((await reader.read()).value);
  assert.match(event, /learning-group-membership/); assert.match(event, /"studentId":"a"/);
  abort.abort();
  assert.equal((await req('/student-schedule?includeOptions=1', student)).canRequestIndividualSchedule, false);
  for (const [endpoint, row] of [['weekly-schedules', weekly], ['lesson-reschedules', transfer]]) {
    assert.match((await req(`/${endpoint}/${row.id}/preview`, teacher)).conflict, /мини-группы/);
    await req(`/${endpoint}/${row.id}/approve`, teacher, {}, 403);
    assert.equal((await req(`/${endpoint}`, student)).requests[0].status, 'pending');
  }
  assert.equal((await req(`/weekly-schedules/${weekly.id}/cancel`, student, {})).status, 'cancelled');
  assert.equal((await req(`/lesson-reschedules/${transfer.id}/reject`, teacher, {})).status, 'rejected');
  const joinedSchedule = await req('/student-schedule', student);
  assert.equal(joinedSchedule.filter(e => !e.groupId).length, 1);
  assert.equal(joinedSchedule.filter(e => e.groupId === 'forming').length, 1);
  await req('/learning-groups/forming/members/a', teacher, undefined, 200, 'DELETE');
  assert.equal((await req('/student-schedule?includeOptions=1', student)).canRequestIndividualSchedule, true);
  await req('/weekly-schedules/availability', student); await req('/lesson-reschedules/availability', student);
  await req('/learning-groups/active/complete', teacher, {});
  assert.equal((await req('/student-schedule?includeOptions=1', tokens.c)).canRequestIndividualSchedule, true);
  const newGroup = await req('/learning-groups', teacher, { name: 'Новая группа', studentIds: ['a'] }, 201);
  assert.equal((await req('/student-schedule?includeOptions=1', student)).canRequestIndividualSchedule, false);
  await stop(); await boot();
  assert.equal((await req('/student-schedule?includeOptions=1', student)).canRequestIndividualSchedule, false);
  await req(`/learning-groups/${newGroup.group.id}/members/a`, teacher, undefined, 200, 'DELETE');
  assert.equal((await req('/student-schedule?includeOptions=1', student)).canRequestIndividualSchedule, true);
});
