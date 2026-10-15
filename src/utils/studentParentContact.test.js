import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudentParentContact, copyParentMessage } from './studentParentContact.js';

test('parent contact accepts full links, a messenger address and an empty contact', () => {
  assert.deepEqual(normalizeStudentParentContact({ name: ' Мама ', url: 't.me/example_parent' }), { name: 'Мама', url: 'https://t.me/example_parent' });
  assert.equal(normalizeStudentParentContact({ url: '@example_parent' }).url, 'https://t.me/example_parent');
  assert.equal(normalizeStudentParentContact({ url: 'https://wa.me/79990000000?text=hello' }).url, 'https://wa.me/79990000000?text=hello');
  assert.equal(normalizeStudentParentContact({ url: 'https://max.ru/u/test-contact' }).url, 'https://max.ru/u/test-contact');
  assert.deepEqual(normalizeStudentParentContact({}), { name: '', url: '' });
});

test('stored parent links cannot execute script, expose URL credentials or silently keep malformed contacts', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.example', '/parent', 'https://user:secret@example.com/', 'https://vk.com/a\nb']) {
    assert.throws(() => normalizeStudentParentContact({ url }), undefined, url);
  }
  assert.throws(() => normalizeStudentParentContact({ name: 'Мама' }));
  assert.throws(() => normalizeStudentParentContact({ name: 'a'.repeat(81), url: 'https://t.me/example' }));
});

test('copying a parent report preserves the reviewed text and never marks or sends it', async () => {
  const text = 'Добрый день!\nОтчёт с правками учителя.';
  let copied;
  await copyParentMessage(text, { clipboard: { writeText: async value => { copied = value; } } }, { createElement: () => { throw Error('fallback not needed'); } });
  assert.equal(copied, text);
});
