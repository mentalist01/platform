import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';

test('board attachments preserve arbitrary bytes/names, download safely and enforce pupil/lesson access', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  const uploads = path.join(f.root, 'uploads');
  const upload = async ({ name = 'Данные №22.xlsx', bytes = Buffer.from([0, 255, 127, 1, 2]), actor = 'teacher-a', scope = { studentId: 'student-a' }, expected = 201 } = {}) => {
    const form = new FormData(); form.append('file', new Blob([bytes]), name);
    for (const [key, value] of Object.entries(scope)) form.append(key, value);
    const response = await fetch(`${f.base}/api/board-files`, { method: 'POST', headers: { Authorization: `Bearer ${f.tokens[actor]}` }, body: form });
    const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value));
    // The response can arrive while the handler's asynchronous finally unlink
    // is completing. Check eventual cleanup rather than response packet timing.
    const pending = () => fs.readdirSync(uploads).some(name => name.startsWith('board-asset-pending-'));
    for (let i = 0; pending() && i < 50; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(pending(), false, 'Upload temporaries are cleaned on success and rejection');
    return value;
  };
  const download = async (file, actor, expected, bytes) => {
    const response = await fetch(f.base + file.url, { headers: { Authorization: `Bearer ${f.tokens[actor]}` } });
    assert.equal(response.status, expected);
    if (expected === 200) {
      assert.match(response.headers.get('content-type'), /^application\/octet-stream/);
      assert.match(response.headers.get('content-disposition'), /^attachment;/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    return response;
  };
  try {
    const bytes = Buffer.from([0, 255, 127, 1, 2]);
    const first = await upload(); assert.equal(first.kind, 'file'); assert.equal(first.name, 'Данные №22.xlsx'); assert.equal(first.sizeBytes, 5);
    const again = await upload({ expected: 200 }); assert.equal(again.id, first.id);
    const renamed = await upload({ name: 'Архив.zip' }); assert.notEqual(renamed.storageName, first.storageName);
    const response = await download(first, 'student-a', 200, bytes);
    assert.ok(response.headers.get('content-disposition').includes(encodeURIComponent('Данные №22.xlsx')));
    await download(first, 'student-b', 404); await download(first, 'teacher-b', 404);
    await upload({ actor: 'teacher-b', expected: 403 });
    await upload({ actor: 'student-b', expected: 403 });
    const zero = await upload({ name: 'пустой.txt', bytes: Buffer.alloc(0), actor: 'student-a' });
    await download(zero, 'teacher-a', 200, Buffer.alloc(0));
    const htmlBytes = Buffer.from('<html><script>alert(1)</script></html>');
    const html = await upload({ name: 'example.html', bytes: htmlBytes });
    await download(html, 'student-a', 200, htmlBytes);
    const lesson = (await f.request(`/api/learning-groups/${f.groupId}/lessons`, f.tokens['teacher-a'], { startAt: new Date(Date.now() + 60000).toISOString(), durationMinutes: 60, topic: 'Файлы на доске' }, 'POST', 201)).lesson;
    const scope = { lessonId: lesson.id, roomId: `board-lesson-${lesson.id}~page~page-one` };
    const shared = await upload({ scope });
    assert.notEqual(shared.id, first.id, 'The same file receives a separate destination grant');
    await download(shared, 'student-a', 200, bytes); await download(shared, 'student-b', 200, bytes);
    await download(shared, 'student-c', 404); await download(shared, 'teacher-b', 404);
    await upload({ scope, actor: 'student-c', expected: 403 });
    const head = await fetch(f.base + shared.url, { method: 'HEAD', headers: { Authorization: `Bearer ${f.tokens['student-b']}` } });
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '5');
    const records = JSON.parse(fs.readFileSync(path.join(f.data, 'board-assets.json'), 'utf8'));
    assert.ok(records.find(item => item.id === first.id && item.kind === 'file' && item.name === first.name));
  } finally { await f.stop(); }
});
