import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotReleaseClient } from './releaseClientSnapshot.mjs';

test('release snapshots deduplicate bytes and survive overwriting the live build', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-snapshot-'));
  try {
    const source = path.join(root, 'dist'), objects = path.join(root, 'objects'); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'index.html'), 'release one'); fs.writeFileSync(path.join(source, 'same.js'), 'shared asset');
    const first = path.join(root, 'one'), second = path.join(root, 'two');
    snapshotReleaseClient(source, first, objects);
    fs.writeFileSync(path.join(source, 'index.html'), 'release two');
    const result = snapshotReleaseClient(source, second, objects);
    assert.equal(result.newBytes, Buffer.byteLength('release two'));
    assert.equal(fs.readFileSync(path.join(first, 'index.html'), 'utf8'), 'release one');
    assert.equal(fs.statSync(path.join(first, 'same.js')).ino, fs.statSync(path.join(second, 'same.js')).ino);
    fs.writeFileSync(path.join(source, 'same.js'), 'changed by another publisher');
    assert.equal(fs.readFileSync(path.join(second, 'same.js'), 'utf8'), 'shared asset');
    assert.throws(() => snapshotReleaseClient(source, first, objects), /already exists/);
    fs.writeFileSync(path.join(objects, fs.readdirSync(objects).find(file => fs.readFileSync(path.join(objects, file), 'utf8') === 'release two')), 'damaged');
    assert.throws(() => snapshotReleaseClient(source, path.join(root, 'three'), objects), /Corrupted/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
