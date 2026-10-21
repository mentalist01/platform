import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBoardFileFields, normalizeBoardFileName } from './boardFile.js';
import { cloneBoardFragment, normalizeBoardFragment } from './boardFragmentClipboard.js';

const file = { id: 'file-one', type: 'file', authorId: 'teacher', assetId: 'asset', assetUrl: `/uploads/board-asset-${'a'.repeat(64)}.bin`, name: 'Данные.xlsx', sizeBytes: 123, x: 100, y: 200, width: 360, height: 112 };
test('copied file cards retain download metadata and receive new board identities', () => {
  const payload = normalizeBoardFragment({ version: 1, items: [file] });
  assert.equal(payload.items[0].name, file.name); assert.equal(payload.items[0].assetUrl, file.assetUrl);
  const [copy] = cloneBoardFragment(payload, { x: 900, y: 600 }, 'teacher-2', () => 'new-file');
  assert.equal(copy.id, 'new-file'); assert.equal(copy.authorId, 'teacher-2');
  assert.equal(copy.x, 720); assert.equal(copy.assetId, 'asset'); assert.equal(copy.sizeBytes, 123);
});
test('file metadata cannot inject HTML, inline data, arbitrary endpoints or credentials into board storage', () => {
  assert.equal(normalizeBoardFileName('../some\\file\0.xlsx'), 'file.xlsx');
  for (const assetUrl of ['javascript:alert(1)', '/api/students', 'data:text/html,test', '/uploads/arbitrary.html']) {
    assert.equal(normalizeBoardFileFields({ ...file, assetUrl }), null);
  }
  assert.equal(normalizeBoardFileFields({ ...file, assetUrl: file.assetUrl + '?_auth=secret' }).assetUrl, file.assetUrl);
});
