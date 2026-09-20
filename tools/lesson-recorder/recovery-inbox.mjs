import fs from 'node:fs';
import path from 'node:path';
import { ownedRecording, readJson } from './storage.mjs';

export function importRecoveredRecordings({ directory, recordDirectory, state, save }) {
  const inbox = path.join(directory, 'recovery-inbox');
  if (!fs.existsSync(inbox)) return;
  for (const name of fs.readdirSync(inbox)) {
    if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
    const job = readJson(path.join(inbox, name));
    if (!job || name !== `${job.id}.json` || state.jobs[job.id]) continue;
    if (job.status !== 'saved' || !/^[a-f0-9-]{36}$/i.test(job.remoteJobId || '') || !job.occurrence?.key) continue;
    const file = ownedRecording(recordDirectory, job.id, job.file);
    if (!fs.existsSync(file) || !fs.statSync(file).size) continue;
    state.jobs[job.id] = {
      id: job.id, remoteJobId: job.remoteJobId, occurrence: job.occurrence,
      title: String(job.title || 'Запись урока'), file, local: false, manual: true,
      status: 'saved', createdAt: job.createdAt, stoppedAt: job.stoppedAt,
      pendingReport: { status: 'saved' }, error: '',
    };
    save();
  }
}
