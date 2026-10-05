import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { atomicJson, readJson } from './storage.mjs';

const controlName = 'watchdog-control.json';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const processAlive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};
export function diagnosticLog(root, event, detail = '') {
  try {
    const file = path.join(root, 'recorder-diagnostics.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.renameSync(file, file + '.previous');
    const safe = String(detail).replace(/Bearer\s+\S+/gi, 'Bearer [hidden]').replace(/https?:\/\/\S+/g, '[address]').slice(0, 600);
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), event, detail: safe }) + '\n');
  } catch { /* Diagnostics must never stop capture. */ }
}
export function recorderRuntime(root, pid = process.pid, now = Date.now) {
  const file = path.join(root, controlName);
  const write = value => atomicJson(file, value);
  write({ pid, startedAt: now(), heartbeatAt: now(), stopUntil: 0 });
  diagnosticLog(root, 'service-start', `pid=${pid}`);
  return {
    heartbeat() { write({ ...readJson(file, {}), pid, heartbeatAt: now() }); },
    suspend(reason) {
      write({ ...readJson(file, {}), pid, heartbeatAt: now(), stopUntil: now() + 120000 });
      diagnosticLog(root, 'service-shutdown', reason);
    },
  };
}
const probe = async () => {
  try {
    const response = await fetch('http://127.0.0.1:18765/health', { signal: AbortSignal.timeout(2000) });
    return response.ok && /^[a-f0-9]{64}$/.test((await response.json()).releaseId || '');
  } catch { return false; }
};
const launch = root => {
  const app = path.join(root, 'app');
  const log = fs.openSync(path.join(root, 'recorder-startup.log'), 'a');
  try {
    const child = spawn(path.join(app, 'node.exe'), [path.join(app, 'app.mjs')], {
      cwd: app, detached: true, windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, IVAN100_RECORDER_HOME: root },
    });
    return new Promise((resolve, reject) => {
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(child.pid); });
    });
  } finally { fs.closeSync(log); }
};
export async function ensureRecorderRunning({ root, healthy = probe, alive = processAlive, start = launch, now = Date.now, wait = delay }) {
  if (await healthy()) return 'online';
  const control = readJson(path.join(root, controlName), {});
  const update = readJson(path.join(root, 'update-status.json'), {});
  if (control.stopUntil > now() || ['preparing', 'restarting'].includes(update.status)) return 'suspended';
  // A slow service is never killed or replaced: it may still be writing a lesson.
  if (alive(control.pid)) { diagnosticLog(root, 'service-unresponsive', `pid=${control.pid}`); return 'unresponsive'; }
  if (!fs.existsSync(path.join(root, 'app', 'node.exe')) || !fs.existsSync(path.join(root, 'app', 'app.mjs'))) return 'missing';
  const lock = path.join(root, 'watchdog-start.lock');
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (now() - fs.statSync(lock).mtimeMs > 120000) fs.unlinkSync(lock);
    return 'starting';
  }
  try {
    if (await healthy()) return 'online';
    const latest = readJson(path.join(root, controlName), {});
    const latestUpdate = readJson(path.join(root, 'update-status.json'), {});
    if (latest.stopUntil > now() || ['preparing', 'restarting'].includes(latestUpdate.status)) return 'suspended';
    if (alive(latest.pid)) return 'unresponsive';
    diagnosticLog(root, 'watchdog-restart', `previousPid=${latest.pid || 0}`);
    const pid = await start(root);
    // Reserve the PID before releasing the lock, including slow cold starts.
    if (readJson(path.join(root, controlName), {}).pid !== pid) {
      atomicJson(path.join(root, controlName), { pid, startedAt: now(), heartbeatAt: now(), stopUntil: 0 });
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await healthy()) return 'restarted';
      await wait(500);
    }
    return 'started';
  } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.IVAN100_RECORDER_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  await ensureRecorderRunning({ root }).catch(error => { diagnosticLog(root, 'watchdog-error', error.message); process.exitCode = 1; });
}
