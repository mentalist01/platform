import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureRecorderRunning, recorderRuntime, diagnosticLog } from './watchdog.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-watchdog-'));
  fs.mkdirSync(path.join(root, 'app'));
  fs.writeFileSync(path.join(root, 'app', 'node.exe'), 'fixture');
  fs.writeFileSync(path.join(root, 'app', 'app.mjs'), 'fixture');
  const files = { 'state.json': '{"config":{"token":"keep-secret","recordDirectory":"unchanged"},"jobs":{"lesson":"keep-video"}}', 'recording.mkv': 'original video' };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, name), value);
  t.after(() => { try { for (const [name, value] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), value); } finally { fs.rmSync(root, { recursive: true, force: true }); } });
  let online = false, starts = 0;
  const options = { root, healthy: async () => online, alive: () => false, now: () => 100000, wait: async () => {},
    start: async receivedRoot => { assert.equal(receivedRoot, root); starts++; online = true; return 1234; } };
  return { root, options, online: () => { online = true; }, starts: () => starts,
    write: (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data)) };
}
test('an independent health check restarts a dead service once and preserves all configuration and recordings', async t => {
  const f = fixture(t);
  assert.equal(await ensureRecorderRunning(f.options), 'restarted');
  assert.equal(await ensureRecorderRunning(f.options), 'online');
  assert.equal(f.starts(), 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'watchdog-control.json'))).pid, 1234);
});
test('a live but unresponsive process is neither killed nor replaced', async t => {
  const f = fixture(t); f.write('watchdog-control.json', { pid: 5678 });
  assert.equal(await ensureRecorderRunning({ ...f.options, alive: pid => pid === 5678 }), 'unresponsive');
  assert.equal(f.starts(), 0);
});
test('preparing and activating an update suppress independent restarts', async t => {
  const f = fixture(t);
  for (const status of ['preparing', 'restarting']) {
    f.write('update-status.json', { status });
    assert.equal(await ensureRecorderRunning(f.options), 'suspended');
  }
  assert.equal(f.starts(), 0);
});
test('an intentional shutdown grants the installer a grace period, then health checks recover again', async t => {
  const f = fixture(t); const runtime = recorderRuntime(f.root, 42, () => 100000);
  runtime.suspend('update'); runtime.heartbeat();
  assert.equal(await ensureRecorderRunning(f.options), 'suspended');
  assert.equal(await ensureRecorderRunning({ ...f.options, now: () => 220001 }), 'restarted');
  assert.equal(f.starts(), 1);
});
test('concurrent health checks hold a start lock until the service becomes ready', async t => {
  const f = fixture(t); let release;
  const pending = ensureRecorderRunning({ ...f.options, start: () => new Promise(resolve => { release = resolve; }) });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(await ensureRecorderRunning(f.options), 'starting');
  release(123); f.online(); assert.equal(await pending, 'restarted');
  assert.equal(f.starts(), 0);
});
test('a PID reservation prevents overlap even when cold startup takes longer than the readiness wait', async t => {
  const f = fixture(t);
  assert.equal(await ensureRecorderRunning({ ...f.options, start: async () => 2468 }), 'started');
  assert.equal(await ensureRecorderRunning({ ...f.options, alive: pid => pid === 2468 }), 'unresponsive');
  assert.equal(f.starts(), 0);
});
test('incomplete installations are preserved rather than executed', async t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.root, 'app', 'node.exe'));
  assert.equal(await ensureRecorderRunning(f.options), 'missing'); assert.equal(f.starts(), 0);
});
test('diagnostics omit credentials and private video addresses', t => {
  const f = fixture(t); diagnosticLog(f.root, 'network-error', 'Bearer secret123 https://rutube.ru/video/private/?p=secret456');
  const value = fs.readFileSync(path.join(f.root, 'recorder-diagnostics.log'), 'utf8');
  assert.ok(value.includes('network-error')); assert.ok(!value.includes('secret123')); assert.ok(!value.includes('secret456'));
});

test('a killed fixture service is restored by a fresh independent check with no overlapping process', async t => {
  const f = fixture(t); let port, child, starts = 0;
  fs.writeFileSync(path.join(f.root, 'app', 'app.mjs'), `import http from 'node:http';const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({releaseId:'a'.repeat(64)}));});server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));`);
  const options = { ...f.options, now: Date.now,
    healthy: async () => { if (!port) return false; try { return (await fetch('http://127.0.0.1:' + port, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } },
    alive: pid => { try { process.kill(pid, 0); return true; } catch { return false; } },
    start: async () => {
      starts++; child = spawn(process.execPath, [path.join(f.root, 'app', 'app.mjs')], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      await new Promise((resolve, reject) => { child.once('message', value => { port = value.port; resolve(); }); child.once('error', reject); });
      return child.pid;
    } };
  t.after(() => child?.kill());
  assert.equal(await ensureRecorderRunning(options), 'restarted');
  assert.equal(await ensureRecorderRunning(options), 'online'); assert.equal(starts, 1);
  const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped;
  assert.equal(await ensureRecorderRunning(options), 'restarted'); assert.equal(starts, 2);
  assert.equal(await ensureRecorderRunning(options), 'online');
});
