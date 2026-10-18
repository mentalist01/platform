import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('parent contacts persist only in staff storage and enforce pupil/teacher isolation', { timeout: 60000 }, async () => {
  const fixture = await createGroupHomeworkFixture();
  const { request, tokens, data } = fixture;
  const route = '/api/students/student-a/parent-contact';
  try {
    const before = fs.readFileSync(path.join(data, 'students.json'), 'utf8');
    const a = tokens['teacher-a'], b = tokens['teacher-b'], child = tokens['student-a'];
    assert.deepEqual((await request('/api/student-parent-contacts', a)).contacts, {});
    await request(route, b, { url: 'https://t.me/wrong_parent' }, 'PATCH', 403);
    await request(route, child, { url: 'https://t.me/wrong_parent' }, 'PATCH', 403);
    await request('/api/student-parent-contacts', child, null, 'GET', 403);
    const parent = (await request('/api/parent/login', '', { code: 'student-a-code' })).token;
    await request('/api/student-parent-contacts', parent, null, 'GET', 403);
    await request(route, parent, { url: 'https://t.me/wrong_parent' }, 'PATCH', 403);
    await request(route, a, { url: 'javascript:alert(1)' }, 'PATCH', 400);
    const saved = await request(route, a, { name: 'Мама · тест', url: '@example_parent' }, 'PATCH');
    assert.equal(saved.contact.url, 'https://t.me/example_parent');
    assert.equal((await request('/api/student-parent-contacts', a)).contacts['student-a'].name, 'Мама · тест');
    assert.deepEqual((await request('/api/student-parent-contacts?teacherId=teacher-a', b)).contacts, {});
    await request('/api/students/student-b/parent-contact', a, { url: 'https://vk.com/another_parent' }, 'PATCH');
    await request(route, a, { name: '', url: '' }, 'PATCH');
    const contacts = (await request('/api/student-parent-contacts', a)).contacts;
    assert.equal(contacts['student-a'], undefined); assert.equal(contacts['student-b'].url, 'https://vk.com/another_parent');
    const stored = JSON.parse(fs.readFileSync(path.join(data, 'student-parent-contacts.json'), 'utf8'));
    assert.equal(stored.contacts.length, 1); assert.equal(stored.contacts[0].teacherId, 'teacher-a');
    assert.equal(fs.readFileSync(path.join(data, 'students.json'), 'utf8'), before);
    assert.equal(JSON.stringify(await request('/api/students', a)).includes('another_parent'), false);
    assert.deepEqual(await request('/api/my-parent-contact', child), { added: false });
    await request('/api/my-parent-contact', parent, null, 'GET', 403);
    await request('/api/my-parent-contact', a, { url: '@example_parent' }, 'POST', 403);
    await request('/api/my-parent-contact', child, { studentId: 'student-b', url: '@example_parent' }, 'POST', 403);
    await request('/api/my-parent-contact', child, { url: 'javascript:alert(1)' }, 'POST', 400);
    assert.deepEqual(await request('/api/my-parent-contact', child, { name: 'Мама', url: '+7 (999) 000-00-00' }), { added: true });
    assert.deepEqual(await request('/api/my-parent-contact', child), { added: true });
    const submitted = (await request('/api/student-parent-contacts', a)).contacts['student-a'];
    assert.equal(submitted.providedByStudent, true); assert.equal(submitted.url, 'https://t.me/+79990000000');
    await request('/api/my-parent-contact', child, { name: 'Overwrite', url: '@other_parent' });
    assert.deepEqual((await request('/api/student-parent-contacts', a)).contacts['student-a'], submitted);
    assert.equal(JSON.stringify(await request('/api/my-parent-contact', child)).includes('7999'), false);
    assert.deepEqual((await request('/api/student-parent-contacts', b)).contacts, {});
  } finally { await fixture.stop(); }
});
