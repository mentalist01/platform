import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('full server: live name checks, concurrent creation, and an assigned recording give only homework access', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-recording-homework-')); const data = path.join(root, 'data'); fs.mkdirSync(data);
  const seed = (name, value) => fs.writeFileSync(path.join(data, name + '.json'), JSON.stringify(value));
  const createdAt = new Date().toISOString();
  seed('teachers', [{ id: 't', name: 'Teacher', code: '110001', createdAt }, { id: 'u', name: 'Other', code: '220001', createdAt }]);
  seed('students', [{ id: 'a', name: 'Александр', nickname: 'Саша 11', teacherId: 't', code: '110101', createdAt },
    { id: 'b', name: 'Анна', nickname: '', teacherId: 't', code: '110102', createdAt },
    { id: 'c', name: 'Пётр', nickname: 'Петя', teacherId: 'u', code: '220101', createdAt }]);
  seed('tests', {}); seed('mock-exams', []); seed('progress', { a: { homeworks: [] }, b: { homeworks: [] }, c: { homeworks: [] } });
  const videoUrl = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=private';
  const job = { id: 'recorded', teacherId: 't', status: 'ready', desired: 'stop', occurrence: { studentId: 'a', dayKey: '2026-09-29', time: '18:00', durationMinutes: 60, key: 'original-a' },
    title: 'Урок с Александром', video: { url: videoUrl, durationMs: 3600000 }, cutoffAt: Date.now() - 1000 };
  seed('desktop-recordings', { teachers: {}, devices: {}, jobs: { recorded: { ...job, updatedAt: 1 }, foreign: { ...job, id: 'foreign', teacherId: 'u' },
    ...Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`recent-${index}`, { ...job, id: `recent-${index}`, updatedAt: Date.now(), status: 'error' }])),
  } });
  const port = await new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  let logs = ''; const child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
      PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), COLLAB_PERSISTENCE: '0', DISABLE_STARTUP_XP_REBALANCE: '1', LEARNING_GROUPS_ENABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; }
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(resolved), /^ivan-recording-homework-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (let i = 0; i < 180; i++) { if (child.exitCode !== null) throw Error(logs); try { if ((await fetch(`http://127.0.0.1:${port}/api/client-build-version`)).ok) break; } catch { /* Starting. */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  const req = async (url, token = '', body, expected = 200, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`http://127.0.0.1:${port}/api${url}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const value = await response.json();
    assert.equal(response.status, expected, `${url}: ${JSON.stringify(value)} ${logs.slice(-300)}`); return value;
  };
  const teacher = (await req('/login', '', { code: '110001' })).token;
  const student = (await req('/login', '', { code: '110102' })).token;
  const other = (await req('/login', '', { code: '220001' })).token;
  await req('/students/name-availability', student, { name: 'Александр' }, 403);
  const conflict = await req('/students/name-availability', teacher, { name: ' САША 11 ' });
  assert.equal(conflict.nameTaken, true); assert.equal(conflict.canCreate, false);
  assert.ok(!JSON.stringify(conflict).includes('teacherId'));
  assert.equal((await req('/students/name-availability', teacher, { name: 'петя' })).nameTaken, true, 'Other teachers names are checked without exposing accounts');
  await req('/students', teacher, { name: 'Александр' }, 409);
  await req('/students', teacher, { name: 'Новое', nickname: 'Саша 11' }, 409);
  const created = await req('/students', teacher, { name: 'Александр', nickname: 'Саша 10' });
  assert.equal(created.nickname, 'Саша 10');
  await req(`/students/${created.id}`, teacher, { nickname: 'Анна' }, 409, 'PATCH');
  await req(`/students/${created.id}`, teacher, { grade: 10 }, 200, 'PATCH');
  const attempts = await Promise.all([1, 2].map(async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/students`, { method: 'POST', headers: { Authorization: `Bearer ${teacher}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Уникальный' }) }); return r.status;
  }));
  assert.deepEqual(attempts.sort(), [200, 409]);
  await req('/lesson-recording-library', student, undefined, 403);
  const library = await req('/lesson-recording-library?teacherId=u', teacher);
  assert.deepEqual(library.recordings.map(row => row.id), ['recorded']);
  await req('/lesson-recording-library/foreign/material', teacher, { title: 'Foreign', teacherId: 'u' }, 404);
  const material = (await req('/lesson-recording-library/recorded/material', teacher, { title: 'Задание 3 — объяснение' }, 201)).material;
  assert.equal(material.kind, 'video'); assert.deepEqual(material.quizQuestions, []);
  assert.equal((await req('/lesson-recording-library/recorded/material', teacher, { title: 'Repeat' })).material.id, material.id);
  await req('/student-next-lesson', other, { studentId: 'c', materialIds: [material.id] }, 404, 'PATCH');
  await req('/student-next-lesson', teacher, { studentId: 'b', materialIds: [material.id], homeWork: '', daysToComplete: 7 }, 200, 'PATCH');
  const homework = await req('/student-next-lesson', student);
  const latest = homework.latest;
  assert.equal(latest.learningMaterials[0].url, videoUrl); assert.equal(latest.learningMaterials[0].kind, 'video');
  assert.ok(!Object.hasOwn(latest.learningMaterials[0], 'recordingSource'));
  assert.equal(latest.homeWork, 'Посмотреть «Задание 3 — объяснение»');
  assert.equal(latest.checklistItems.length, 1);
  await req(`/student-next-lesson/${latest.id}/checklist`, student, { itemId: latest.checklistItems[0].id, completed: true }, 200, 'PATCH');
  assert.deepEqual((await req('/lesson-history?studentId=a', student)).items, [], 'A supplied student id cannot expose the source student history');
  await req('/lesson-history/detail?studentId=a&occurrenceKey=original-a', student, undefined, 404);
  const original = JSON.parse(fs.readFileSync(path.join(data, 'desktop-recordings.json'), 'utf8'));
  assert.equal(original.jobs.recorded.occurrence.studentId, 'a'); assert.equal(original.jobs.recorded.video.url, videoUrl);
});
