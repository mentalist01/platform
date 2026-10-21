import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('update worker starts when the updates folder is a Windows junction or directory symlink', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-worker-entry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const actual = path.join(root, 'actual'), linked = path.join(root, 'linked');
  fs.mkdirSync(actual);
  fs.copyFileSync(new URL('./update-worker.mjs', import.meta.url), path.join(actual, 'worker.mjs'));
  fs.symlinkSync(actual, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const child = spawnSync(process.execPath, [path.join(linked, 'worker.mjs'), root, 'invalid-task', '0'], { encoding: 'utf8', windowsHide: true });
  // Executing the worker must reach its path validation, rather than silently
  // skipping main because argv contains a junction but import.meta uses its target.
  assert.equal(child.status, 1);
  assert.equal(child.signal, null);
});
