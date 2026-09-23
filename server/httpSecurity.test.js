import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRequestGuard, isTrustedBrowserOrigin, secureUploadedResponse } from './httpSecurity.js';

test('browser origins are compared exactly for HTTP writes and websocket upgrades', () => {
  const req = (origin, extras = {}) => ({ protocol: 'https', headers: { host: 'ivan100.ru', ...(origin ? { origin } : {}), ...extras } });
  assert.equal(isTrustedBrowserOrigin(req('https://ivan100.ru')), true);
  for (const origin of ['https://ivan100.ru.evil.example', 'https://other.example', 'null', 'http://ivan100.ru', 'https://user@ivan100.ru']) {
    assert.equal(isTrustedBrowserOrigin(req(origin)), false);
  }
  assert.equal(isTrustedBrowserOrigin(req()), true); // CLI and desktop helper
  assert.equal(isTrustedBrowserOrigin(req(undefined, { 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(isTrustedBrowserOrigin(req('capacitor://localhost'), ['capacitor://localhost']), true);
  assert.equal(isTrustedBrowserOrigin({ headers: { host: 'ivan100.ru', origin: 'https://ivan100.ru', 'x-forwarded-proto': 'https' } }), true);
});

test('cross-site forms are rejected before parsing and passive uploaded content cannot run scripts', () => {
  const headers = {}; let status; let called = false; let attachment;
  const res = { setHeader: (k, v) => { headers[k] = v; }, status: (s) => { status = s; return res; }, json: () => {}, attachment: (value) => { attachment = value; } };
  browserRequestGuard([])({ method: 'POST', headers: { origin: 'https://other.example', host: 'ivan100.ru' }, protocol: 'https' }, res, () => { called = true; });
  assert.equal(status, 403); assert.equal(called, false);
  secureUploadedResponse(res, 'notes.html');
  assert.equal(attachment, 'notes.html'); assert.match(headers['Content-Security-Policy'], /sandbox/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  attachment = null; secureUploadedResponse(res, 'lesson.pdf'); assert.equal(attachment, null);
});
