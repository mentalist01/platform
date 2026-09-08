import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLessonReplayEventLog } from './lessonReplayEventLog.js';

const event = (id) => ({
  id,
  type: 'board',
  occurredAt: '2026-09-08T18:00:00.000Z',
  payload: { mode: 'delta', upserts: [{ index: 0, item: { id, type: 'stroke' } }] },
});

test('event log survives a new process view and preserves batch order', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-replay-event-log-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = createLessonReplayEventLog(root);
  await first.append('lesson-one', [event('one'), event('two')]);
  await first.append('lesson-one', [event('three')]);

  const restored = createLessonReplayEventLog(root).read('lesson-one');
  assert.deepEqual(restored.map((entry) => entry.id), ['one', 'two', 'three']);
});

test('event log keeps fsynced records when the last line is incomplete', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-replay-event-log-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = createLessonReplayEventLog(root);
  await log.append('lesson-one', [event('safe')]);
  fs.appendFileSync(log.getPath('lesson-one'), '{"version":1,"events":[', 'utf8');

  assert.deepEqual(log.read('lesson-one').map((entry) => entry.id), ['safe']);
});

test('event log clears only after the compact replay has been stored', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-replay-event-log-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = createLessonReplayEventLog(root);
  await log.append('lesson-one', [event('safe')]);

  assert.equal(await log.clear('lesson-one'), true);
  assert.deepEqual(log.read('lesson-one'), []);
  assert.equal(await log.clear('lesson-one'), false);
});

test('event log rejects growth beyond its explicit capacity', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-replay-event-log-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = createLessonReplayEventLog(root, { maxBytes: 1024 });

  await assert.rejects(
    log.append('lesson-one', [event('x'.repeat(1500))]),
    (error) => error?.statusCode === 413 && error?.code === 'LESSON_REPLAY_EVENT_LOG_CAPACITY'
  );
});
