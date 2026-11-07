import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('lesson venue is durable, owner-controlled and preserves Telemost and other student settings', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  try {
    const teacher = f.tokens['teacher-a'], route = '/api/students/student-a';
    const roster = () => f.request('/api/students', teacher);
    assert.equal((await roster()).find(s => s.id === 'student-a').lessonVenue, 'platform');
    const url = 'https://telemost.yandex.ru/j/12345678901234';
    const first = await f.request(route, teacher, { lessonVenue: 'telemost', telemostUrl: url }, 'PATCH');
    assert.equal(first.lessonVenue, 'telemost'); assert.equal(first.telemostUrl, url);
    assert.ok(first.lessonVenueUpdatedAt);
    await f.request(route, teacher, { nickname: 'Новое имя' }, 'PATCH');
    const persisted = (await roster()).find(s => s.id === 'student-a');
    assert.equal(persisted.lessonVenue, 'telemost'); assert.equal(persisted.telemostUrl, url);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.data, 'students.json'))).find(s => s.id === 'student-a').lessonVenue, 'telemost');
    for (const token of [f.tokens['teacher-b'], f.tokens['student-a'], '']) {
      await f.request(route, token, { lessonVenue: 'platform' }, 'PATCH', token ? 403 : 401);
    }
    for (const lessonVenue of [null, '', 'external', {}, 1]) await f.request(route, teacher, { lessonVenue }, 'PATCH', 400);
    await f.request(route, teacher, { lessonVenue: 'platform', telemostUrl: 'https://example.com/j/abc' }, 'PATCH', 400);
    assert.equal((await roster()).find(s => s.id === 'student-a').lessonVenue, 'telemost');
    const platform = await f.request(route, teacher, { lessonVenue: 'platform' }, 'PATCH');
    assert.equal(platform.telemostUrl, url, 'Switching venue should retain the saved link');
    assert.equal(platform.lessonVenue, 'platform');
  } finally { await f.stop(); }
});
