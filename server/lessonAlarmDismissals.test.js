import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { registerLessonAlarmDismissals, attachLessonAlarmSocket } from './lessonAlarmDismissals.js';

const NOW = 1_800_000_000_000;
const fixture = async (t, dataDir) => {
  const folder = dataDir || await fs.mkdtemp(path.join(os.tmpdir(), 'alarm-dismissals-'));
  if (!dataDir) t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const events = [];
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: req.headers['x-role'] || 'teacher', id: req.headers['x-user'] || 'a' }; next(); });
  const controller = registerLessonAlarmDismissals(app, { dataDir: folder, now: () => NOW, notify: (teacherId, alarm) => events.push({ teacherId, alarm }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (body, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/lesson-alarm${body ? '/stop' : ''}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, data: await res.json(), cache: res.headers.get('cache-control') };
  };
  return { request, events, folder, controller };
};

test('stopping one teacher account persists through restart and never affects another', async t => {
  const first = await fixture(t);
  assert.equal((await first.request()).data.stoppedAtMs, 0);
  const response = await first.request({ stoppedAtMs: NOW, teacherId: 'b' });
  assert.equal(response.status, 200);
  assert.equal(response.cache, 'no-store');
  assert.deepEqual(first.events, [{ teacherId: 'a', alarm: { stoppedAtMs: NOW } }]);
  assert.equal((await first.request(null, { 'x-user': 'b' })).data.stoppedAtMs, 0);
  const restarted = await fixture(t, first.folder);
  assert.equal((await restarted.request()).data.stoppedAtMs, NOW);
});

test('delayed clicks and repeat requests cannot suppress the next alarm', async t => {
  const { request, events } = await fixture(t);
  assert.equal((await request({ stoppedAtMs: NOW - 120_000 })).data.stoppedAtMs, NOW - 120_000);
  assert.equal((await request({ stoppedAtMs: NOW - 180_000 })).data.stoppedAtMs, NOW - 120_000);
  assert.equal((await request({ stoppedAtMs: NOW - 86_400_001 })).data.stoppedAtMs, NOW - 120_000);
  assert.equal(events.length, 1);
  // Client clock cannot cancel future scheduled signals indefinitely.
  assert.equal((await request({ stoppedAtMs: NOW + 86_400_000 })).data.stoppedAtMs, NOW);
});

test('only authenticated teachers may read or stop their own alarm', async t => {
  const { request } = await fixture(t);
  for (const role of ['student', 'parent', 'admin', 'guest']) {
    assert.equal((await request(null, { 'x-role': role })).status, 403);
    assert.equal((await request({ stoppedAtMs: NOW }, { 'x-role': role })).status, 403);
  }
  for (const stoppedAtMs of [0, -1, '1800000000000', {}, 1.5]) {
    assert.equal((await request({ stoppedAtMs })).status, 400);
  }
});

test('WebSocket stop uses authenticated teacher identity, persists and acknowledges errors', async t => {
  const { controller, request, events } = await fixture(t);
  const ws = new EventEmitter(), messages = [];
  attachLessonAlarmSocket(ws, { role: 'teacher', id: 'a' }, controller, (_, data) => messages.push(data));
  assert.equal(messages[0].alarm.stoppedAtMs, 0);
  ws.emit('message', JSON.stringify({ type: 'lesson-alarm-stop', requestId: 'one', teacherId: 'b', stoppedAtMs: NOW }));
  assert.equal(messages.at(-1).requestId, 'one');
  assert.equal(messages.at(-1).teacherId, 'a');
  assert.equal((await request()).data.stoppedAtMs, NOW);
  assert.equal((await request(null, { 'x-user': 'b' })).data.stoppedAtMs, 0);
  assert.equal(events.length, 1);
  ws.emit('message', JSON.stringify({ type: 'lesson-alarm-stop', requestId: 'bad', stoppedAtMs: 'wrong' }));
  assert.equal(messages.at(-1).requestId, 'bad');
  assert.ok(messages.at(-1).error);
  const pupil = new EventEmitter();
  attachLessonAlarmSocket(pupil, { role: 'student', id: 'a' }, controller, () => assert.fail('No pupil alarm access'));
  assert.equal(pupil.listenerCount('message'), 0);
});
