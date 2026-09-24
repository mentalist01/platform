import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverableFetch } from './recoverableFetch.js';

const json = () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
const options = { timeoutMs: 15, retryDelayMs: 0 };

test('a stuck read is aborted and retried with a fresh signal', async t => {
  let calls = 0;
  const signals = [];
  t.mock.method(globalThis, 'fetch', async (_, { signal }) => {
    signals.push(signal);
    if (++calls === 2) return json();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  });
  assert.deepEqual(await (await recoverableFetch('/api/tests', {}, options)).json(), { ok: true });
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
});

test('deadline covers a JSON body stalled after successful headers', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_, { signal }) => {
    if (++calls === 2) return json();
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok":'));
      signal.addEventListener('abort', () => controller.error(signal.reason));
    } }), { headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(await (await recoverableFetch('/api/tests', {}, options)).json(), { ok: true });
  assert.equal(calls, 2);
});

test('offline reads stop after one retry instead of hanging indefinitely', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_, { signal }) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  });
  await assert.rejects(recoverableFetch('/api/tests', {}, options), /Нет ответа/);
  assert.equal(calls, 2);
});

test('lost write responses never repeat the write', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new TypeError('Network lost'); });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await assert.rejects(recoverableFetch('/api/homework', { method, body: '{}' }, options), /Network lost/);
  }
  assert.equal(calls, 4);
});

test('caller cancellation and session changes prohibit a retry', async t => {
  let calls = 0;
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    calls++; controller.abort(); throw new TypeError('Network lost');
  });
  await assert.rejects(recoverableFetch('/api/tests', { signal: controller.signal }, options));
  await assert.rejects(recoverableFetch('/api/tests', {}, { ...options, canRetry: () => false }));
  assert.equal(calls, 2);
});

test('HTTP errors are returned to existing authentication/error handlers without retries', async t => {
  let calls = 0;
  for (const status of [401, 403, 409, 500]) {
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return new Response('{"error":"rejected"}', { status, headers: { 'content-type': 'application/json' } });
    });
    const response = await recoverableFetch('/api/tests', {}, options);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: 'rejected' });
  }
  assert.equal(calls, 4);
});

test('downloads and streaming responses are not eagerly buffered', async t => {
  const response = new Response(new ReadableStream(), { headers: { 'content-type': 'application/zip' } });
  t.mock.method(globalThis, 'fetch', async () => response);
  assert.equal(await recoverableFetch('/api/download', {}, options), response);
  await response.body.cancel();
});
