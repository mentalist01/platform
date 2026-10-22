import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ObsClient } from './obs.mjs';

function fixture({ processes = [], probeError = false, readyAfter = Infinity, exit = null } = {}) {
  let spawns = 0, probes = 0, reads = 0;
  const child = Object.assign(new EventEmitter(), { unref() {}, exitCode: exit });
  const obs = new ObsClient({ executable: import.meta.filename,
    processProbe: async () => { probes++; if (probeError) throw Error('unavailable'); return processes; },
    spawnProcess: () => { spawns++; processes.push(123); return child; },
    wait: async () => {},
  });
  obs.connect = async () => { if (++reads < readyAfter) throw Object.assign(Error('offline'), { obsTransport: true }); };
  return { obs, child, counts: () => ({ spawns, probes }) };
}

test('a live OBS output is left intact without starting another process', async () => {
  const { obs, counts } = fixture({ readyAfter: 1 });
  await obs.launch(); assert.deepEqual(counts(), { spawns: 0, probes: 0 });
});

test('an OBS startup dialog never creates a process on every retry', async () => {
  const { obs, counts } = fixture({ processes: [42] });
  for (let attempt = 0; attempt < 3; attempt++) await assert.rejects(obs.launch(), /Откройте окно OBS/);
  assert.deepEqual(counts(), { spawns: 0, probes: 3 });
});

test('concurrent starts share one launch and later retries retain the running process', async () => {
  const { obs, counts } = fixture();
  const results = await Promise.allSettled([obs.launch(), obs.launch(), obs.launch()]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.deepEqual(counts(), { spawns: 1, probes: 1 });
  await assert.rejects(obs.launch()); assert.deepEqual(counts(), { spawns: 1, probes: 2 });
});

test('a delayed existing OBS connection recovers without another process', async () => {
  const { obs, counts } = fixture({ processes: [42], readyAfter: 4 });
  await obs.launch(); assert.deepEqual(counts(), { spawns: 0, probes: 1 });
});

test('unknown process state and invalid OBS configuration do not spawn duplicates', async () => {
  const { obs, counts } = fixture({ probeError: true });
  await assert.rejects(obs.launch(), /Не удалось проверить/);
  obs.connect = async () => { throw Error('configuration invalid'); };
  await assert.rejects(obs.launch(), /configuration invalid/);
  assert.equal(counts().spawns, 0);
});

test('an exited startup process releases the launch lock and allows a later retry', async () => {
  const { obs, counts } = fixture({ exit: 1 });
  await assert.rejects(obs.launch(), /завершился при запуске/);
  assert.equal(obs.launching, null); assert.equal(counts().spawns, 1);
});
