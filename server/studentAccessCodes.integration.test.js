import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('real login, student creation and reset retain codes without exposing them in ordinary rosters', { timeout: 60000 }, async () => {
  const known = '746291', salt = 'test-only-salt';
  const f = await createGroupHomeworkFixture(undefined, (write, data) => {
    const students = JSON.parse(fs.readFileSync(path.join(data, 'students.json')));
    write('students', [...students, { id: 'legacy', name: 'Старый код · тест', teacherId: 'teacher-a', grade: '11',
      codeHash: `scrypt$${salt}$${scryptSync(known, salt, 64).toString('base64')}`, codeHint: known.slice(-4) }]);
  });
  try {
    const teacher = f.tokens['teacher-a'], get = id => f.request(`/api/students/${id}/access-code`, teacher);
    assert.deepEqual(await get('legacy'), { available: false });
    await f.request('/api/login', '', { code: known });
    assert.deepEqual(await get('legacy'), { available: true, code: known }, 'Successful legacy login retains its existing code');
    assert.equal((await get('student-a')).code, 'student-a-code', 'Plaintext migration retained the old code before removing it');
    const created = await f.request('/api/students', teacher, { name: 'Новый код · тест', grade: '11' });
    assert.equal((await get(created.id)).code, created.code);
    const reset = await f.request(`/api/students/${created.id}/reset-code`, teacher, {});
    assert.notEqual(reset.code, created.code);
    assert.equal((await get(created.id)).code, reset.code);
    await f.request('/api/login', '', { code: created.code }, 'POST', 401);
    await f.request('/api/login', '', { code: reset.code });
    const roster = await f.request('/api/students', teacher);
    assert.ok(roster.every(student => !Object.hasOwn(student, 'code') && !Object.hasOwn(student, 'codeHash')));
    await f.request(`/api/students/${created.id}/access-code`, f.tokens['teacher-b'], undefined, 'GET', 404);
    await f.request(`/api/students/${created.id}/access-code`, f.tokens['student-a'], undefined, 'GET', 403);
    await f.request(`/api/students/${created.id}/access-code`, '', undefined, 'GET', 401);
  } finally { await f.stop(); }
});
