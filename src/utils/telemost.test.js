import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TELEMOST_URL_ERROR,
  normalizeTelemostUrl,
  parseTelemostUrl,
} from './telemost.js';

test('normalizes an official Telemost meeting URL', () => {
  assert.equal(
    normalizeTelemostUrl(' telemost.yandex.ru/j/1234567890 '),
    'https://telemost.yandex.ru/j/1234567890'
  );
  assert.equal(
    normalizeTelemostUrl('https://telemost.yandex.ru/j/1234567890?lang=ru#guest'),
    'https://telemost.yandex.ru/j/1234567890?lang=ru'
  );
});

test('allows an empty value so a teacher can remove the saved link', () => {
  assert.deepEqual(parseTelemostUrl(''), { url: '', error: '' });
});

test('rejects non-HTTPS and non-Telemost links', () => {
  [
    'http://telemost.yandex.ru/j/123',
    'https://example.com/j/123',
    'javascript:alert(1)',
    'https://user:pass@telemost.yandex.ru/j/123',
  ].forEach((value) => {
    assert.deepEqual(parseTelemostUrl(value), { url: '', error: TELEMOST_URL_ERROR });
  });
});

test('requires a meeting path', () => {
  [
    'https://telemost.yandex.ru',
    'https://telemost.yandex.ru/j',
    'https://telemost.yandex.ru/meeting/123',
  ].forEach((value) => {
    assert.equal(normalizeTelemostUrl(value), '');
  });
});
