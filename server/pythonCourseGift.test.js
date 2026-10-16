import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createPythonCourseGiftStore, projectPythonGiftCourse, registerPythonCourseGiftRoutes } from './pythonCourseGift.js';

const catalog = [{ id: 101, number: 101, title: 'Ввод и вывод', sectionId: 'topics', displayNumber: '1' }];
const fixture = { __pythonTaskCatalog: catalog, student: { name: 'PRIVATE_STUDENT' }, 7: { basic: [{ answer: 'PRIVATE_EGE' }] }, 101: {
  python: [{ id: 'q1', title: 'Сумма', question: 'Сложите два числа', starterCode: '# Начните здесь', subsectionId: 'sum', teacherId: 'PRIVATE_OWNER', solution: 'PRIVATE_SOLUTION', tests: [{ input: '1\n2', output: '3', secret: 'PRIVATE_TEST' }], screenshots: [{ url: '/uploads/course.png', name: 'Схема' }], files: [{ url: '/uploads/input.txt', name: 'input.txt' }, { url: '/uploads/private.txt?_auth=PRIVATE_TOKEN' }] }],
  pythonSubsections: [{ id: 'sum', title: 'Сложение', order: 0 }],
  pythonTheory: { type: 'rutube', content: 'https://rutube.ru/video/123/?p=video-access', chapters: [{ time: 0, title: 'Введение' }, { time: 15, title: 'Пример' }] },
  pythonTheoryBySubsection: { sum: { type: 'text', content: 'Числа складывают оператором +.' } },
} };
test('projection shares only course material, keeping subsections, files and video chapters', () => {
  const { tasks, assets } = projectPythonGiftCourse(fixture, [], 'T'.repeat(43));
  assert.equal(tasks.length, 1); assert.equal(assets.size, 2);
  const entry = tasks[0].entry;
  assert.deepEqual(entry.pythonSubsections, fixture[101].pythonSubsections);
  assert.deepEqual(entry.pythonTheory.rutube.chapters, fixture[101].pythonTheory.chapters);
  assert.equal(entry.pythonTheoryBySubsection.sum.text.content, 'Числа складывают оператором +.');
  assert.match(entry.python[0].files[0].url, /^\/api\/python-course-gifts\/T+\/asset\/[a-f0-9]{64}$/);
  assert.equal(entry.python[0].files.length, 1);
  assert.doesNotMatch(JSON.stringify(tasks), /PRIVATE_|teacherId|solution/);
});
test('recording media is rewritten inside board events and audio without storage credentials', () => {
  const tests = structuredClone(fixture);
  tests[101].pythonTheory = { type: 'recording', content: { version: 1, initialCode: '', durationMs: 1000,
    audio: { url: '/uploads/audio.webm', storageName: 'PRIVATE_STORAGE', durationMs: 1000 },
    events: [{ t: 100, type: 'board', action: 'image', image: { id: 'img', src: '/uploads/course.png', x: 0, y: 0, width: 100, height: 100 } }, { t: 500, type: 'board', action: 'snapshot', strokes: [], images: [{ id: 'img2', src: 'https://evil.example/track.png', x: 0, y: 0, width: 100, height: 100 }] }],
  } };
  const { tasks } = projectPythonGiftCourse(tests, [], 'a'.repeat(43));
  const recording = tasks[0].entry.pythonTheory.recording.content;
  assert.match(recording.audio.url, /^\/api\/python-course-gifts/);
  assert.match(recording.events[0].image.src, /^\/api\/python-course-gifts/);
  assert.deepEqual(recording.events[1].images, []);
  assert.doesNotMatch(JSON.stringify(recording), /PRIVATE_STORAGE|evil\.example/);
});
test('routes require teacher ownership, support anonymous reads and reversible revocation, restrict assets', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-gift-routes-'));
  fs.writeFileSync(path.join(root, 'course.png'), 'fixture-image'); fs.writeFileSync(path.join(root, 'input.txt'), '1\n2'); fs.writeFileSync(path.join(root, 'private.txt'), 'DO_NOT_SHARE');
  const filePath = path.join(root, 'shares.json'); const store = createPythonCourseGiftStore({ filePath });
  const app = express(); app.use(express.json());
  const options = { store, readTests: teacher => ({ ...fixture, 101: { ...fixture[101], python: fixture[101].python.map(q => ({ ...q, title: teacher })) } }), fallbackTasks: [], uploadsDir: root };
  registerPythonCourseGiftRoutes(app, { ...options, publicRoutes: true });
  app.use('/api', (req, res, next) => { const identity = req.headers.authorization?.split(' '); if (!identity) return res.sendStatus(401); req.auth = { role: identity[0], id: identity[1] }; next(); });
  registerPythonCourseGiftRoutes(app, options);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url = '/api/python-course-gift', role, enabled, extra = {}) => fetch(base + url, { method: enabled === undefined ? 'GET' : 'PUT', headers: { ...(role ? { Authorization: role } : {}), 'Content-Type': 'application/json' }, ...(enabled === undefined ? {} : { body: JSON.stringify({ enabled, ...extra }) }) });
  assert.equal((await request()).status, 401);
  assert.equal((await request(undefined, 'student pupil')).status, 403);
  assert.equal((await request(undefined, 'student pupil', true)).status, 403);
  assert.equal(fs.existsSync(filePath), false);
  const first = await (await request(undefined, 'teacher one', true, { teacherId: 'two' })).json();
  const second = await (await request(undefined, 'teacher two', true)).json();
  assert.notEqual(first.path, second.path);
  assert.equal((await (await request(undefined, 'teacher one')).json()).path, first.path);
  const endpoint = first.path.replace('/python-gift/', '/api/python-course-gifts/');
  const response = await request(endpoint);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('set-cookie'), null);
  const course = await response.json(); assert.equal(course.tasks[0].entry.python[0].title, 'one'); assert.ok(course.id);
  const asset = course.tasks[0].entry.python[0].screenshots[0].url;
  assert.equal(await (await request(asset)).text(), 'fixture-image');
  assert.equal((await request(endpoint + '/asset/' + '0'.repeat(64))).status, 404);
  assert.equal((await request('/api/python-course-gifts/bad')).status, 404);
  await request(undefined, 'teacher one', false);
  assert.equal((await request(endpoint)).status, 404); assert.equal((await request(asset)).status, 404);
  assert.equal((await request(second.path.replace('/python-gift/', '/api/python-course-gifts/'))).status, 200);
  assert.equal((await (await request(undefined, 'teacher one', true)).json()).path, first.path);
  assert.equal((await (await request(endpoint)).json()).id, course.id);
  assert.equal(createPythonCourseGiftStore({ filePath }).find(first.path.split('/').at(-1)).teacherId, 'one');
});
