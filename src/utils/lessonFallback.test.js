import test from 'node:test';
import assert from 'node:assert/strict';
import { readLessonFallback, saveLessonFallback, clearLessonFallback, fallbackLinks, FALLBACK_TTL } from './lessonFallback.js';
test('meeting cache isolates accounts, expires, clears on logout and rejects unsafe URLs', () => {
  const values = new Map(); const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const links = [{ id: 'a', name: 'Урок', url: 'https://telemost.yandex.ru/j/test' }];
  saveLessonFallback(storage, 'student:one', links, 1000);
  assert.deepEqual(readLessonFallback(storage, 'student:one', 2000), links);
  assert.deepEqual(readLessonFallback(storage, 'student:two', 2000), []);
  assert.deepEqual(readLessonFallback(storage, 'student:one', 1001 + FALLBACK_TTL), []);
  assert.deepEqual(fallbackLinks([{ id: 'a', url: 'javascript:alert(1)' }, { id: 'b', url: 'https://evil.example/j/test' }]), []);
  clearLessonFallback(storage); assert.deepEqual(readLessonFallback(storage, 'student:one', 2000), []);
});
