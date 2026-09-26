import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateBundle, RecorderUpdater } from './updater.mjs';
import { activateUpdate, updatePaths } from './update-worker.mjs';
import { recorderRelease } from '../../server/recorderPackage.js';

test('release hash is verified and update file names cannot escape the app or overwrite data', () => {
  const release = recorderRelease();
  assert.ok(validateBundle(release.bundle, release.manifest).files['app.mjs']);
  assert.throws(() => validateBundle(Buffer.from('modified'), release.manifest));
  for (const name of ['../state.json', 'state.json', 'runtime.json', 'C:\\state.json', 'app.mjs:evil']) {
    const value = JSON.parse(release.bundle); value.files[name] = 'bad';
    const bytes = Buffer.from(JSON.stringify(value)); const id = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.throws(() => validateBundle(bytes, { ...release.manifest, id, sha256: id, bytes: bytes.length }));
  }
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-update-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const id = crypto.randomUUID(); const task = path.join(root, 'updates', id);
  fs.mkdirSync(path.join(root, 'app'), { recursive: true }); fs.mkdirSync(path.join(task, 'candidate'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'version'), 'old'); fs.writeFileSync(path.join(task, 'candidate', 'version'), 'new');
  fs.writeFileSync(path.join(root, 'state.json'), 'settings-and-jobs');
  fs.writeFileSync(path.join(root, 'video.mkv'), 'recording');
  fs.writeFileSync(path.join(root, 'update-status.json'), JSON.stringify({ id, status: 'restarting', releaseId: 'target' }));
  return { root, task, id };
}
test('activation replaces only app, retains a backup and leaves settings and recordings intact', async t => {
  const f = fixture(t); let launched;
  await activateUpdate({ ...f, launch: async app => { launched = fs.readFileSync(path.join(app, 'version'), 'utf8'); }, healthy: async id => id === 'target' });
  assert.equal(launched, 'new');
  assert.equal(fs.readFileSync(path.join(f.task, 'previous', 'version'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(f.root, 'state.json'), 'utf8'), 'settings-and-jobs');
  assert.equal(fs.readFileSync(path.join(f.root, 'video.mkv'), 'utf8'), 'recording');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'update-status.json'))).status, 'complete');
});
test('failed health check restores and launches the old app without losing data', async t => {
  const f = fixture(t); const launched = [];
  await assert.rejects(activateUpdate({ ...f, launch: async app => { launched.push(fs.readFileSync(path.join(app, 'version'), 'utf8')); }, healthy: async () => false }));
  assert.deepEqual(launched, ['new', 'old']);
  assert.equal(fs.readFileSync(path.join(f.root, 'app', 'version'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(f.root, 'state.json'), 'utf8'), 'settings-and-jobs');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'update-status.json'))).status, 'error');
  assert.throws(() => updatePaths(f.root, path.join(f.root, '..', 'escape')));
});
test('busy recorder refuses update before fetching or replacing files; duplicate request does not retry', async t => {
  const f = fixture(t); let checks = 0;
  const updater = new RecorderUpdater({ directory: f.root, here: path.join(f.root, 'app'), config: () => ({}), assertIdle: async () => { checks++; throw new Error('Идёт запись'); }, report: async () => {}, platform: 'win32' });
  const request = { id: crypto.randomUUID(), requestedAt: Date.now(), release: recorderRelease().manifest };
  await updater.install(request); await updater.install(request);
  assert.equal(checks, 1); assert.equal(updater.state.status, 'error'); assert.equal(updater.busy, false);
  assert.equal(fs.readFileSync(path.join(f.root, 'app', 'version'), 'utf8'), 'old');
});
