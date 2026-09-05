import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
const finishFunction = source.slice(source.indexOf('const finishActiveLessonReplaySession ='), source.indexOf('const finishTelemostLessonReplay ='));
const finishRoute = source.slice(source.indexOf("app.post('/api/lesson-replay/finish',"), source.indexOf("app.post('/api/lesson-replay/lesson/finish',"));

const createHarness = (session, { replay = { events: [] }, writeError = null } = {}) => {
  let handler;
  const writes = [];
  const sessions = new Map(session ? [[session.id, session]] : []);
  const context = vm.createContext({
    app: { post: (_path, fn) => { handler = fn; } },
    activeLessonReplaySessions: sessions,
    lessonReplayPersistTimerByOccurrenceKey: new Map(),
    lessonReplayCacheByOccurrenceKey: new Map(),
    lessonReplayPersistFailureByOccurrenceKey: new Map(),
    ensureLessonReplaySessionAccess: () => ({ scope: 'learning-group' }),
    LESSON_REPLAY_MAX_BATCH_EVENTS: 48,
    withLessonReplayWriteLock: async (_key, fn) => fn(),
    readLessonReplay: () => replay,
    appendLessonReplayEvents: (previous, events) => {
      if (writeError) throw writeError;
      return { replay: { ...previous, events: [...previous.events, ...events] } };
    },
    writeLessonReplay: async (value) => { writes.push(value); },
  });
  vm.runInContext(`${finishFunction}\n${finishRoute}`, context);
  const request = async (events = []) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handler({ body: { sessionId: 'session', events }, auth: { id: 'teacher', role: 'teacher' } }, response);
    return response;
  };
  return { request, writes, sessions };
};
const session = () => ({ id: 'session', actorId: 'teacher', actorRole: 'teacher', occurrenceKey: 'lesson' });
const pending = [{ id: 'last', type: 'board', payload: { mode: 'snapshot', items: [{ id: 'kept' }] } }];

test('an expired finish request cannot acknowledge unsaved board events', async () => {
  const h = createHarness(null);
  const response = await h.request(pending);
  assert.equal(response.statusCode, 410);
  assert.notEqual(response.body.ok, true);
  assert.equal((await h.request()).body.alreadyFinished, true, 'empty finish stays idempotent');
});

test('a concurrent finish asks the client to retry its pending batch', async () => {
  const h = createHarness({ ...session(), closing: true });
  assert.equal((await h.request(pending)).statusCode, 425);
  assert.equal(h.writes.length, 0);
});

test('missing replay data fails final saving and keeps the session retryable', async () => {
  const current = session();
  const h = createHarness(current, { replay: null });
  assert.equal((await h.request(pending)).statusCode, 404);
  assert.equal(current.closing, false);
  assert.equal(h.sessions.size, 1);
});

test('capacity failure reaches the client without closing its recording session', async () => {
  const current = session();
  const h = createHarness(current, { writeError: Object.assign(new Error('capacity'), { statusCode: 413, code: 'LESSON_REPLAY_CAPACITY' }) });
  const response = await h.request(pending);
  assert.equal(response.statusCode, 413);
  assert.equal(response.body.code, 'LESSON_REPLAY_CAPACITY');
  assert.equal(current.closing, false);
  assert.equal(h.writes.length, 0);
});

test('successful finishing writes pending board data before acknowledging it', async () => {
  const h = createHarness(session());
  assert.equal((await h.request(pending)).body.ok, true);
  assert.equal(h.writes[0].events[0].payload.items[0].id, 'kept');
  assert.equal(h.writes[0].events.at(-1).payload.action, 'end');
  assert.equal(h.sessions.size, 0);
});
