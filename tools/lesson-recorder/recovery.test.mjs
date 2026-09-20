import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { shouldFinishRecovery } from './recover-live.mjs';
import { importRecoveredRecordings } from './recovery-inbox.mjs';

test('live recovery stops on the scheduled end or the next lesson, ignoring a stale stop', () => {
  const job = { remoteJobId: 'original', createdAt: 100, stopAt: 1000 };
  assert.equal(shouldFinishRecovery(job, [{ id: 'original', desired: 'stop' }], 999), false);
  assert.equal(shouldFinishRecovery(job, [], 1000), true);
  assert.equal(shouldFinishRecovery(job, [{ id: 'next', desired: 'record', cutoffAt: 2000, startedAt: 150 }], 200), true);
  assert.equal(shouldFinishRecovery(job, [{ id: 'old', desired: 'record', cutoffAt: 2000, startedAt: 50 }], 200), false);
});

test('recovery inbox imports the correct saved file only once and preserves upload progress', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-inbox-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const recordDirectory = path.join(directory, 'videos'); fs.mkdirSync(recordDirectory);
  const inbox = path.join(directory, 'recovery-inbox'); fs.mkdirSync(inbox);
  const id = '11111111-1111-4111-8111-111111111111';
  const file = path.join(recordDirectory, `lesson-${id}.mkv`); fs.writeFileSync(file, 'video');
  const job = { id, remoteJobId: '22222222-2222-4222-8222-222222222222', status: 'saved', file, occurrence: { key: 'lesson' } };
  fs.writeFileSync(path.join(inbox, `${id}.json`), JSON.stringify(job));
  const state = { jobs: {} }; let saves = 0;
  const options = { directory, recordDirectory, state, save: () => { saves++; } };
  importRecoveredRecordings(options);
  assert.equal(state.jobs[id].remoteJobId, job.remoteJobId); assert.equal(state.jobs[id].local, false);
  state.jobs[id].status = 'processing';
  importRecoveredRecordings(options);
  assert.equal(saves, 1); assert.equal(state.jobs[id].status, 'processing');
});
