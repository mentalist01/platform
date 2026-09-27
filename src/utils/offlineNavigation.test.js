import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../public/sw-push.js', import.meta.url), 'utf8');
for (const mode of ['network', '502', 'timeout']) test(`cached page survives ${mode} without caching API responses`, async () => {
  const listeners = {}; let returned; let cached = 0;
  const context = { self: { addEventListener: (name, fn) => { listeners[name] = fn; }, location: { origin: 'https://example.test' } },
    caches: { open: async () => ({ match: async () => new Response('cached shell'), put: async () => cached++ }) },
    fetch: async (_request, options) => {
      if (mode === '502') return new Response('bad gateway', { status: 502 });
      if (mode === 'timeout') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('timeout'))));
      throw Error('network');
    }, setTimeout: fn => setTimeout(fn, 1), clearTimeout, URL, Request, Response, AbortController, console };
  vm.runInNewContext(source, context);
  listeners.fetch({ request: { method: 'GET', url: 'https://example.test/', mode: 'navigate' }, respondWith: value => { returned = value; } });
  assert.equal(await (await returned).text(), 'cached shell'); assert.equal(cached, 0);
  returned = undefined;
  listeners.fetch({ request: { method: 'GET', url: 'https://example.test/api/session', mode: 'cors' }, respondWith: value => { returned = value; } });
  assert.equal(returned, undefined);
});
