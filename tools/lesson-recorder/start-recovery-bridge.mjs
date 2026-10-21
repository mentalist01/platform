import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ObsClient } from './obs.mjs';
import { ownedRecording } from './storage.mjs';

// Temporary compatibility bridge for already-running 1.5.28 installations.
// It never stops/restarts OBS or the panel, and only retries after a proven OBS
// process replacement, when the panel and OBS independently confirm no output.
export function failedStartRecoveryTarget(state, process, now = Date.now()) {
  const job = state?.jobs?.find(job => job.id === state.currentLesson?.id);
  const lesson = state?.currentLesson;
  if (!state?.ready || !state.obs || state.obs.outputActive
    || state.jobs.some(job => ['starting', 'recording', 'stopping'].includes(job.status))
    || job?.status !== 'error' || job.file || job.local || job.manual || job.pythonTheory || job.mockReview
    || !/OBS отключился/.test(job.error || '') || lesson?.desired !== 'record'
    || !job.occurrence?.key || lesson.occurrence?.key !== job.occurrence.key
    || !Number.isFinite(lesson.cutoffAt) || lesson.cutoffAt <= now + 3000
    || !Number.isFinite(process?.startedAt) || !Number.isInteger(process.pid) || process.pid <= 0
    || !Number.isFinite(job.createdAt) || process.startedAt < job.createdAt
    || process.startedAt > now - 3000
    || !/^[a-f0-9-]{36}$/i.test(job.id)) return null;
  return job;
}

const obsProcess = () => new Promise((resolve, reject) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$p=@(Get-CimInstance Win32_Process -Filter \"Name='obs64.exe'\"); if($p.Count -eq 1){@{pid=[int]$p[0].ProcessId;startedAt=([DateTimeOffset]$p[0].CreationDate).ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress}"],
  { windowsHide: true, timeout: 5000 }, (error, out) => {
    if (error) reject(error); else { try { resolve(out.trim() ? JSON.parse(out) : null); } catch (failure) { reject(failure); } }
  });
});

export async function recoverFailedStart({ state, process, obs, request, exists = fs.existsSync, now = Date.now() }) {
  const job = failedStartRecoveryTarget(state, process, now);
  if (!job) return false;
  const file = ownedRecording(state.recordDirectory, job.id);
  if (exists(file)) return false;
  await obs.assertCollection();
  const [record, stream] = await Promise.all([
    obs.call('GetRecordStatus'), obs.call('GetStreamStatus'),
  ]);
  if (record.outputActive || stream.outputActive || obs.recordingStartPending || exists(file)) return false;
  // An inactive encoder has no output owner. After a crash its saved filename
  // may even belong to the previous lesson. The panel sets a new unique name;
  // requiring that idle name to match the failed job prevented recovery.
  // Revalidate after the independent OBS reads; the user may have clicked start.
  const fresh = await request('/state');
  if (!failedStartRecoveryTarget(fresh, process, now) || fresh.currentLesson.id !== job.id) return false;
  await request('/retry-start', { id: job.id });
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.IVAN100_RECORDER_HOME || path.join(os.homedir(), 'Ivan100Recorder');
  const logFile = path.join(root, 'start-recovery-bridge.log');
  const log = (event, details = {}) => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), event, ...details }) + '\n');
  const lock = path.join(root, 'start-recovery-bridge.lock');
  const descriptor = fs.openSync(lock, 'wx');
  fs.writeFileSync(descriptor, String(process.pid));
  const attempted = new Set(), obs = new ObsClient();
  let key = '';
  const request = async (route, body) => {
    if (!key) {
      const html = await fetch('http://127.0.0.1:18765/', { signal: AbortSignal.timeout(4000) }).then(r => r.text());
      key = /const key='([^']+)'/.exec(html)?.[1];
      if (!key) throw Error('panel-key-unavailable');
    }
    const response = await fetch('http://127.0.0.1:18765' + route, {
      signal: AbortSignal.timeout(body ? 40000 : 5000),
      method: body ? 'POST' : 'GET', headers: { 'x-recorder-key': key, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 403) key = '';
    if (!response.ok) throw Error(`local-${response.status}`);
    return response.json();
  };
  try {
    log('started');
    const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    while (Date.now() < expiresAt) {
      try {
        const state = await request('/state');
        if (state.updater?.version !== '1.5.28') { log('permanent-update-present'); break; }
        const failed = state.jobs.find(job => job.id === state.currentLesson?.id);
        if (failed?.status === 'error' && /OBS отключился/.test(failed.error || '')) {
          const process = await obsProcess();
          const target = failedStartRecoveryTarget(state, process);
          const identity = target && `${target.id}:${process.pid}`;
          if (identity && !attempted.has(identity)) {
            attempted.add(identity);
            const accepted = await recoverFailedStart({ state, process, obs, request });
            log(accepted ? 'retry-accepted' : 'retry-safety-blocked', { id: target.id });
          }
        }
      } catch (error) { log('check-failed', { message: String(error.message).slice(0, 100) }); }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } finally {
    obs.socket?.close(); fs.closeSync(descriptor); fs.unlinkSync(lock); log('stopped');
  }
}
