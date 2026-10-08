import test from 'node:test';
import assert from 'node:assert/strict';

import {
  api,
  invalidateStudentNextLessonCache,
  invalidateTestsCache,
  setUnauthorizedHandler,
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

test('group transfer uses one authenticated operation and replacement requires an explicit boolean', async t => {
  installStorage('group-transfer-fixture');
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  const result = { sourceGroup: { id: 'source/a' }, targetGroup: { id: 'target/a' }, availabilityTransfer: { copiedCount: 3, skippedCount: 1 } };
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), ...init }); return jsonResponse(result); };
  assert.deepEqual(await api.transferLearningGroupMember('source/a', 'student/a', {
    targetGroupId: ' target/a ', lateAddReason: ' Перевод в группу ', replaceTargetAnswer: 'true',
  }), result);
  await api.transferLearningGroupMember('source/a', 'student/a', { targetGroupId: 'target/a', replaceTargetAnswer: true });
  assert.ok(calls.every(call => call.url === '/api/learning-groups/source%2Fa/members/student%2Fa/transfer' && call.method === 'POST'));
  assert.deepEqual(JSON.parse(calls[0].body), { targetGroupId: 'target/a', lateAddReason: 'Перевод в группу' });
  assert.deepEqual(JSON.parse(calls[1].body), { targetGroupId: 'target/a', replaceTargetAnswer: true });
  assert.ok(calls.every(call => new Headers(call.headers).get('Authorization') === 'Bearer group-transfer-fixture'));
  await assert.rejects(api.transferLearningGroupMember('source/a', 'student/a'), /Выберите группу/);
  await assert.rejects(api.transferLearningGroupMember('', 'student/a', { targetGroupId: 'target' }), /Выберите исходную группу/);
  await assert.rejects(api.transferLearningGroupMember('source/a', '', { targetGroupId: 'target' }), /Выберите ученика/);
  assert.equal(calls.length, 2);
});

test('group transfer preserves conflict code for an explicit replacement retry', async t => {
  installStorage('group-transfer-conflict-fixture');
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => jsonResponse({ error: 'В новой группе уже сохранены другие отметки.', code: 'availability_answer_conflict' }, 409);
  await assert.rejects(api.transferLearningGroupMember('source', 'student', { targetGroupId: 'target' }), error => (
    error.status === 409 && error.code === 'availability_answer_conflict' && error.message === 'В новой группе уже сохранены другие отметки.'
  ));
});

test('name checks and recording homework use authenticated JSON requests and encode library scope', async t => {
  installStorage('recording-homework-fixture');
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), ...init }); return jsonResponse({ ok: true }); };
  await api.studentNameAvailability({ name: 'Александр', nickname: 'Саша 10' });
  await api.lessonRecordingLibrary('', { teacherId: 't a' });
  await api.lessonRecordingLibrary('job/a', { title: 'Задание 3', teacherId: 't a' });
  await api.getLearningMaterials({ teacherId: 't a' });
  await api.createLearningMaterial({ title: 'Видео' });
  await api.updateLearningMaterialSharing('material/a', ['t']);
  await api.deleteLearningMaterial('material/a');
  assert.deepEqual(calls.map(call => [call.url, call.method]), [
    ['/api/students/name-availability', 'POST'], ['/api/lesson-recording-library?teacherId=t%20a', 'GET'],
    ['/api/lesson-recording-library/job%2Fa/material', 'POST'], ['/api/learning-materials?teacherId=t+a', 'GET'],
    ['/api/learning-materials', 'POST'], ['/api/learning-materials/material%2Fa/sharing', 'PATCH'], ['/api/learning-materials/material%2Fa', 'DELETE'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].body), { name: 'Александр', nickname: 'Саша 10' });
  assert.deepEqual(JSON.parse(calls[2].body), { title: 'Задание 3', teacherId: 't a' });
  assert.ok(calls.every(call => new Headers(call.headers).get('Authorization') === 'Bearer recording-homework-fixture'));
});

test('schedule options are opt-in and legacy schedule callers still receive an array', async t => {
  installStorage('schedule-options-token');
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const urls = [];
  globalThis.fetch = async input => {
    urls.push(String(input));
    return jsonResponse(String(input).includes('includeOptions=1')
      ? { schedule: [], canRequestIndividualSchedule: false } : []);
  };
  assert.deepEqual(await api.getStudentSchedule('a'), []);
  assert.deepEqual(await api.getStudentSchedule('', true), { schedule: [], canRequestIndividualSchedule: false });
  assert.deepEqual(urls, ['/api/student-schedule?studentId=a', '/api/student-schedule?includeOptions=1']);
});

test('manual calendar refresh waits for background fetch then bypasses cached data', async t => {
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  t.after(() => { globalThis.window = previousWindow; });
  installStorage('calendar-refresh-fixture');
  const requests = []; let completeBackground;
  globalThis.fetch = async (input, init) => {
    requests.push(JSON.parse(init.body));
    if (requests.length === 1) return new Promise(resolve => { completeBackground = resolve; });
    return jsonResponse({ importedCount: 2 });
  };
  const background = api.refreshTeacherCalendarSync('calendar-manual-fixture');
  const manual = api.refreshTeacherCalendarSync('calendar-manual-fixture', { force: true });
  completeBackground(jsonResponse({ importedCount: 1 }));
  assert.equal((await background).importedCount, 1);
  assert.equal((await manual).importedCount, 2);
  assert.deepEqual(requests.map(request => request.force), [false, true]);
  await api.refreshTeacherCalendarSync('calendar-manual-fixture');
  assert.equal(requests.length, 2);
});

test('manual calendar retry still runs after an in-flight background error', async t => {
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  t.after(() => { globalThis.window = previousWindow; });
  installStorage('calendar-retry-fixture');
  let completeBackground; let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    if (requests === 1) return new Promise(resolve => { completeBackground = resolve; });
    return jsonResponse({ importedCount: 2 });
  };
  const background = api.refreshTeacherCalendarSync('calendar-retry-fixture');
  const manual = api.refreshTeacherCalendarSync('calendar-retry-fixture', { force: true });
  completeBackground(jsonResponse({ error: 'Temporary error' }, 502));
  await assert.rejects(background, /Temporary error/);
  assert.equal((await manual).importedCount, 2);
  assert.equal(requests, 2);
});

test('replay final-save errors preserve HTTP status for recovery decisions', async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  t.after(() => { globalThis.window = previousWindow; });
  installStorage('replay-token');
  for (const status of [410, 413, 425]) {
    globalThis.fetch = async () => jsonResponse({ error: 'Запись не сохранена' }, status);
    await assert.rejects(api.finishLessonReplaySession('session', { events: [{ id: 'pending' }] }),
      (error) => error.status === status && error.message === 'Запись не сохранена');
  }
});

test('a delayed 401 from an old session cannot log out a newer login', async (t) => {
  const storage = installStorage('previous-token');
  let rejectOldRequest; let unauthorized = 0;
  setUnauthorizedHandler(() => { unauthorized++; });
  t.after(() => setUnauthorizedHandler(null));
  globalThis.fetch = () => new Promise((resolve) => { rejectOldRequest = resolve; });
  const request = api.getCurrentSession();
  storage.set(USER_SESSION_KEY, JSON.stringify({ authToken: 'new-login-token' }));
  rejectOldRequest(jsonResponse({ error: 'Old session revoked' }, 401));
  await assert.rejects(request, /Old session revoked/);
  assert.equal(JSON.parse(storage.get(USER_SESSION_KEY)).authToken, 'new-login-token');
  assert.equal(unauthorized, 0);

  globalThis.fetch = async () => jsonResponse({ error: 'Current session revoked' }, 401);
  await assert.rejects(api.getCurrentSession(), /Current session revoked/);
  assert.equal(storage.has(USER_SESSION_KEY), false);
  assert.equal(unauthorized, 1);
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
