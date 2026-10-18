import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('level notes are teacher-private, durable and protect simultaneous edits', { timeout: 60000 }, async () => {
  const fixture = await createGroupHomeworkFixture();
  const { request, tokens, data } = fixture;
  const route = '/api/students/student-a/placement-note';
  try {
    const before = fs.readFileSync(path.join(data, 'students.json'), 'utf8');
    const teacher = tokens['teacher-a'], foreign = tokens['teacher-b'], pupil = tokens['student-a'];
    assert.deepEqual((await request(route, teacher)).note, { text: '', revision: '', updatedAt: null });
    for (const token of [foreign, pupil, '']) {
      await request(route, token, null, 'GET', token ? 403 : 401);
      await request(route, token, { text: 'private', revision: '' }, 'PATCH', token ? 403 : 401);
    }
    const parent = (await request('/api/parent/login', '', { code: 'student-a-code' })).token;
    await request(route, parent, null, 'GET', 403);
    await request(route, parent, { text: 'private', revision: '' }, 'PATCH', 403);
    await request(route, teacher, { text: 'x'.repeat(6001), revision: '' }, 'PATCH', 400);
    const text = 'Python с нуля. Задание ЕГЭ №7 с подсказкой. PRIVATE_LEVEL_MARKER';
    const first = (await request(route, teacher, { text, revision: '' }, 'PATCH')).note;
    assert.equal(first.text, text); assert.ok(first.revision); assert.ok(first.updatedAt);
    assert.deepEqual((await request(route, teacher)).note, first);
    await request(route, teacher, { text: 'stale', revision: '' }, 'PATCH', 409);
    assert.equal((await request(route, teacher)).note.text, text);
    const cleared = (await request(route, teacher, { text: '', revision: first.revision }, 'PATCH')).note;
    assert.equal(cleared.text, ''); assert.notEqual(cleared.revision, first.revision);
    await request(route, teacher, { text, revision: first.revision }, 'PATCH', 409);
    await request(route, teacher, { text, revision: cleared.revision }, 'PATCH');
    for (const [url, token] of [['/api/students', teacher], ['/api/student-data?studentId=student-a', pupil], ['/api/student-data?studentId=student-a', teacher]]) {
      assert.equal(JSON.stringify(await request(url, token)).includes('PRIVATE_LEVEL_MARKER'), false, url);
    }
    assert.equal(fs.readFileSync(path.join(data, 'students.json'), 'utf8'), before);
    const stored = JSON.parse(fs.readFileSync(path.join(data, 'student-placement-notes.json'), 'utf8'));
    assert.equal(stored.notes.length, 1); assert.equal(stored.notes[0].teacherId, 'teacher-a');
  } finally { await fixture.stop(); }
});
