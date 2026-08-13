import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLastOnlineAt, normalizeLastOnlineAt } from './studentPresence.js';

const NOW = Date.parse('2026-08-13T12:00:00.000Z');

test('last-online timestamp normalization rejects invalid values', () => {
  assert.equal(normalizeLastOnlineAt('not-a-date'), '');
  assert.equal(normalizeLastOnlineAt('2026-08-13T11:59:00.000Z'), '2026-08-13T11:59:00.000Z');
});

test('last-online formatter uses readable relative Russian time', () => {
  assert.equal(formatLastOnlineAt('2026-08-13T11:59:30.000Z', NOW), 'только что');
  assert.equal(formatLastOnlineAt('2026-08-13T11:48:00.000Z', NOW), '12 минут назад');
  assert.equal(formatLastOnlineAt('2026-08-13T09:00:00.000Z', NOW), '3 часа назад');
  assert.equal(formatLastOnlineAt('2026-08-11T12:00:00.000Z', NOW), '2 дня назад');
});

test('last-online formatter falls back to a date for older visits', () => {
  assert.match(formatLastOnlineAt('2025-12-31T20:30:00.000Z', NOW), /2025/);
  assert.equal(formatLastOnlineAt('', NOW), '');
});
