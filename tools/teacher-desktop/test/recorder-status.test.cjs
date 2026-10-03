'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRecorderStateReader } = require('../recorder-status.cjs');
test('authenticates helper state and renews the session after a helper restart', async t => {
  let key = 'a'.repeat(43); let pageReads = 0; let authenticated = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/') { pageReads++; response.end(`<script>const key='${key}';</script>`); return; }
    if (request.headers['x-recorder-key'] !== key) { response.writeHead(403); response.end('{}'); return; }
    authenticated++; response.end(JSON.stringify({ jobs: [], obs: { outputActive: false } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const read = createRecorderStateReader({ port: server.address().port });
  assert.equal((await read()).obs.outputActive, false);
  await read(); assert.equal(pageReads, 1);
  key = 'b'.repeat(43); await read();
  assert.equal(pageReads, 2); assert.equal(authenticated, 3);
});
test('an authenticated malformed state fails closed', async t => {
  const server = http.createServer((_request, response) => response.end('{"error":"offline"}'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(createRecorderStateReader({ port: server.address().port })(), /Неизвестное состояние/);
});
