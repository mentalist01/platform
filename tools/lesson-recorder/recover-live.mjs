// Recover one already-running OBS recording without restarting OBS or the panel.
// The inbox is consumed by the panel after a safe, idle update.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ObsClient } from './obs.mjs';
import { atomicJson, readJson, ownedRecording } from './storage.mjs';

export function shouldFinishRecovery(job, remoteJobs, now) {
  return now >= job.stopAt || remoteJobs.some((other) => other.id !== job.remoteJobId
    && other.desired === 'record' && other.cutoffAt > now && other.startedAt >= job.createdAt);
}

export async function recoverLive(directory) {
  const state = readJson(path.join(directory, 'state.json'));
  const file = path.join(directory, 'rescued-recording.json');
  const job = readJson(file);
  if (!job?.id || !Number.isFinite(job.stopAt)) throw new Error('Recovery requires a recording and an explicit stop time');
  const obs = new ObsClient();
  const poll = async () => {
    const response = await fetch(`${state.config.platformUrl}/api/desktop-recorder/poll`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${state.config.token}`,
      }, body: JSON.stringify({ ready: true }),
    });
    if (!response.ok) throw new Error(`Platform: ${response.status}`);
    return (await response.json()).jobs;
  };
  job.workerPid = process.pid; job.status = 'recording'; atomicJson(file, job);
  try {
    while (true) {
      const status = await obs.status();
      const { parameterValue } = await obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
      if (!status.outputActive || parameterValue !== `lesson-${job.id}`) break;
      let remoteJobs = [];
      if (Date.now() < job.stopAt) {
        try { remoteJobs = await poll(); } catch { /* The local stop time still applies offline. */ }
      }
      if (shouldFinishRecovery(job, remoteJobs, Date.now())) {
        // Recheck ownership after the network request, before stopping anything.
        const current = await obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
        if (current.parameterValue === `lesson-${job.id}` && (await obs.status()).outputActive) {
          await obs.stop();
        }
        break;
      }
      await delay(2500);
    }
    job.file = ownedRecording(state.config.recordDirectory, job.id);
    if (!fs.existsSync(job.file) || !fs.statSync(job.file).size) throw new Error('Recording file not found');
    job.local = false; job.manual = true; job.status = 'saved'; job.stoppedAt = Date.now();
    job.pendingReport = { status: 'saved' }; atomicJson(file, job);
    atomicJson(path.join(directory, 'recovery-inbox', `${job.id}.json`), job);
    const response = await fetch(`${state.config.platformUrl}/api/desktop-recorder/jobs/${job.remoteJobId}`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${state.config.token}`,
      }, body: JSON.stringify({ status: 'saved' }),
    });
    if (!response.ok) throw new Error(`Saved locally; platform report failed: ${response.status}`);
  } catch (error) {
    job.error = error.message; atomicJson(file, job); throw error;
  } finally { obs.socket?.close(); }
}

if (process.argv[1]?.endsWith('recover-live.mjs')) {
  await recoverLive(process.argv[2]);
}
