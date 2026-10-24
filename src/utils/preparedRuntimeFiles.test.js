import test from 'node:test';
import assert from 'node:assert/strict';
import { preparedRuntimeFiles, preparedFileOpenExample } from './preparedRuntimeFiles.js';

test('prepared Python inputs keep legacy names and select files independently for each exercise', () => {
  const original = { assetId: 'original', name: '17_вариант.txt', url: '/original' };
  assert.equal(preparedRuntimeFiles([original])[0].runtimeName, original.name);
  const files = preparedRuntimeFiles([{ ...original, runtimeName: '17.txt' }, { name: 'Памятка.pdf', runtime: false }]);
  assert.deepEqual(files.map(file => file.runtimeName), ['17.txt']);
  assert.equal(files[0].url, original.url);
  assert.equal(original.name, '17_вариант.txt', 'Aliases never rename the source in Notes');
  assert.equal(preparedFileOpenExample('17.txt'), 'open("17.txt")');
  assert.equal(preparedRuntimeFiles([{ name: '27_A.txt' }, { name: '27_B.txt' }]).length, 2);
});

test('ambiguous names and path traversal cannot silently select a different input', () => {
  assert.throws(() => preparedRuntimeFiles([{ name: '17.txt' }, { name: '17.TXT' }]), /Два входных файла/);
  for (const name of ['../17.txt', 'dir\\17.txt', '.', '..', 'a\0.txt']) {
    assert.throws(() => preparedRuntimeFiles([{ name }]), /имя входного файла/);
  }
  assert.equal(preparedRuntimeFiles([{ name: '../hidden.pdf', runtime: false }]).length, 0);
});
