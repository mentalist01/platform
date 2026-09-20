import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

test('late group members receive old notes and permanent meeting links', { timeout: 60000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-notes-integration-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const now = Date.now(); const old = new Date(now - 86400000).toISOString();
  write('teachers', [{ id: 't1', name: 'Test teacher' }, { id: 't2', name: 'Other teacher' }]);
  write('students', ['s1', 's2', 'late', 'outside'].map(id => ({ id, name: id, teacherId: 't1', createdAt: old })));
  write('auth-sessions', ['t1', 't2', 's1', 's2', 'late', 'outside'].map(id => ({
    token: `fixture-${id}`, user: { id, name: id, role: id.startsWith('t') ? 'teacher' : 'student', teacherId: 't1' },
    createdAtMs: now, expiresAtMs: now + 3600000,
  })));
  write('learning-groups', [{ id: 'g1', name: 'Test group', teacherId: 't1', startedAt: old, createdAt: old, telemostUrl: 'https://telemost.yandex.ru/j/12345678901234',
    members: ['s1', 's2'].map(studentId => ({ studentId, joinedAt: old, status: 'active' })) }]);
  write('learning-lesson-sessions', [{ id: 'lesson1', groupId: 'g1', teacherId: 't1', participantIds: ['s1', 's2'],
    startAt: new Date(now - 61 * 60000).toISOString(), durationMinutes: 60, status: 'active', createdAt: old }]);
  const reserve = net.createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), PLATFORM_DATA_DIR: data, PLATFORM_UPLOADS_DIR: path.join(root, 'uploads'),
      PLATFORM_COLLAB_DIR: path.join(root, 'collab'), PLATFORM_JSON_BACKUPS_DIR: path.join(root, 'backups'), ADMIN_CODE: 'fixture-admin-only' },
  });
  let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    // This is the unique fixture directory created above, never platform data.
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request = async (route, { actor = 't1', body, method, token, status = 200 } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${route}`, { method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || `fixture-${actor}`}` },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
    const value = await r.json(); assert.equal(r.status, status, `${route}: ${JSON.stringify(value)}`); return value;
  };
  let started = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Fixture server exited: ${logs}`);
    try { await request('/session'); started = true; break; } catch { await delay(200); }
  }
  assert.ok(started, `Fixture server did not start: ${logs}`);
  const uploadNote = async (name) => {
    const body = new FormData();
    body.set('file', new Blob(['print(42)'], { type: 'text/plain' }), name);
    body.set('taskNumber', '23'); body.set('category', 'class');
    body.set('learningGroupId', 'g1'); body.set('learningLessonId', 'lesson1');
    const r = await fetch(`http://127.0.0.1:${port}/api/files`, {
      method: 'POST', headers: { Authorization: 'Bearer fixture-t1' }, body,
    });
    const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result;
  };
  const oldNote = await uploadNote('old-note.py');
  const list = (actor) => request(`/files?studentId=${actor}&taskNumber=23`, { actor });
  assert.equal((await list('late')).length, 0);
  await request('/learning-groups/g1/members', { body: { studentId: 'late', lateAddReason: 'Joined later' } });
  assert.ok((await list('late')).some((note) => note.id === oldNote.id));
  assert.equal((await list('outside')).length, 0);
  const read = async (note, actor, status) => {
    const r = await fetch(`http://127.0.0.1:${port}${note.url}?studentId=${actor}`, {
      headers: { Authorization: `Bearer fixture-${actor}` },
    });
    assert.equal(r.status, status, await r.text());
  };
  await read(oldNote, 'late', 200);
  await read(oldNote, 'outside', 403);
  await request(`/files/${oldNote.id}`, { actor: 'late', method: 'PATCH', body: { name: 'changed.py' }, status: 403 });
  await request(`/files/${oldNote.id}`, { actor: 't2', method: 'PATCH', body: { name: 'changed.py' }, status: 403 });
  const future = await request('/learning-groups/g1/lessons', { body: {
    startAt: new Date(now + 86400000).toISOString(), durationMinutes: 60, topic: 'Future lesson',
  }, status: 201 });
  const futureView = await request(`/learning-groups/g1/lessons/${future.lesson.id}`, { actor: 'late' });
  assert.equal(futureView.lesson.telemostUrl, 'https://telemost.yandex.ru/j/12345678901234');
  assert.equal(futureView.lesson.status, 'scheduled');
  await request('/learning-groups/g1/members/late', { method: 'DELETE' });
  await delay(20);
  const newNote = await uploadNote('after-leaving.py');
  assert.ok((await list('late')).some((note) => note.id === oldNote.id));
  assert.ok(!(await list('late')).some((note) => note.id === newNote.id));
  await read(oldNote, 'late', 200);
  await read(newNote, 'late', 403);

  // A Python video becomes an ordinary reusable library material with its own quiz.
  const { material } = await request('/learning-materials', { status: 201, body: {
    title: 'Python video with separate questions', kind: 'video',
    url: 'https://rutube.ru/play/embed/abc123/?p=private_key',
    quizQuestions: [{ id: 'video-q1', question: 'What does print(2 + 3) output?', answer: '5' }],
  } });
  await request('/student-next-lesson', { method: 'PATCH', body: {
    studentId: 's2', homeWork: 'Watch and answer', materialIds: [material.id], daysToComplete: 7,
  } });
  const { assignment } = await request('/learning-groups/g1/assignments', { status: 201, body: {
    title: 'Watch the Python video', content: 'Answer the video quiz', status: 'assigned', materialIds: [material.id],
  } });
  for (const actor of ['s1', 's2']) {
    const view = await request('/student-next-lesson', { actor });
    const homework = view.homeworks.find((entry) => actor === 's1'
      ? entry.learningAssignmentId === assignment.id
      : entry.source !== 'learning-group' && entry.materialIds?.includes(material.id));
    assert.ok(homework, `Video homework missing for ${actor}`);
    const video = homework.learningMaterials.find((entry) => entry.id === material.id);
    assert.equal(video.url, 'https://rutube.ru/play/embed/abc123/?p=private_key');
    assert.equal(video.quizQuestions[0].question, material.quizQuestions[0].question);
    assert.equal(video.quizQuestions[0].answer, undefined);
    const result = await request(`/student-next-lesson/${homework.id}/video-quiz`, { actor, method: 'PATCH', body: {
      materialId: material.id, answers: { 'video-q1': '5' },
    } });
    assert.ok(JSON.stringify(result).includes('"completed":true'));
  }
});
