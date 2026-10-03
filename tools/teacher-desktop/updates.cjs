'use strict';
const { readRecorderState } = require('./recorder-status.cjs');

const UPDATE_FEED = 'https://github.com/mentalist01/platform/releases/download/teacher-desktop-updates';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 2 * 60 * 1000;

function recorderBusy(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.jobs)) throw new Error('Unknown recorder state');
  return Boolean(state.obs?.outputActive || state.uploadingId || state.preparingUpload || state.updater?.busy
    || state.jobs.some(job => ['starting', 'recording', 'stopping'].includes(job.status)));
}

// Read only the local helper. Never stop OBS, an upload, or the recorder to update the app.
async function readRecorderBusy() {
  const state = await readRecorderState();
  return state ? recorderBusy(state) : false;
}

class TeacherAppUpdates {
  constructor({ updater, app, report, isBusy = readRecorderBusy, enabled = app.isPackaged }) {
    Object.assign(this, { updater, app, report, isBusy, enabled });
    this.state = { status: enabled ? 'idle' : 'development', version: '', percent: 0 };
    this.checking = false;
    this.downloading = false;
    this.available = false;
    this.quitPreparing = false;
    this.quitApproved = false;
    this.sessionEnding = false;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.autoRunAppAfterInstall = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.disableDifferentialDownload = true;
    updater.logger = null; // Keep device paths and network errors out of the cabinet and console.
    updater.on('checking-for-update', () => this.setState({ status: 'checking' }));
    updater.on('update-not-available', () => { this.available = false; this.setState({ status: 'current', version: '', percent: 0 }); });
    updater.on('update-available', info => { this.available = true; this.setState({ status: 'available', version: info.version, percent: 0 }); });
    updater.on('download-progress', progress => this.setState({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))) }));
    updater.on('update-downloaded', info => { this.available = false; this.setState({ status: 'ready', version: info.version, percent: 100 }); });
    updater.on('error', () => { this.quitApproved = false; this.setState({ status: 'error' }); });
  }
  setState(value) { this.state = { ...this.state, ...value }; this.report(this.state); }
  start() {
    this.report(this.state);
    if (!this.enabled) return;
    this.startTimer = setTimeout(() => void this.check(), 15000);
    this.checkTimer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    this.retryTimer = setInterval(() => { if (this.available) void this.downloadWhenIdle(); }, RETRY_INTERVAL_MS);
    for (const timer of [this.startTimer, this.checkTimer, this.retryTimer]) timer.unref?.();
  }
  stop() { clearTimeout(this.startTimer); clearInterval(this.checkTimer); clearInterval(this.retryTimer); }
  async check() {
    if (!this.enabled || this.checking || this.downloading || this.state.status === 'ready' || this.quitPreparing || this.quitApproved) return;
    this.checking = true;
    try { await this.updater.checkForUpdates(); } catch { this.setState({ status: 'error' }); }
    finally { this.checking = false; }
    if (this.available) await this.downloadWhenIdle();
  }
  async downloadWhenIdle() {
    if (!this.available || this.downloading || this.quitPreparing || this.quitApproved) return;
    this.downloading = true;
    try {
      if (await this.isBusy()) { this.setState({ status: 'waiting' }); return; }
      this.setState({ status: 'downloading', percent: 0 });
      await this.updater.downloadUpdate();
    } catch { this.setState({ status: 'error' }); }
    finally { this.downloading = false; }
  }
  async apply() {
    if (!this.enabled || this.quitPreparing || this.quitApproved) return;
    if (this.state.status !== 'ready') { await this.check(); return; }
    try {
      if (await this.isBusy()) { this.setState({ status: 'ready', waitingToInstall: true }); return; }
      this.setState({ status: 'installing', waitingToInstall: false });
      this.updater.autoInstallOnAppQuit = false;
      this.quitApproved = true;
      this.updater.quitAndInstall(true, true);
    } catch { this.quitApproved = false; this.setState({ status: 'error' }); }
  }
  onSessionEnd() { this.sessionEnding = true; this.updater.autoInstallOnAppQuit = false; }
  deferQuit(event) {
    if (!this.enabled || this.sessionEnding || this.quitApproved) return false;
    if (this.state.status !== 'ready') {
      // A download finishing during shutdown must not bypass the recorder check.
      this.updater.autoInstallOnAppQuit = false;
      this.quitApproved = true;
      return false;
    }
    event.preventDefault();
    if (this.quitPreparing) return true;
    this.quitPreparing = true;
    this.stop();
    void this.prepareQuit();
    return true;
  }
  async prepareQuit() {
    // The user initiated quit. If the recorder is busy or cannot be checked, keep
    // the downloaded update cached and let the app close without installing it.
    let idle = false;
    try { idle = !await this.isBusy(); } catch { /* Retry installation on a later normal quit. */ }
    this.updater.autoInstallOnAppQuit = idle && !this.sessionEnding;
    this.quitApproved = true;
    this.app.quit();
  }
}
module.exports = { UPDATE_FEED, recorderBusy, readRecorderBusy, TeacherAppUpdates };
