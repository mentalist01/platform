import fs from 'node:fs';
import path from 'node:path';
import { ownedRecording } from './storage.mjs';
import { recordingSeconds, observeTimeline, closeTimelineClip, resumeTimeline, finishTimeline } from './python-timeline.mjs';
const sourceSeconds = (job,status) => (job.pythonCaptureOffset || 0) + recordingSeconds(status);

// A scheduled lesson has a hard local boundary, including offline transport.
// Standalone teaching videos keep their own capture deadline.
export function recordingDeadline(job) {
  const end = job?.occurrence?.endMs;
  return !job?.pythonTheory && !job?.mockReview && Number.isFinite(end) && end > 0
    ? Math.min(Number.isFinite(job.cutoffAt) ? job.cutoffAt : end, end) : job?.cutoffAt;
}

export class RecorderEngine {
  constructor({ obs, state, save, api, recordDirectory, ready, now = Date.now }) {
    Object.assign(this, { obs, state, save, api, recordDirectory, ready, now });
    this.restartJobs = new Set(Object.values(state.jobs).filter(job => ['starting', 'recording', 'stopping'].includes(job.status)).map(job => job.id));
    this.materialControlRevision = 0;
    this.stops = new Map();
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
    job = { ...job, cutoffAt: recordingDeadline(job) };
    if (job.cutoffAt <= this.now()) throw new Error('Время урока по расписанию закончилось. Запись этого занятия завершена.');
    if (this.state.jobs[job.id]?.file || fs.existsSync(ownedRecording(this.recordDirectory, job.id))) throw new Error('Файл этой записи уже существует. Продолжите урок новой частью, чтобы сохранить обе записи.');
    await this.obs.launch();
    if (this.obs.prepare) await this.obs.prepare({ ...this.state.config, ...job.captureConfig }, this.recordDirectory, job.audioMode, job.captureProfile);
    else if ((await this.obs.status()).outputActive) throw new Error('В OBS уже идёт запись. Сначала завершите её.');
    if (job.cutoffAt <= this.now()) throw new Error('Время урока по расписанию закончилось. Запись не начата.');
    // Persist the intent first: a crash after StartRecord must not create a second recording.
    const local = { ...job, status: 'starting', error: '', createdAt: this.now() };
    this.state.jobs[job.id] = local; this.save();
    try {
      await this.obs.start(job.id, job.captureProfile, job.captureConfig?.mode);
      local.status = 'recording'; this.save();
      if (local.cutoffAt <= this.now()) { await this.stop(local); return; }
      await this.report(local, 'recording');
    } catch (error) {
      // Keep starting until reconciliation establishes whether OBS accepted the request.
      local.error = error.message; this.save(); throw error;
    }
  }
  async recover(job) {
    const controlRevision = this.materialControlRevision;
    const status = await this.obs.status();
    const { parameterValue } = await this.obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
    if (!['starting', 'recording', 'stopping'].includes(job.status) || this.stops.has(job.id)) return;
    const ourOutput = parameterValue === `lesson-${job.id}`;
    if (status.outputActive) {
      if (!ourOutput) throw new Error('OBS пишет другую запись; пульт не будет её останавливать');
      // Reconcile a late confirmation or an OBS-side pause after a connection
      // failure. An in-flight local control owns its boundary; stale polls must
      // not close it or reopen it while that command is being confirmed.
      if (!this.pauseOperation && controlRevision === this.materialControlRevision) {
        if (status.outputPaused) closeTimelineClip(job.pythonTimeline, sourceSeconds(job,status));
        else {
          resumeTimeline(job.pythonTimeline, job.pythonTimeline?.sourceEnd || 0);
          observeTimeline(job.pythonTimeline, sourceSeconds(job,status));
        }
      }
      delete job.resumeAfterRestart;
      job.status = job.status === 'stopping' ? 'stopping' : 'recording'; this.save(); return;
    }
    const file = ownedRecording(this.recordDirectory, job.id);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      finishTimeline(job.pythonTimeline, sourceSeconds(job,status));
      if (job.status !== 'stopping' && !job.local && !job.manual && !job.fallbackMode
        && job.desired === 'record' && recordingDeadline(job) > this.now()) job.resumeAfterRestart = true;
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
  stop(job) {
    if (this.stops.has(job.id)) return this.stops.get(job.id);
    if (!['starting', 'recording', 'stopping'].includes(job.status)) return Promise.resolve();
    const operation = this.stopRecording(job).finally(() => this.stops.delete(job.id));
    this.stops.set(job.id, operation);
    return operation;
  }
  async stopRecording(job) {
    delete job.resumeAfterRestart;
    job.status = 'stopping'; this.save();
    // A local pause is independent of slow platform polling, but StopRecord
    // must wait for it before another lesson can take over the OBS output.
    if (this.pauseOperation) await this.pauseOperation.catch(() => {});
    // Always verify that this is still our profile/output before issuing StopRecord.
    const status = await this.obs.status();
    const { parameterValue } = await this.obs.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting' });
    if (status.outputActive && parameterValue !== `lesson-${job.id}`) throw new Error('В OBS идёт другая запись');
    finishTimeline(job.pythonTimeline, sourceSeconds(job,status));
    const file = status.outputActive ? await this.obs.stop() : ownedRecording(this.recordDirectory, job.id);
    job.file = ownedRecording(this.recordDirectory, job.id, file);
    if (!fs.existsSync(job.file) || fs.statSync(job.file).size === 0) throw new Error('OBS не сохранил файл записи');
    job.status = 'saved'; job.stoppedAt = this.now(); job.error = ''; this.save();
    await this.report(job, 'saved');
  }
  async setPythonPaused(id, paused) { return this.setMaterialPaused(id, paused); }
  async setMaterialPaused(id, paused) {
    const job = this.active();
    if (!(job?.pythonTheory || job?.mockReview) || job.id !== id || job.status !== 'recording') throw new Error('Выберите текущую запись урока Python или разбора пробника');
    if (typeof paused !== 'boolean') throw new Error('Укажите состояние паузы');
    if (job.cutoffAt <= this.now()) throw new Error('Время записи истекло. Дождитесь сохранения файла.');
    if (this.pauseOperation) throw new Error('Дождитесь подтверждения предыдущего нажатия');
    this.materialControlRevision++;
    const operation = this.obs.setRecordPaused(id, paused);
    this.pauseOperation = operation;
    try {
      const status = await operation;
      if (paused) closeTimelineClip(job.pythonTimeline, sourceSeconds(job,status));
      else resumeTimeline(job.pythonTimeline, sourceSeconds(job,status));
      this.save(); return status;
    }
    finally { this.materialControlRevision++; if (this.pauseOperation === operation) this.pauseOperation = null; }
  }
  async startForCurrentLesson() {
    if (this.active() && this.restartJobs.has(this.active().id)) await this.reconcileActive();
    if (this.active()) throw new Error('Запись уже идёт');
    // A network error must not silently turn a bound lesson into a local-only recording.
    if (this.state.config.token) {
      for (const job of Object.values(this.state.jobs)) if (job.pendingReport && job.status !== 'recording') await this.flushReport(job);
      const remote = await this.api('/poll', { ready: this.ready() });
      if (remote.enabled && remote.currentLesson) {
        const next = await this.api('/resume', { id: remote.currentLesson.id });
        await this.start(next);
        this.clearRestartResume(remote.currentLesson.occurrence?.key);
        return;
      }
    }
    throw new Error('Активный урок не найден. Подключитесь к занятию на платформе; запись начнётся автоматически.');
  }
  clearRestartResume(occurrenceKey) {
    for (const job of Object.values(this.state.jobs)) {
      if (job.resumeAfterRestart && job.occurrence?.key === occurrenceKey) delete job.resumeAfterRestart;
    }
    this.save();
  }
  async enforceDeadline() {
    const active = this.active();
    if (!active || this.restartJobs.has(active.id)) return;
    const deadline = recordingDeadline(active);
    if (active.cutoffAt !== deadline) { active.cutoffAt = deadline; this.save(); }
    // StartRecord owns a pending start; start() checks the boundary again as
    // soon as OBS confirms. A slow platform request never owns this timer.
    if (active.status !== 'starting' && (deadline <= this.now() || active.status === 'stopping')) await this.stop(active);
  }
  async reconcileActive() {
    const active = this.active();
    // A network outage does not bypass the local safety cutoff.
    if (active) {
      const deadline = recordingDeadline(active);
      if (active.cutoffAt !== deadline) { active.cutoffAt = deadline; this.save(); }
      // A persisted active job is not proof that OBS survived a PC restart.
      // Launch is idempotent and leaves an already-running OBS output intact.
      if (this.restartJobs.has(active.id) || (this.obs.connected === false && active.status !== 'stopping' && active.cutoffAt > this.now())) await this.obs.launch();
      if (active.cutoffAt <= this.now() || active.status === 'stopping') await this.stop(active);
      else await this.recover(active);
      this.restartJobs.delete(active.id);
    }
  }
  async tick() {
    await this.reconcileActive();
    if (!this.state.config.token) return;
    for (const job of Object.values(this.state.jobs)) if (job.pendingReport && job.status !== 'recording') await this.flushReport(job);
    const remote = await this.api('/poll', { ready: this.ready() });
    // Complete the old file before considering the next lesson, regardless of
    // server ordering. Uploading that file is independent of the next capture.
    this.currentLesson = remote.currentLesson || null;
    const active = this.active();
    if (active && !active.pythonTheory && !active.mockReview
      && active.occurrence?.key && remote.currentLesson?.occurrence?.key
      && active.occurrence.key !== remote.currentLesson.occurrence.key) await this.stop(active);
    for (const job of Object.values(this.state.jobs)) {
      if (!job.resumeAfterRestart) continue;
      if (recordingDeadline(job) <= this.now() || (remote.currentLesson && remote.currentLesson.occurrence?.key !== job.occurrence?.key)) {
        delete job.resumeAfterRestart; this.save(); continue;
      }
      // Wait until the teacher rejoins the same lesson. The server validates
      // the live call and returns an idempotent, bound continuation.
      if (this.active() || !remote.enabled || !this.ready() || !job.occurrence?.key
        || remote.currentLesson?.occurrence?.key !== job.occurrence.key) continue;
      const next = await this.api('/resume', { id: remote.currentLesson.id });
      try { await this.start(next); }
      finally {
        if (['starting', 'recording'].includes(this.state.jobs[next.id]?.status)) this.clearRestartResume(job.occurrence.key);
      }
    }
    for (const wanted of remote.jobs) {
      const local = this.state.jobs[wanted.id];
      // Refresh display metadata without changing the file name or lesson binding.
      if (local && typeof wanted.lessonName === 'string') local.lessonName = wanted.lessonName;
      if (local) local.lessonTopic=wanted.lessonTopic || null;
      if (local?.status === 'recording' && wanted.desired === 'record'
        && !local.fallbackMode && !local.pythonTheory && !local.mockReview
        && ['platform', 'telemost'].includes(wanted.audioMode) && local.audioMode !== wanted.audioMode) {
        // A validated transport handoff changes conversation audio, not the
        // recording ID, file, scene or microphone. The audio check applies it
        // only after verifying the actual OBS output owner.
        local.audioMode = wanted.audioMode; this.save();
      }
      if (wanted.desired === 'stop' && local && !local.fallbackMode && ['starting', 'recording', 'stopping'].includes(local.status)) await this.stop(local);
    }
    for (const wanted of remote.jobs) {
      const local = this.state.jobs[wanted.id];
      if (wanted.desired === 'stop') continue;
      if (!remote.enabled || !this.ready() || recordingDeadline(wanted) <= this.now()) continue;
      if (!local && !this.active()) await this.start(wanted);
      else if (local?.status === 'recording' && !local.fallbackMode) await this.report(local, 'recording');
    }
    for (const job of Object.values(this.state.jobs)) {
      // A saved file must eventually appear on the platform even with automatic upload off.
      if (job.pendingReport && job.status !== 'recording') await this.flushReport(job);
    }
  }
}
