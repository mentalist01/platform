import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function updatePaths(root, task) {
  root = path.resolve(root); task = path.resolve(task);
  if (path.dirname(path.dirname(task)) !== root || path.basename(path.dirname(task)) !== 'updates'
    || !/^[a-f0-9-]{36}$/.test(path.basename(task))) throw new Error('Invalid update directory');
  return { root, task, app: path.join(root, 'app'), candidate: path.join(task, 'candidate'), backup: path.join(task, 'previous') };
}
export async function activateUpdate({ root, task, parentPid, launch, healthy }) {
  const paths = updatePaths(root, task);
  const statusFile = path.join(paths.root, 'update-status.json');
  const state = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  if (state.id !== path.basename(paths.task) || state.status !== 'restarting') throw new Error('Update request changed');
  const write = status => {
    const temporary = statusFile + '.worker.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ ...state, ...status })); fs.renameSync(temporary, statusFile);
  };
  let moved = false; let installed = false; let child;
  try {
    if (parentPid) {
      for (let attempt = 0; attempt < 90; attempt++) {
        let alive = true; try { process.kill(parentPid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
        if (!alive) break;
        if (attempt === 89) throw new Error('Пульт не завершил работу. Рабочая версия сохранена.');
        await sleep(1000);
      }
    }
    fs.renameSync(paths.app, paths.backup); moved = true;
    fs.renameSync(paths.candidate, paths.app); installed = true;
    child = await launch(paths.app, paths.root);
    if (!await healthy(state.releaseId, child)) throw new Error('Новая версия не запустилась. Восстановлена предыдущая версия.');
    write({ status: 'complete', error: '' });
  } catch (error) {
    if (child) { child.kill(); await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve)); }
    if (installed) fs.renameSync(paths.app, path.join(paths.task, 'failed'));
    if (moved) fs.renameSync(paths.backup, paths.app);
    write({ status: 'error', error: String(error.message).slice(0, 240) });
    if (moved) await launch(paths.app, paths.root);
    throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, task, pid] = process.argv.slice(2);
  const launch = (app, directory) => new Promise((resolve, reject) => {
    const log = fs.openSync(path.join(task, 'startup.log'), 'a');
    const child = spawn(path.join(app, 'node.exe'), [path.join(app, 'app.mjs')], { cwd: app, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, IVAN100_RECORDER_HOME: directory } });
    fs.closeSync(log); child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(child); });
  });
  const healthy = async (releaseId, child) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (child.exitCode !== null) return false;
      try { const result = await fetch('http://127.0.0.1:18765/health', { signal: AbortSignal.timeout(1500) }); if (result.ok && (await result.json()).releaseId === releaseId) return true; } catch { /* starting */ }
      await sleep(1000);
    }
    return false;
  };
  await activateUpdate({ root, task, parentPid: Number(pid), launch, healthy }).catch(() => { process.exitCode = 1; });
}
