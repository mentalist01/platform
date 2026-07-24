import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoardAssetStorageName,
  detectBoardAssetMimeType,
  getBoardAssetHash,
  normalizeBoardAssetEntry,
} from './boardAssets.js';

test('detects supported board image signatures', () => {
  assert.equal(detectBoardAssetMimeType(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png');
  assert.equal(detectBoardAssetMimeType(Buffer.from('ffd8ff00', 'hex')), 'image/jpeg');
  assert.equal(detectBoardAssetMimeType(Buffer.from('524946460000000057454250', 'hex')), 'image/webp');
  assert.equal(detectBoardAssetMimeType(Buffer.from('GIF89a', 'ascii')), 'image/gif');
  assert.equal(detectBoardAssetMimeType(Buffer.from('<svg/>')), '');
});

test('builds a deterministic content-addressed storage name', () => {
  const contents = Buffer.from('image payload');
  const hash = getBoardAssetHash(contents);
  assert.equal(hash.length, 64);
  assert.equal(buildBoardAssetStorageName(hash, 'image/webp'), `board-asset-${hash}.webp`);
  assert.equal(buildBoardAssetStorageName('bad', 'image/webp'), '');
});

test('normalizes persisted board asset grants', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(normalizeBoardAssetEntry({
    id: 'asset-1',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    storageName: `board-asset-${hash}.png`,
    mimeType: 'image/png',
    hash,
    sizeBytes: 123,
    createdAt: '2026-07-24T00:00:00.000Z',
  }), {
    id: 'asset-1',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    storageName: `board-asset-${hash}.png`,
    mimeType: 'image/png',
    hash,
    sizeBytes: 123,
    createdAt: '2026-07-24T00:00:00.000Z',
  });
});
