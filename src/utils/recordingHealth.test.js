import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingHealthWarning } from './recordingHealth.js';
const input = { enabled: true, active: true, activeSince: 1000, checkedAt: 99000, now: 100000,
  settings: { devices: [{ online: true }], jobs: [{ status: 'recording', desired: 'record', cutoffAt: 200000 }] } };
test('recording health is silent outside a lesson, with recording disabled, and during startup grace', () => {
  assert.equal(recordingHealthWarning({ ...input, active: false }), null);
  assert.equal(recordingHealthWarning({ ...input, enabled: false }), null);
  assert.equal(recordingHealthWarning({ ...input, activeSince: 90000 }), null);
  assert.equal(recordingHealthWarning(input), null);
});
test('a stale server job cannot claim recording when the helper has stopped reporting', () => {
  const settings = { ...input.settings, devices: [{ online: false }] };
  assert.match(recordingHealthWarning({ ...input, settings }).title, /потерял связь/);
});
test('failed settings requests are distinguished from an actually offline helper', () => {
  assert.match(recordingHealthWarning({ ...input, checkedAt: 75000 }).title, /проверить запись/);
});
test('a saved, failed or expired job cannot hide a missing capture during a live lesson', () => {
  for (const job of [{ status: 'saved', desired: 'stop', cutoffAt: 200000 }, { status: 'error', error: 'OBS stopped', desired: 'record', cutoffAt: 200000 }, { status: 'recording', desired: 'record', cutoffAt: 99000 }]) {
    const value = recordingHealthWarning({ ...input, settings: { ...input.settings, jobs: [job] } });
    assert.match(value.title, /не подтверждена/);
    if (job.error) assert.equal(value.detail, job.error);
  }
});
