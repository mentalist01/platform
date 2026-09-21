import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { recordingPath, writableRecordingDirectory, setupFingerprint, assertSetupIdle } from './recording-storage.mjs';

test('storage accepts absolute local paths and rejects Windows special paths', () => {
  assert.equal(recordingPath(' D:/Видео/Уроки '), 'D:\\Видео\\Уроки');
  for (const value of ['', 'Videos', 'D:Videos', '\\\\server\\share', '\\\\?\\C:\\Videos', 'D:\\a:b', 'D:\\CON', 'D:\\nul.mp4', 'D:\\Folder.\\Videos', 'D:\\x\u0000']) {
    assert.throws(() => recordingPath(value), value);
  }
});
test('changing settings cannot interrupt recording or upload', () => {
  assert.doesNotThrow(() => assertSetupIdle({}));
  for (const key of ['active', 'uploadingId', 'queueBusy', 'outputActive']) assert.throws(() => assertSetupIdle({ [key]: true }));
});
test('test confirmation applies to the exact recording sources and folder', () => {
  const config = { recordDirectory: 'D:\\Videos', platform: 'chrome', telemost: 'telemost', mic: 'usb', screen: '1' };
  const key = setupFingerprint(config);
  for (const name of Object.keys(config)) assert.notEqual(setupFingerprint({ ...config, [name]: 'changed' }), key);
  assert.equal(setupFingerprint({ ...config, token: 'new-token', autoUpload: true }), key);
});
test('writable folder check leaves existing videos untouched', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-storage-test-'));
  const video = path.join(root, 'existing.mkv'); fs.writeFileSync(video, 'recording');
  try {
    assert.equal(writableRecordingDirectory(root), root);
    assert.equal(fs.readFileSync(video, 'utf8'), 'recording');
    assert.deepEqual(fs.readdirSync(root), ['existing.mkv']);
  } finally { fs.unlinkSync(video); fs.rmdirSync(root); }
});
