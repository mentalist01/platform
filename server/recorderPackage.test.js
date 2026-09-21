import assert from 'node:assert/strict';
import test from 'node:test';
import { recorderFiles, recorderPackage } from './recorderPackage.js';

test('Windows package contains only distributable files and valid central directory entries', () => {
  const zip = recorderPackage(); const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), recorderFiles.length);
  let position = zip.readUInt32LE(end + 16); const files = new Map();
  for (let index = 0; index < recorderFiles.length; index++) {
    assert.equal(zip.readUInt32LE(position), 0x02014b50);
    const length = zip.readUInt16LE(position + 28); const name = zip.subarray(position + 46, position + 46 + length).toString();
    const local = zip.readUInt32LE(position + 42);
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    assert.equal(zip.readUInt32LE(local + 14), zip.readUInt32LE(position + 16));
    assert.equal(zip.subarray(local + 30, local + 30 + length).toString(), name);
    const data = zip.subarray(local + 30 + length, local + 30 + length + zip.readUInt32LE(local + 18));
    files.set(name.replace('IVAN100-Recorder/', ''), data); position += 46 + length;
  }
  assert.equal(position, end);
  assert.deepEqual([...files.keys()], recorderFiles);
  for (const [name, data] of files) {
    assert.doesNotMatch(name, /state\.json|runtime\.json|browser|node_modules|\.env/);
    assert.ok(data.length > 0);
    if (name.endsWith('.ps1')) assert.deepEqual([...data.subarray(0, 3)], [239, 187, 191]);
  }
  assert.match(files.get('Install.cmd').toString(), /-SetupDependencies -OpenPanel/);
  // Every relative module import is in the archive, including new setup helpers.
  for (const [name, data] of files) if (name.endsWith('.mjs')) {
    for (const match of data.toString().matchAll(/from ['"]\.\/([^'"]+)['"]/g)) assert.ok(files.has(match[1]), `${name}: missing ${match[1]}`);
  }
});
