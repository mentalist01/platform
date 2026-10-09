import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupHomeworkFixture } from './groupHomework.fixture.js';
import { resolveBoardAssetTarget } from '../src/utils/boardAssetTarget.js';

test('group board images upload from a stale picker, survive page/call navigation and stay within the lesson ACL', { timeout: 60000 }, async () => {
  const f = await createGroupHomeworkFixture();
  try {
    const lesson = (await f.request(`/api/learning-groups/${f.groupId}/lessons`, f.tokens['teacher-a'], { startAt: new Date(Date.now() + 60000).toISOString(), durationMinutes: 60, topic: 'Проверка групповой доски' }, 'POST', 201)).lesson;
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWfQAAAAASUVORK5CYII=', 'base64');
    const upload = async (roomId, actor, expected) => {
      const target = resolveBoardAssetTarget('student-c', { roomId });
      const form = new FormData(); form.append('file', new Blob([image], { type: 'image/png' }), 'clipboard.png');
      if (target.studentId) form.append('studentId', target.studentId);
      if (target.lessonId) form.append('lessonId', target.lessonId);
      const response = await fetch(`${f.base}/api/board-assets`, { method: 'POST', headers: { Authorization: `Bearer ${f.tokens[actor]}` }, body: form });
      const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value;
    };
    const room = `board-lesson-${lesson.id}`;
    const first = await upload(room, 'teacher-a', 201);
    for (const suffix of ['~page~page-1234', '~student~student-a~page~page-1234', '']) {
      const next = await upload(room + suffix, 'teacher-a', 200); assert.equal(next.id, first.id);
    }
    await upload(room, 'student-a', 200);
    await upload(room, 'teacher-b', 403);
    await upload(room, 'student-c', 403);
    // Hidden uploads are indistinguishable from missing files to outsiders.
    for (const [actor, expected] of [['student-a', 200], ['student-b', 200], ['student-c', 404], ['teacher-b', 404]]) {
      const response = await fetch(f.base + first.url, { headers: { Authorization: `Bearer ${f.tokens[actor]}` } });
      assert.equal(response.status, expected); if (expected === 200) assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    }
  } finally { await f.stop(); }
});
