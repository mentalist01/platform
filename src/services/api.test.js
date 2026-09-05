import test from 'node:test';
import assert from 'node:assert/strict';

import {
  api,
  invalidateStudentNextLessonCache,
  invalidateTestsCache,
} from './api.js';

const USER_SESSION_KEY = 'ege_user_session';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const installStorage = (authToken) => {
  const values = new Map();
  if (authToken) {
    values.set(USER_SESSION_KEY, JSON.stringify({ authToken }));
  }
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  return values;
};

test('replay final-save errors preserve HTTP status for recovery decisions', async () => {
  installStorage('replay-token');
  for (const status of [410, 413, 425]) {
    globalThis.fetch = async () => jsonResponse({ error: 'Запись не сохранена' }, status);
    await assert.rejects(api.finishLessonReplaySession('session', { events: [{ id: 'pending' }] }),
      (error) => error.status === status && error.message === 'Запись не сохранена');
  }
});

test('tests cache deduplicates requests while returning independent object graphs', async () => {
  installStorage('cache-token-a');
  invalidateTestsCache();
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return jsonResponse({ tasks: { 1: { title: 'Original' } } });
  };

  const [first, second] = await Promise.all([
    api.getTests('student-1'),
    api.getTests('student-1'),
  ]);
  assert.equal(requests.length, 1);
  first.tasks[1].title = 'Changed locally';
  assert.equal(second.tasks[1].title, 'Original');

  const cached = await api.getTests('student-1');
  assert.equal(requests.length, 1);
  assert.equal(cached.tasks[1].title, 'Original');

  installStorage('cache-token-b');
  await api.getTests('student-1');
  assert.equal(requests.length, 2, 'the auth token must be part of the cache key');
});

test('full and index shapes use separate TTLs and force bypasses resolved cache', async () => {
  installStorage('cache-token-ttl');
  invalidateTestsCache();
  const originalDateNow = Date.now;
  let now = 1_000;
  let requestCount = 0;
  const requests = [];
  Date.now = () => now;
  globalThis.fetch = async (input) => {
    requestCount += 1;
    requests.push(String(input));
    return jsonResponse({ requestCount });
  };

  try {
    assert.equal((await api.getTests()).requestCount, 1);
    now += 59_999;
    assert.equal((await api.getTests()).requestCount, 1);
    now += 1;
    assert.equal((await api.getTests()).requestCount, 2);

    assert.equal((await api.getTestsIndex()).requestCount, 3);
    now += 299_999;
    assert.equal((await api.getTestsIndex()).requestCount, 3);
    now += 1;
    assert.equal((await api.getTestsIndex()).requestCount, 4);
    assert.equal((await api.getTestsIndex('', { force: true })).requestCount, 5);

    assert.ok(requests.some((url) => url === '/api/tests'));
    assert.ok(requests.some((url) => url === '/api/tests?shape=index'));
  } finally {
    Date.now = originalDateNow;
  }
});

test('personal and global question banks use different cache keys and URLs', async () => {
  installStorage('cache-token-scope');
  invalidateTestsCache();
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return jsonResponse({ url: String(input) });
  };

  assert.equal((await api.getTests()).url, '/api/tests');
  assert.equal((await api.getTests('', { scope: 'global' })).url, '/api/tests?scope=global');
  await api.getTests();
  await api.getTests('', { scope: 'global' });
  assert.deepEqual(requests, ['/api/tests', '/api/tests?scope=global']);

  await api.saveTests({}, { scope: 'global' });
  assert.equal(requests.at(-1), '/api/tests?scope=global');
});

test('a forced tests request waits for a normal in-flight request and then refreshes', async () => {
  installStorage('cache-token-force');
  invalidateTestsCache();
  let requestCount = 0;
  let resolveFirstRequest;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Promise((resolve) => {
        resolveFirstRequest = () => resolve(jsonResponse({ version: 1 }));
      });
    }
    return jsonResponse({ version: requestCount });
  };

  const normalRequest = api.getTests('student-force');
  const forcedRequest = api.getTests('student-force', { force: true });
  assert.equal(requestCount, 1);
  resolveFirstRequest();

  const [normal, forced] = await Promise.all([normalRequest, forcedRequest]);
  assert.equal(normal.version, 1);
  assert.equal(forced.version, 2);
  assert.equal(requestCount, 2);
});

test('successful tests and mock-attempt mutations invalidate both cached shapes', async () => {
  installStorage('cache-token-mutations');
  invalidateTestsCache();
  let testsRequestCount = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || 'GET').toUpperCase();
    if (url.startsWith('/api/tests') && method === 'GET') {
      testsRequestCount += 1;
      return jsonResponse({ testsRequestCount });
    }
    return jsonResponse({ ok: true });
  };

  await api.getTests();
  await api.getTestsIndex();
  await api.getTests();
  await api.getTestsIndex();
  assert.equal(testsRequestCount, 2);

  await api.saveTests({});
  await api.getTests();
  await api.getTestsIndex();
  assert.equal(testsRequestCount, 4);

  await api.saveMockAttempt('student-1', 'exam-1', { completed: true });
  await api.getTests();
  await api.getTestsIndex();
  assert.equal(testsRequestCount, 6);
});

test('auth transitions and 401 responses invalidate tests cache', async () => {
  const storage = installStorage('cache-token-auth');
  invalidateTestsCache();
  let testsRequestCount = 0;
  let rejectNextTestsRequest = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('/api/tests')) {
      testsRequestCount += 1;
      if (rejectNextTestsRequest) {
        rejectNextTestsRequest = false;
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      return jsonResponse({ testsRequestCount });
    }
    return jsonResponse({ ok: true });
  };

  await api.getTests();
  await api.login('1234');
  await api.getTests();
  await api.signupLogin('Student');
  await api.getTests();
  await api.logout();
  await api.getTests();
  assert.equal(testsRequestCount, 4);

  rejectNextTestsRequest = true;
  await assert.rejects(api.getTests('', { force: true }), /unauthorized/);
  assert.equal(storage.has(USER_SESSION_KEY), false);
  storage.set(USER_SESSION_KEY, JSON.stringify({ authToken: 'cache-token-auth' }));
  await api.getTests();
  assert.equal(testsRequestCount, 6);
});

test('next-lesson cache single-flights requests and returns independent payloads', async () => {
  installStorage('next-lesson-token');
  invalidateStudentNextLessonCache();
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return jsonResponse({ homeworks: [{ id: 'homework-1', title: 'Read' }] });
  };

  const [first, second] = await Promise.all([
    api.getStudentNextLesson('student-next'),
    api.getStudentNextLesson('student-next'),
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0], '/api/student-next-lesson?studentId=student-next');
  first.homeworks[0].title = 'Changed locally';
  assert.equal(second.homeworks[0].title, 'Read');
  await api.getStudentNextLesson('student-next');
  assert.equal(requests.length, 1);
});

test('updating next lesson invalidates its short-lived cache', async () => {
  installStorage('next-lesson-update-token');
  invalidateStudentNextLessonCache();
  let nextLessonRequests = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || 'GET').toUpperCase();
    if (url.startsWith('/api/student-next-lesson') && method === 'GET') {
      nextLessonRequests += 1;
      return jsonResponse({ latest: { id: `lesson-${nextLessonRequests}` } });
    }
    return jsonResponse({ ok: true });
  };

  await api.getStudentNextLesson('student-next-update');
  await api.updateStudentNextLesson('student-next-update', { homeWork: 'New homework' });
  const refreshed = await api.getStudentNextLesson('student-next-update');
  assert.equal(nextLessonRequests, 2);
  assert.equal(refreshed.latest.id, 'lesson-2');
});
