'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { TeacherCredentials } = require('../credentials.cjs');
const { Downloads, reserveDownload } = require('../downloads.cjs');

function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan100-desktop-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
const key = crypto.randomBytes(32);
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: value => { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const bytes = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), bytes]); },
  decryptString: bytes => { const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(); }
};
test('saved codes are encrypted, restored, deduplicated per teacher and removable', t => {
  const file = path.join(directory(t), 'credentials.json'); let store = new TeacherCredentials(file, encryption);
  store.remember('FAKE-TEACHER-001', 'Учитель А', 'account-a'); store.remember('FAKE-TEACHER-002', 'Учитель Б', 'account-b');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('FAKE-TEACHER'));
  assert.ok(!JSON.stringify(store.list()).includes('cipher'));
  store = new TeacherCredentials(file, encryption);
  assert.equal(store.code(store.list().entries[0].id), 'FAKE-TEACHER-002');
  const id = store.list().entries.find(e => e.label === 'Учитель А').id;
  store.remember('FAKE-TEACHER-NEW', 'Учитель А', 'account-a');
  assert.equal(store.list().entries.length, 2); assert.equal(store.code(id), 'FAKE-TEACHER-NEW');
  store.remove(id); assert.throws(() => store.code(id), /недоступен/);
});
test('no plaintext fallback when Windows encryption is unavailable', t => {
  const file = path.join(directory(t), 'credentials.json'), store = new TeacherCredentials(file, { isEncryptionAvailable: () => false });
  assert.throws(() => store.remember('FAKE-CODE', 'Teacher', 'id'), /зашифровать/); assert.equal(fs.existsSync(file), false);
});
test('downloads reserve unique safe paths and never overwrite existing or concurrent files', t => {
  const dir = directory(t); fs.writeFileSync(path.join(dir, 'image.png'), 'original');
  assert.equal(path.basename(reserveDownload(dir, '../image.png')), 'image (1).png');
  assert.equal(path.basename(reserveDownload(dir, 'image.png')), 'image (2).png');
  assert.equal(fs.readFileSync(path.join(dir, 'image.png'), 'utf8'), 'original');
});
test('download history restores completed files, omits sensitive URLs and restricts file actions', t => {
  const dir = directory(t), history = path.join(dir, 'history.json');
  class Item extends EventEmitter { getFilename() { return 'report.png'; } getTotalBytes() { return 3; } getReceivedBytes() { return 3; } setSavePath(file) { this.file = file; } }
  const store = new Downloads(dir, history), item = new Item(), entry = store.add(item);
  fs.writeFileSync(item.file, 'png'); item.emit('done', {}, 'completed');
  assert.equal(new Downloads(dir, history).existing(entry.id), item.file);
  assert.equal(store.list()[0].state, 'completed'); assert.ok(!JSON.stringify(store.list()).includes(dir));
  assert.throws(() => store.existing('../arbitrary-file'), /не скачан/);
  store.clear(); assert.equal(store.list().length, 0); assert.equal(fs.readFileSync(item.file, 'utf8'), 'png');
});
test('unfinished downloads are excluded from history and their reserved file is removed on failure', t => {
  const dir = directory(t), store = new Downloads(dir, path.join(dir, 'history.json'));
  const item = new EventEmitter(); Object.assign(item, { getFilename: () => 'failed.png', getTotalBytes: () => 10, getReceivedBytes: () => 0, setSavePath(file) { this.file = file; } });
  store.add(item); item.emit('done', {}, 'interrupted'); assert.equal(fs.existsSync(item.file), false);
  assert.equal(new Downloads(dir, store.history).list().length, 0);
});
