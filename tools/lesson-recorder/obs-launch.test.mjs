import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ObsClient, archiveObsStartupMarkers } from './obs.mjs';

function fixture(t, { processes = [], probeError = false, readyAfter = Infinity, exit = null } = {}) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-launch-'));
  t.after(() => fs.rmSync(configDir, { recursive: true, force: true }));
  let spawns = 0, probes = 0, reads = 0;
  const child = Object.assign(new EventEmitter(), { unref() {}, exitCode: exit });
  const obs = new ObsClient({ executable: import.meta.filename, configDir,
    processProbe: async () => { probes++; if (probeError) throw Error('unavailable'); return processes; },
    spawnProcess: () => { spawns++; processes.push(123); return child; },
    wait: async () => {},
  });
  obs.connect = async () => { if (++reads < readyAfter) throw Object.assign(Error('offline'), { obsTransport: true }); };
  return { obs, child, configDir, counts: () => ({ spawns, probes }) };
}

test('a live OBS output is left intact without starting another process', async t => {
  const { obs, counts } = fixture(t, { readyAfter: 1 });
  await obs.launch(); assert.deepEqual(counts(), { spawns: 0, probes: 0 });
});

test('an OBS startup dialog never creates a process on every retry', async t => {
  const { obs, counts } = fixture(t, { processes: [42] });
  for (let attempt = 0; attempt < 3; attempt++) await assert.rejects(obs.launch(), /Откройте окно OBS/);
  assert.deepEqual(counts(), { spawns: 0, probes: 3 });
});

test('concurrent starts share one launch and later retries retain the running process', async t => {
  const { obs, counts } = fixture(t);
  const results = await Promise.allSettled([obs.launch(), obs.launch(), obs.launch()]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.deepEqual(counts(), { spawns: 1, probes: 1 });
  await assert.rejects(obs.launch()); assert.deepEqual(counts(), { spawns: 1, probes: 2 });
});

test('a delayed existing OBS connection recovers without another process', async t => {
  const { obs, counts } = fixture(t, { processes: [42], readyAfter: 4 });
  await obs.launch(); assert.deepEqual(counts(), { spawns: 0, probes: 1 });
});

test('unknown process state and invalid OBS configuration do not spawn duplicates', async t => {
  const { obs, counts } = fixture(t, { probeError: true });
  await assert.rejects(obs.launch(), /Не удалось проверить/);
  obs.connect = async () => { throw Error('configuration invalid'); };
  await assert.rejects(obs.launch(), /configuration invalid/);
  assert.equal(counts().spawns, 0);
});

test('an exited startup process releases the launch lock and allows a later retry', async t => {
  const { obs, counts } = fixture(t, { exit: 1 });
  await assert.rejects(obs.launch(), /завершился при запуске/);
  assert.equal(obs.launching, null); assert.equal(counts().spawns, 1);
});

test('an abandoned OBS32 run is archived before startup without changing scenes or crash reports', async t => {
  const { obs, configDir, counts } = fixture(t, { readyAfter: 3 });
  const sentinel = path.join(configDir, '.sentinel'); fs.mkdirSync(sentinel);
  const marker = 'run_12345678-1234-1234-1234-123456789012';
  fs.writeFileSync(path.join(sentinel, marker), '');
  fs.mkdirSync(path.join(configDir, 'crashes')); fs.writeFileSync(path.join(configDir, 'crashes', 'report.txt'), 'crash evidence');
  fs.writeFileSync(path.join(configDir, 'scene.json'), 'original scenes');
  await obs.launch();
  assert.deepEqual(counts(), { spawns: 1, probes: 2 });
  assert.equal(fs.existsSync(sentinel), false);
  const archive = path.join(configDir, 'startup-recovery');
  assert.equal(fs.readFileSync(path.join(archive, fs.readdirSync(archive)[0], marker), 'utf8'), '');
  assert.equal(fs.readFileSync(path.join(configDir, 'crashes', 'report.txt'), 'utf8'), 'crash evidence');
  assert.equal(fs.readFileSync(path.join(configDir, 'scene.json'), 'utf8'), 'original scenes');
});

test('an OBS process appearing during startup keeps its run markers and is never duplicated', async t => {
  const { obs, configDir, counts } = fixture(t);
  const sentinel = path.join(configDir, '.sentinel'); fs.mkdirSync(sentinel);
  let checks = 0; obs.processProbe = async () => ++checks === 1 ? [] : [42];
  await assert.rejects(obs.launch(), /Откройте окно OBS/);
  assert.equal(counts().spawns, 0); assert.equal(fs.existsSync(sentinel), true);
});

test('unknown startup files are preserved instead of silently suppressing OBS recovery', t => {
  const { configDir } = fixture(t);
  const sentinel = path.join(configDir, '.sentinel'); fs.mkdirSync(sentinel);
  fs.writeFileSync(path.join(sentinel, 'unexpected.txt'), 'keep');
  assert.throws(() => archiveObsStartupMarkers(configDir), /неизвестные файлы/);
  assert.equal(fs.readFileSync(path.join(sentinel, 'unexpected.txt'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(configDir, 'startup-recovery')), false);
});
