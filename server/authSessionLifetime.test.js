import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthSessionExpired, normalizeAuthSessionExpiry } from './authSessionLifetime.js';

test('persistent sessions have no inactivity deadline, missing or revoked sessions remain invalid', () => {
  const now = Date.now();
  assert.equal(isAuthSessionExpired({ expiresAtMs: null }, now + 10 * 365 * 86400000), false);
  for (const session of [null, {}, { expiresAtMs: 0 }, { expiresAtMs: now - 1 }, { expiresAtMs: 'invalid' }]) assert.equal(isAuthSessionExpired(session, now), true);
});

test('only still-valid legacy sessions migrate to persistent sessions', () => {
  const now = Date.now();
  assert.equal(normalizeAuthSessionExpiry({ expiresAtMs: now + 1000 }, now), null);
  assert.equal(normalizeAuthSessionExpiry({ expiresAtMs: String(now + 1000) }, now), null);
  assert.equal(normalizeAuthSessionExpiry({ expiresAtMs: null }, now), null);
  for (const entry of [{}, { expiresAtMs: now }, { expiresAtMs: now - 1 }, { expiresAtMs: NaN }]) assert.equal(normalizeAuthSessionExpiry(entry, now), undefined);
});
