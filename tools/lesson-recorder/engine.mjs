import fs from 'node:fs';
import path from 'node:path';
import { ownedRecording } from './storage.mjs';

export class RecorderEngine {
  constructor({ obs, state, save, api, recordDirectory, ready, now = Date.now }) {
    Object.assign(this, { obs, state, save, api, recordDirectory, ready, now });
  }
  active() { return Object.values(this.state.jobs).find((j) => ['starting', 'recording', 'stopping'].includes(j.status)); }
  async report(job, status, extra = {}) {
    if (job.local) return;
    // A manual continuation can belong to a server job already marked finished.
    // Publish it after stopping locally; do not reopen the lesson or its call.
    if (job.manual && status === 'recording') return;
    job.pendingReport = { status, ...extra }; this.save();
    await this.flushReport(job);
  }
  async flushReport(job) {
    const pending = job.pendingReport;
    if (!pending) return;
    await this.api(`/jobs/${job.remoteJobId || job.id}`, pending);
    if (job.pendingReport === pending) { delete job.pendingReport; this.save(); }
  }
  async start(job) {
    if (this.active()) throw new Error('Сначала завершите текущую запись');
    await this.obs.launch();
    if (this.obs.prepare) await this.obs.prepare(this.state.config, this.recordDirectory, job.audioMode);
    else if ((await this.obs.status()).outputActive) throw new Error('В OBS уже идёт запись. Сначала завершите её.');
    // Persist the intent first: a crash after StartRecord must not create a second recording.
    const local = { ...job, status: 'starting', error: '', createdAt: this.now() };
    this.state.jobs[job.id] = local; this.save();
    try {
      await this.obs.start(job.id);
      local.status = 'recording'; this.save();
      await this.report(local, 'recording');
    } catch (error) {
      // Keep starting until reconciliation establishes whether OBS accepted the request.
      local.error = error.message; this.save(); throw error;
    }
  }
  async recover(job) {
    const status = await this.obs.status();
    const { parameterValue } = await this.obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
    const ourOutput = parameterValue === `lesson-${job.id}`;
    if (status.outputActive) {
      if (!ourOutput) throw new Error('OBS пишет другую запись; пульт не будет её останавливать');
      job.status = job.status === 'stopping' ? 'stopping' : 'recording'; this.save(); return;
    }
    const file = ownedRecording(this.recordDirectory, job.id);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      job.file = file; job.status = 'saved'; job.stoppedAt = this.now(); job.error = ''; this.save();
      await this.report(job, 'saved');
    } else if (job.status === 'starting') {
      job.status = 'error'; job.error = 'OBS не начал запись. Устраните причину и нажмите «Повторить запуск». Не записанные минуты восстановить нельзя.'; this.save();
      await this.report(job, 'error', { error: job.error });
    } else {
      job.status = 'error'; job.error = 'OBS остановился, файл не найден. Проверьте папку записей.'; this.save();
      await this.report(job, 'error', { error: job.error });
    }
  }
  async stop(job) {
    job.status = 'stopping'; this.save();
    // Always verify that this is still our profile/output before issuing StopRecord.
    const status = await this.obs.status();
    const { parameterValue } = await this.obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
    if (status.outputActive && parameterValue !== `lesson-${job.id}`) throw new Error('В OBS идёт другая запись');
    const file = status.outputActive ? await this.obs.stop() : ownedRecording(this.recordDirectory, job.id);
    job.file = ownedRecording(this.recordDirectory, job.id, file);
    if (!fs.existsSync(job.file) || fs.statSync(job.file).size === 0) throw new Error('OBS не сохранил файл записи');
    job.status = 'saved'; job.stoppedAt = this.now(); job.error = ''; this.save();
    await this.report(job, 'saved');
  }
  async tick() {
    const active = this.active();
    // A network outage does not bypass the local safety cutoff.
    if (active) {
      if (active.cutoffAt <= this.now() || active.status === 'stopping') await this.stop(active);
      else await this.recover(active);
    }
    if (!this.state.config.token) return;
    const remote = await this.api('/poll', { ready: this.ready() });
    // Complete the old file before considering the next lesson, regardless of
    // server ordering. Uploading that file is independent of the next capture.
    for (const wanted of remote.jobs) {
      const local = this.state.jobs[wanted.id];
      if (wanted.desired === 'stop' && local && ['starting', 'recording', 'stopping'].includes(local.status)) await this.stop(local);
    }
    for (const wanted of remote.jobs) {
      const local = this.state.jobs[wanted.id];
      if (wanted.desired === 'stop') continue;
      if (!remote.enabled || !this.ready() || wanted.cutoffAt <= this.now()) continue;
      if (!local && !this.active()) await this.start(wanted);
      else if (local?.status === 'recording') await this.report(local, 'recording');
    }
    for (const job of Object.values(this.state.jobs)) {
      // A saved file must eventually appear on the platform even with automatic upload off.
      if (job.pendingReport && job.status !== 'recording') await this.flushReport(job);
    }
  }
}
